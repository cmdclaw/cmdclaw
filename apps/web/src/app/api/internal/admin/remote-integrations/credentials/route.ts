import {
  getLocalRemoteIntegrationCredentials,
  remoteIntegrationCredentialsResponseSchema,
  remoteIntegrationTypeSchema,
} from "@cmdclaw/core/server/integrations/remote-integrations";
import { z } from "zod";
import { env } from "@/env";

const requestSchema = z.object({
  remoteUserId: z.string().min(1),
  integrationTypes: z.array(remoteIntegrationTypeSchema).default([]),
  requestedByUserId: z.string().min(1).optional(),
  requestedByEmail: z.string().email().nullable().optional(),
});

function isAuthorized(request: Request): boolean {
  const expected = env.CMDCLAW_SERVER_SECRET ? `Bearer ${env.CMDCLAW_SERVER_SECRET}` : "";
  return Boolean(expected) && request.headers.get("authorization") === expected;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const credentials = await getLocalRemoteIntegrationCredentials({
      remoteUserId: parsed.data.remoteUserId,
      integrationTypes: parsed.data.integrationTypes,
    });

    console.info("[Internal] remote integration credentials issued", {
      targetUserId: credentials.remoteUserId,
      targetUserEmail: credentials.remoteUserEmail,
      requestedByUserId: parsed.data.requestedByUserId ?? null,
      requestedByEmail: parsed.data.requestedByEmail ?? null,
      enabledIntegrations: credentials.enabledIntegrations,
    });

    return Response.json(remoteIntegrationCredentialsResponseSchema.parse(credentials));
  } catch (error) {
    if (error instanceof Error && error.message === "Remote integration user not found") {
      return Response.json({ error: error.message }, { status: 404 });
    }

    console.error("[Internal] remote integration credential fetch error:", error);
    return Response.json(
      { error: "Failed to fetch remote integration credentials" },
      { status: 500 },
    );
  }
}
