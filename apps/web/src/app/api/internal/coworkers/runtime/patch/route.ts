import { buildCoworkerPatchApplyEnvelope } from "@cmdclaw/core/lib/coworker-runtime-cli";
import {
  applyCoworkerPatch,
  coworkerBuilderPatchSchema,
  resolveCoworkerBuilderContextByConversation,
  type CoworkerPatchApplyResult,
} from "@cmdclaw/core/server/services/coworker-builder-service";
import { db } from "@cmdclaw/db/client";
import { user } from "@cmdclaw/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { authorizeRuntimeTurn } from "../../../runtime/_auth";

export const runtime = "nodejs";

const requestSchema = z.object({
  runtimeId: z.string().min(1),
  turnSeq: z.number().int().positive(),
  coworkerId: z.string().min(1),
  baseUpdatedAt: z.string().datetime({ offset: true }),
  patch: coworkerBuilderPatchSchema,
});

export async function POST(request: Request) {
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }

    const authorized = await authorizeRuntimeTurn({
      runtimeId: parsed.data.runtimeId,
      turnSeq: parsed.data.turnSeq,
      authorizationHeader: request.headers.get("authorization"),
    });
    if (!authorized.ok) {
      if (authorized.reason === "stale_turn") {
        return Response.json({ error: "stale_turn" }, { status: 409 });
      }
      return Response.json({ error: "invalid_callback_token" }, { status: 401 });
    }

    const builderContext = await resolveCoworkerBuilderContextByConversation({
      database: db,
      userId: authorized.userId,
      conversationId: authorized.conversationId,
    });
    if (!builderContext || builderContext.coworkerId !== parsed.data.coworkerId) {
      return Response.json({ error: "coworker_builder_context_not_found" }, { status: 404 });
    }

    const dbUser = await db.query.user.findFirst({
      where: eq(user.id, authorized.userId),
      columns: { role: true },
    });

    const result: CoworkerPatchApplyResult = await applyCoworkerPatch({
      database: db,
      userId: authorized.userId,
      userRole: dbUser?.role ?? null,
      coworkerId: parsed.data.coworkerId,
      baseUpdatedAt: parsed.data.baseUpdatedAt,
      patch: parsed.data.patch,
    });

    return Response.json({
      patch: buildCoworkerPatchApplyEnvelope({
        coworkerId: parsed.data.coworkerId,
        result,
      }),
    });
  } catch (error) {
    console.error("[Internal] coworker runtime patch error:", error);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
