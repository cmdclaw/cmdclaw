import type {
  ConversationRuntimeContext,
  ConversationRuntimeOptions,
  ConversationRuntimeResult,
} from "@/server/sandbox/core/types";
import {
  persistConversationRuntimeSelection,
  persistGenerationRuntimeSelection,
} from "@/server/sandbox/selection/persistence";
import { resolveRuntimeSelection } from "@/server/sandbox/selection/policy-resolver";
import { runConversationSessionPipeline } from "./session-pipeline";

export async function getOrCreateConversationRuntime(
  context: ConversationRuntimeContext,
  options?: ConversationRuntimeOptions,
): Promise<ConversationRuntimeResult> {
  const selection = resolveRuntimeSelection({
    sandboxProviderOverride: options?.sandboxProviderOverride,
  });

  const result = await runConversationSessionPipeline({
    context,
    selection,
    options,
  });

  const withSelection: ConversationRuntimeResult = {
    ...result,
    metadata: selection,
  };

  await Promise.all([
    persistGenerationRuntimeSelection({
      generationId: context.generationId,
      selection,
    }),
    persistConversationRuntimeSelection({
      conversationId: context.conversationId,
      selection,
    }),
  ]);

  return withSelection;
}
