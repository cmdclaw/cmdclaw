import { generationManager } from "@cmdclaw/core/server/services/generation-manager";
import { z } from "zod";
import { env } from "@/env";
import { resolveGenerationIdForInternalCallback } from "@/server/services/internal-callback-generation";

export const runtime = "nodejs";

const approvalStatusSchema = z.object({
  generationId: z.string().optional(),
  sandboxId: z.string().optional(),
  conversationId: z.string().min(1),
  toolUseId: z.string().min(1),
  authHeader: z.string().optional(),
});

function verifyPluginSecret(
  authHeader: string | undefined,
  requestAuthHeader: string | null,
): boolean {
  const providedAuth = authHeader ?? requestAuthHeader ?? undefined;

  if (!env.CMDCLAW_SERVER_SECRET) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[Internal] CMDCLAW_SERVER_SECRET not configured, allowing internal approval status in development",
      );
      return true;
    }
    console.warn("[Internal] CMDCLAW_SERVER_SECRET not configured");
    return false;
  }

  return providedAuth === `Bearer ${env.CMDCLAW_SERVER_SECRET}`;
}

export async function POST(request: Request) {
  try {
    const parsed = approvalStatusSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ decision: "deny" }, { status: 400 });
    }
    const input = parsed.data;

    if (!verifyPluginSecret(input.authHeader, request.headers.get("authorization"))) {
      console.error("[Internal] Invalid plugin auth for approval status");
      return Response.json({ decision: "deny" });
    }

    const genId = await resolveGenerationIdForInternalCallback({
      conversationId: input.conversationId,
      generationId: input.generationId,
      sandboxId: input.sandboxId,
    });
    if (!genId) {
      return Response.json({ decision: "deny" });
    }

    const decision = await generationManager.getPluginApprovalStatus(genId, input.toolUseId);
    return Response.json({ decision });
  } catch (error) {
    console.error("[Internal] approvalStatus error:", error);
    return Response.json({ decision: "deny" }, { status: 500 });
  }
}
