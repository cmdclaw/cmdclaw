import { db } from "@cmdclaw/db/client";
import { generation } from "@cmdclaw/db/schema";
import { eq } from "drizzle-orm";

export type AuthorizedRuntimeGeneration = {
  generationId: string;
  conversationId: string;
  userId: string;
};

export async function authorizeRuntimeGeneration(params: {
  generationId: string;
  authorizationHeader: string | null;
}): Promise<AuthorizedRuntimeGeneration | null> {
  const token = params.authorizationHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return null;
  }

  const record = await db.query.generation.findFirst({
    where: eq(generation.id, params.generationId),
    with: {
      conversation: {
        columns: {
          id: true,
          userId: true,
        },
      },
    },
    columns: {
      id: true,
      runtimeCallbackToken: true,
    },
  });

  if (!record?.runtimeCallbackToken || record.runtimeCallbackToken !== token) {
    return null;
  }

  if (!record.conversation?.userId) {
    return null;
  }

  return {
    generationId: record.id,
    conversationId: record.conversation.id,
    userId: record.conversation.userId,
  };
}
