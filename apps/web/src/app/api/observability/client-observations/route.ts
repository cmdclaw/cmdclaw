import { clientObservationSchema } from "@cmdclaw/core/lib/client-observation";
import { emitClientObservation } from "@cmdclaw/core/server/utils/observability";
import { db } from "@cmdclaw/db/client";
import { conversation, generation } from "@cmdclaw/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { requireActiveWorkspaceAccess } from "@/server/orpc/workspace-access";

export const runtime = "nodejs";

const clientObservationsRequestSchema = z.object({
  observations: z.array(clientObservationSchema).min(1).max(20),
});

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_EVENTS = 120;

const globalRateLimitState = globalThis as typeof globalThis & {
  __cmdclawClientObservationRateLimit?: Map<string, { count: number; resetAt: number }>;
};

function getRateLimitStore(): Map<string, { count: number; resetAt: number }> {
  globalRateLimitState.__cmdclawClientObservationRateLimit ??= new Map();
  return globalRateLimitState.__cmdclawClientObservationRateLimit;
}

function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

function isRateLimited(key: string, eventCount: number): boolean {
  const now = Date.now();
  const store = getRateLimitStore();
  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    store.set(key, { count: eventCount, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  current.count += eventCount;
  return current.count > RATE_LIMIT_MAX_EVENTS;
}

async function verifyConversationAccess(args: {
  conversationId: string;
  userId: string;
  workspaceId: string;
}): Promise<boolean> {
  const row = await db.query.conversation.findFirst({
    where: and(
      eq(conversation.id, args.conversationId),
      eq(conversation.userId, args.userId),
      eq(conversation.workspaceId, args.workspaceId),
    ),
    columns: { id: true },
  });
  return Boolean(row);
}

async function verifyGenerationAccess(args: {
  generationId: string;
  conversationId?: string;
  userId: string;
  workspaceId: string;
}): Promise<{ ok: boolean; conversationId?: string }> {
  const row = await db.query.generation.findFirst({
    where: eq(generation.id, args.generationId),
    columns: {
      id: true,
      conversationId: true,
    },
    with: {
      conversation: {
        columns: {
          userId: true,
          workspaceId: true,
        },
      },
    },
  });

  if (
    !row ||
    row.conversation.userId !== args.userId ||
    row.conversation.workspaceId !== args.workspaceId ||
    (args.conversationId && row.conversationId !== args.conversationId)
  ) {
    return { ok: false };
  }

  return { ok: true, conversationId: row.conversationId };
}

export async function POST(request: Request) {
  const sessionData = await auth.api.getSession({ headers: request.headers });
  if (!sessionData?.user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = clientObservationsRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: "invalid_observation" }, { status: 400 });
  }

  const access = await requireActiveWorkspaceAccess(sessionData.user.id);
  const ip = getClientIp(request);
  const sessionId = sessionData.session?.id ?? "unknown-session";
  const rateLimitKey = `${sessionData.user.id}:${sessionId}:${ip}`;
  if (isRateLimited(rateLimitKey, parsed.data.observations.length)) {
    return Response.json({ ok: true, rateLimited: true });
  }

  const verifiedObservations = await Promise.all(
    parsed.data.observations.map(async (observation) => {
      let resolvedConversationId = observation.conversationId;
      if (observation.generationId) {
        const generationAccess = await verifyGenerationAccess({
          generationId: observation.generationId,
          conversationId: observation.conversationId,
          userId: sessionData.user.id,
          workspaceId: access.workspace.id,
        });
        if (!generationAccess.ok) {
          return { ok: false as const };
        }
        resolvedConversationId = generationAccess.conversationId ?? resolvedConversationId;
      } else if (observation.conversationId) {
        const ok = await verifyConversationAccess({
          conversationId: observation.conversationId,
          userId: sessionData.user.id,
          workspaceId: access.workspace.id,
        });
        if (!ok) {
          return { ok: false as const };
        }
      }
      return { ok: true as const, observation, resolvedConversationId };
    }),
  );

  if (verifiedObservations.some((result) => !result.ok)) {
    return Response.json({ error: "resource_not_found" }, { status: 404 });
  }

  for (const verified of verifiedObservations) {
    if (!verified.ok) {
      continue;
    }
    const { observation, resolvedConversationId } = verified;

    emitClientObservation({
      eventId: observation.eventId,
      eventType: observation.eventType,
      timestamp: observation.occurredAt ? new Date(observation.occurredAt) : undefined,
      context: {
        source: "browser",
        traceId: observation.traceId,
        generationId: observation.generationId,
        conversationId: resolvedConversationId,
        userId: sessionData.user.id,
        sessionId,
      },
      attributes: {
        "cmdclaw.client_observation.type": observation.eventType,
        "cmdclaw.client.event_id": observation.eventId,
        "cmdclaw.user.id": sessionData.user.id,
        "cmdclaw.workspace.id": access.workspace.id,
        "cmdclaw.generation.id": observation.generationId,
        "cmdclaw.conversation.id": resolvedConversationId,
        "cmdclaw.client.stream_attempt": observation.streamAttempt,
        "cmdclaw.client.elapsed_ms": observation.elapsedMs,
        "cmdclaw.client.visible_error_code": observation.visibleErrorCode,
        "cmdclaw.client.close_reason": observation.closeReason,
        "cmdclaw.client.page_visibility": observation.pageVisibility,
        "cmdclaw.client.online": observation.online,
      },
    });
  }

  return Response.json({ ok: true });
}
