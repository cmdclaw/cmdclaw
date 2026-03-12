import { normalizeCoworkerUsername } from "@cmdclaw/core/server/services/coworker-metadata";
import { triggerCoworkerRun } from "@cmdclaw/core/server/services/coworker-service";
import { db } from "@cmdclaw/db/client";
import { coworker } from "@cmdclaw/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { authorizeRuntimeGeneration } from "../_auth";

export const runtime = "nodejs";

const attachmentSchema = z.object({
  name: z.string().min(1),
  mimeType: z.string().min(1),
  dataUrl: z.string().min(1),
});

const requestSchema = z.object({
  generationId: z.string().min(1),
  username: z.string().min(1),
  message: z.string().min(1),
  attachments: z.array(attachmentSchema).max(5).optional(),
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

    const normalizedUsername = normalizeCoworkerUsername(parsed.data.username);
    if (!normalizedUsername) {
      return Response.json({ error: "invalid_username" }, { status: 400 });
    }

    const targetCoworker = await db.query.coworker.findFirst({
      where: and(
        eq(coworker.ownerId, authorized.userId),
        eq(coworker.status, "on"),
        eq(coworker.username, normalizedUsername),
      ),
      columns: {
        id: true,
        name: true,
        username: true,
      },
    });

    if (!targetCoworker?.username) {
      const available = await db.query.coworker.findMany({
        where: and(
          eq(coworker.ownerId, authorized.userId),
          eq(coworker.status, "on"),
          isNotNull(coworker.username),
        ),
        columns: {
          username: true,
        },
      });

      return Response.json(
        {
          error: "coworker_not_found",
          username: normalizedUsername,
          availableUsernames: available
            .map((entry) => entry.username)
            .filter((entry): entry is string => typeof entry === "string"),
        },
        { status: 404 },
      );
    }

    const attachments = parsed.data.attachments ?? [];
    const result = await triggerCoworkerRun({
      coworkerId: targetCoworker.id,
      userId: authorized.userId,
      triggerPayload: {
        source: "chat_mention",
        parentGenerationId: authorized.generationId,
        parentConversationId: authorized.conversationId,
        mention: `@${targetCoworker.username}`,
        message: parsed.data.message.trim(),
        attachmentNames: attachments.map((attachment) => attachment.name),
      },
      fileAttachments: attachments,
    });

    return Response.json({
      invocation: {
        kind: "coworker_invocation",
        coworkerId: targetCoworker.id,
        username: targetCoworker.username,
        name: targetCoworker.name,
        runId: result.runId,
        conversationId: result.conversationId,
        generationId: result.generationId,
        status: "running",
        attachmentNames: attachments.map((attachment) => attachment.name),
        message: parsed.data.message.trim(),
      },
    });
  } catch (error) {
    console.error("[Internal] coworker runtime invoke error:", error);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
