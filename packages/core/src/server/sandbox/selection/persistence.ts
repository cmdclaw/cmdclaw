import { eq } from "drizzle-orm";
import type { RuntimeSelection } from "../core/types";
import { db } from "@cmdclaw/db/client";
import { conversation, generation } from "@cmdclaw/db/schema";

export async function persistGenerationRuntimeSelection(input: {
  generationId?: string;
  selection: RuntimeSelection;
}): Promise<void> {
  if (!input.generationId) {
    return;
  }

  await db
    .update(generation)
    .set({
      sandboxProvider: input.selection.sandboxProvider,
      runtimeHarness: input.selection.runtimeHarness,
      runtimeProtocolVersion: input.selection.runtimeProtocolVersion,
    })
    .where(eq(generation.id, input.generationId));
}

export async function persistConversationRuntimeSelection(input: {
  conversationId: string;
  selection: RuntimeSelection;
}): Promise<void> {
  await db
    .update(conversation)
    .set({
      lastSandboxProvider: input.selection.sandboxProvider,
      lastRuntimeHarness: input.selection.runtimeHarness,
    })
    .where(eq(conversation.id, input.conversationId));
}
