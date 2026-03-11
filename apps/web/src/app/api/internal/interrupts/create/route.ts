import { generationInterruptService } from "@cmdclaw/core/server/services/generation-interrupt-service";
import { generationManager } from "@cmdclaw/core/server/services/generation-manager";
import { db } from "@cmdclaw/db/client";
import { generation } from "@cmdclaw/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

export const runtime = "nodejs";

const interruptCreateSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("plugin_write"),
    generationId: z.string().min(1),
    integration: z.enum([
      "google_gmail",
      "outlook",
      "outlook_calendar",
      "google_calendar",
      "google_docs",
      "google_sheets",
      "google_drive",
      "notion",
      "linear",
      "github",
      "airtable",
      "slack",
      "hubspot",
      "linkedin",
      "salesforce",
      "dynamics",
      "reddit",
      "twitter",
    ]),
    operation: z.string().min(1),
    command: z.string().optional(),
    toolInput: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    kind: z.literal("auth"),
    generationId: z.string().min(1),
    integration: z.enum([
      "google_gmail",
      "outlook",
      "outlook_calendar",
      "google_calendar",
      "google_docs",
      "google_sheets",
      "google_drive",
      "notion",
      "linear",
      "github",
      "airtable",
      "slack",
      "hubspot",
      "linkedin",
      "salesforce",
      "dynamics",
      "reddit",
      "twitter",
    ]),
    reason: z.string().optional(),
  }),
]);

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
    const parsed = interruptCreateSchema.safeParse(await request.json());
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

    const generationRecord = await db.query.generation.findFirst({
      where: eq(generation.id, input.generationId),
      with: { conversation: true },
    });
    if (!generationRecord) {
      return Response.json({ error: "generation_not_found" }, { status: 404 });
    }

    const allowedIntegrations = await generationManager.getAllowedIntegrationsForGeneration(
      input.generationId,
    );
    if (Array.isArray(allowedIntegrations) && !allowedIntegrations.includes(input.integration)) {
      return Response.json({ error: "integration_not_allowed" }, { status: 403 });
    }

    if (input.kind === "plugin_write") {
      const created = await generationManager.requestPluginApproval(input.generationId, {
        integration: input.integration,
        operation: input.operation,
        command: input.command ?? "",
        toolInput: input.toolInput ?? {},
      });

      if (created.decision === "allow") {
        return Response.json({ status: "accepted" as const });
      }
      if (created.decision !== "pending" || !created.toolUseId) {
        return Response.json({ status: "rejected" as const });
      }

      const interrupt = await generationInterruptService.findPendingInterruptByToolUseId({
        generationId: input.generationId,
        providerToolUseId: created.toolUseId,
      });
      if (!interrupt) {
        return Response.json({ error: "interrupt_not_found" }, { status: 500 });
      }

      return Response.json({
        interruptId: interrupt.id,
        status: "pending" as const,
        expiresAt: created.expiresAt,
      });
    }

    const created = await generationManager.requestAuthInterrupt(input.generationId, {
      integration: input.integration,
      reason: input.reason,
    });

    if (created.status === "accepted") {
      return Response.json({ status: "accepted" as const });
    }

    return Response.json(created);
  } catch (error) {
    console.error("[Internal] interrupt create error:", error);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
