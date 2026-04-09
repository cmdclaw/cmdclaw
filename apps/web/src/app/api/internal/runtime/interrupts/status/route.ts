import { getTokensForIntegrations } from "@cmdclaw/core/server/integrations/cli-env";
import { generationInterruptService } from "@cmdclaw/core/server/services/generation-interrupt-service";
import { db } from "@cmdclaw/db/client";
import { generation } from "@cmdclaw/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { authorizeRuntimeTurn } from "../../_auth";

export const runtime = "nodejs";

const interruptStatusSchema = z.object({
  runtimeId: z.string().min(1),
  turnSeq: z.number().int().positive(),
  interruptId: z.string().min(1),
});

function buildAuthErrorResponse(
  reason: "invalid_token" | "runtime_not_found" | "runtime_not_active" | "stale_turn",
): Response {
  if (reason === "stale_turn") {
    return Response.json({ error: "stale_turn" }, { status: 409 });
  }
  if (reason === "runtime_not_found") {
    return Response.json({ error: "runtime_not_found" }, { status: 404 });
  }
  if (reason === "runtime_not_active") {
    return Response.json({ error: "runtime_not_active" }, { status: 409 });
  }
  return Response.json({ error: "invalid_callback_token" }, { status: 401 });
}

export async function POST(request: Request) {
  try {
    const parsed = interruptStatusSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }
    const input = parsed.data;

    const authorized = await authorizeRuntimeTurn({
      runtimeId: input.runtimeId,
      turnSeq: input.turnSeq,
      authorizationHeader: request.headers.get("authorization"),
    });
    if (!authorized.ok) {
      return buildAuthErrorResponse(authorized.reason);
    }

    const interrupt = await generationInterruptService.getInterrupt(input.interruptId);
    if (
      !interrupt ||
      interrupt.generationId !== authorized.generationId ||
      interrupt.runtimeId !== authorized.runtimeId ||
      interrupt.turnSeq !== authorized.turnSeq
    ) {
      return Response.json({ error: "interrupt_not_found" }, { status: 404 });
    }

    if (interrupt.kind === "auth" && interrupt.status === "accepted") {
      await generationInterruptService.markInterruptApplied(interrupt.id);
      const generationRecord = await db.query.generation.findFirst({
        where: eq(generation.id, interrupt.generationId),
        with: { conversation: true },
      });
      const integration =
        interrupt.responsePayload?.integration ?? interrupt.display.authSpec?.integrations[0];
      const tokens =
        generationRecord?.conversation.userId && integration
          ? await getTokensForIntegrations(generationRecord.conversation.userId, [integration])
          : undefined;
      return Response.json({
        interruptId: interrupt.id,
        status: interrupt.status,
        resolutionPayload: {
          ...interrupt.responsePayload,
          tokens,
        },
      });
    }

    if (interrupt.kind === "plugin_write" && interrupt.status === "accepted") {
      await generationInterruptService.markInterruptApplied(interrupt.id);
    }

    return Response.json({
      interruptId: interrupt.id,
      status: interrupt.status,
      resolutionPayload: interrupt.responsePayload ?? undefined,
    });
  } catch (error) {
    console.error("[Internal] runtime interrupt status error:", error);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
