import {
  listLocalRemoteIntegrationUsers,
  remoteIntegrationUserSummarySchema,
} from "@cmdclaw/core/server/integrations/remote-integrations";
import { z } from "zod";
import { env } from "@/env";

const requestSchema = z.object({
  query: z.string().default(""),
  limit: z.number().int().min(1).max(25).optional(),
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

    const users = await listLocalRemoteIntegrationUsers(parsed.data);
    return Response.json({
      users: users.map((entry) => remoteIntegrationUserSummarySchema.parse(entry)),
    });
  } catch (error) {
    console.error("[Internal] remote integration user search error:", error);
    return Response.json({ error: "Failed to search remote integration users" }, { status: 500 });
  }
}
