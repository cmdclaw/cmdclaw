import { getTokensForIntegrations } from "@cmdclaw/core/server/integrations/cli-env";
import { generationInterruptService } from "@cmdclaw/core/server/services/generation-interrupt-service";
import { db } from "@cmdclaw/db/client";
import { generation } from "@cmdclaw/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

export const runtime = "nodejs";

const interruptStatusSchema = z.object({
  generationId: z.string().min(1),
  interruptId: z.string().min(1),
});

async function verifyGenerationCallbackToken(
  generationId: string,
  requestAuthHeader: string | null,
): Promise<boolean> {
  const token = requestAuthHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return false;
  }
  const record = await db.query.generation.findFirst({
    where: eq(generation.id, generationId),
    columns: { runtimeCallbackToken: true },
  });
  return !!record?.runtimeCallbackToken && record.runtimeCallbackToken === token;
}

export async function POST(request: Request) {
  try {
    const parsed = interruptStatusSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }
    const input = parsed.data;

    if (
      !(await verifyGenerationCallbackToken(
        input.generationId,
        request.headers.get("authorization"),
      ))
    ) {
      return Response.json({ error: "invalid_callback_token" }, { status: 401 });
    }

    const interrupt = await generationInterruptService.getInterrupt(input.interruptId);
    if (!interrupt || interrupt.generationId !== input.generationId) {
      return Response.json({ error: "interrupt_not_found" }, { status: 404 });
    }

    if (interrupt.kind === "auth" && interrupt.status === "accepted") {
      const generationRecord = await db.query.generation.findFirst({
        where: eq(generation.id, input.generationId),
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

    return Response.json({
      interruptId: interrupt.id,
      status: interrupt.status,
      resolutionPayload: interrupt.responsePayload ?? undefined,
    });
  } catch (error) {
    console.error("[Internal] interrupt status error:", error);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
