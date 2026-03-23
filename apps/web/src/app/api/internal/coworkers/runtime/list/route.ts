import { db } from "@cmdclaw/db/client";
import { coworker } from "@cmdclaw/db/schema";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { authorizeRuntimeTurn } from "../../../runtime/_auth";

export const runtime = "nodejs";

const requestSchema = z.object({
  runtimeId: z.string().min(1),
  turnSeq: z.number().int().positive(),
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
