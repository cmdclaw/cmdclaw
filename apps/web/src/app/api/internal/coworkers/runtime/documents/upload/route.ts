import { db } from "@cmdclaw/db/client";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { uploadCoworkerDocument } from "@/server/services/coworker-document";
import { authorizeRuntimeTurn } from "../../../../runtime/_auth";

export const runtime = "nodejs";

const requestSchema = z.object({
  runtimeId: z.string().min(1),
  turnSeq: z.number().int().positive(),
  coworkerId: z.string().min(1),
  filename: z.string().min(1).max(256),
  mimeType: z.string().min(1),
  content: z.string().min(1),
  description: z.string().max(1024).optional(),
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

    const document = await uploadCoworkerDocument({
      database: db,
      userId: authorized.userId,
      coworkerId: parsed.data.coworkerId,
      filename: parsed.data.filename,
      mimeType: parsed.data.mimeType,
      contentBase64: parsed.data.content,
      description: parsed.data.description,
    });

    return Response.json({ document });
  } catch (error) {
    if (error instanceof ORPCError) {
      const status = error.code === "NOT_FOUND" ? 404 : error.code === "BAD_REQUEST" ? 400 : 500;
      return Response.json({ error: error.message }, { status });
    }

    console.error("[Internal] coworker runtime upload document error:", error);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
