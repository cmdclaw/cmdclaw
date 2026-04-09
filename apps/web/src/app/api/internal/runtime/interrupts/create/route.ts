import { generationInterruptService } from "@cmdclaw/core/server/services/generation-interrupt-service";
import { generationManager } from "@cmdclaw/core/server/services/generation-manager";
import { db } from "@cmdclaw/db/client";
import { generation } from "@cmdclaw/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { authorizeRuntimeTurn } from "../../_auth";

export const runtime = "nodejs";

const interruptCreateSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("plugin_write"),
    runtimeId: z.string().min(1),
    turnSeq: z.number().int().positive(),
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
    providerRequestId: z.string().min(1).optional(),
    runtimeTool: z
      .object({
        sessionId: z.string().min(1).optional(),
        messageId: z.string().min(1),
        partId: z.string().min(1),
        callId: z.string().min(1),
        toolName: z.string().min(1),
        input: z.record(z.string(), z.unknown()),
      })
      .optional(),
  }),
  z.object({
    kind: z.literal("auth"),
    runtimeId: z.string().min(1),
    turnSeq: z.number().int().positive(),
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
    const parsed = interruptCreateSchema.safeParse(await request.json());
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

    const generationRecord = await db.query.generation.findFirst({
      where: eq(generation.id, authorized.generationId),
      with: { conversation: true },
    });
    if (!generationRecord) {
      return Response.json({ error: "generation_not_found" }, { status: 404 });
    }

    const allowedIntegrations = await generationManager.getAllowedIntegrationsForGeneration(
      authorized.generationId,
    );
    if (Array.isArray(allowedIntegrations) && !allowedIntegrations.includes(input.integration)) {
      return Response.json({ error: "integration_not_allowed" }, { status: 403 });
    }

    if (input.kind === "plugin_write") {
      const created = await generationManager.requestPluginApproval(authorized.generationId, {
        integration: input.integration,
        operation: input.operation,
        command: input.command ?? "",
        toolInput: input.toolInput ?? {},
        providerRequestId: input.providerRequestId,
        runtimeTool: input.runtimeTool,
      });

      if (created.decision === "allow") {
        return Response.json({ status: "accepted" as const });
      }
      if (created.decision !== "pending" || !created.toolUseId) {
        return Response.json({ status: "rejected" as const });
      }

      const interrupt = await generationInterruptService.findPendingInterruptByToolUseId({
        generationId: authorized.generationId,
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

    const created = await generationManager.requestAuthInterrupt(authorized.generationId, {
      integration: input.integration,
      reason: input.reason,
    });

    if (created.status === "accepted") {
      return Response.json({ status: "accepted" as const });
    }

    return Response.json(created);
  } catch (error) {
    console.error("[Internal] runtime interrupt create error:", error);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
