import { db } from "@cmdclaw/db/client";
import { coworker } from "@cmdclaw/db/schema";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { authorizeRuntimeGeneration } from "../_auth";

export const runtime = "nodejs";

const requestSchema = z.object({
  generationId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }

    const authorized = await authorizeRuntimeGeneration({
      generationId: parsed.data.generationId,
      authorizationHeader: request.headers.get("authorization"),
    });
    if (!authorized) {
      return Response.json({ error: "invalid_callback_token" }, { status: 401 });
    }

    const coworkers = await db.query.coworker.findMany({
      where: and(
        eq(coworker.ownerId, authorized.userId),
        eq(coworker.status, "on"),
        isNotNull(coworker.username),
      ),
      orderBy: (row) => [desc(row.updatedAt)],
      columns: {
        id: true,
        name: true,
        username: true,
        description: true,
        triggerType: true,
      },
    });

    return Response.json({
      coworkers: coworkers
        .filter(
          (item): item is typeof item & { username: string } => typeof item.username === "string",
        )
        .map((item) => ({
          id: item.id,
          name: item.name,
          username: item.username,
          description: item.description,
          triggerType: item.triggerType,
        })),
    });
  } catch (error) {
    console.error("[Internal] coworker runtime list error:", error);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
