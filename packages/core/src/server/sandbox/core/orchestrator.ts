import type {
  ConversationRuntimeContext,
  ConversationRuntimeOptions,
  ConversationRuntimeResult,
} from "./types";
import {
  persistConversationRuntimeSelection,
  persistGenerationRuntimeSelection,
} from "../selection/persistence";
import { resolveRuntimeSelection } from "../selection/policy-resolver";
import { runConversationSessionPipeline } from "./session-pipeline";

export async function getOrCreateConversationRuntime(
  context: ConversationRuntimeContext,
  options?: ConversationRuntimeOptions,
): Promise<ConversationRuntimeResult> {
  const selection = resolveRuntimeSelection({
    model: context.model,
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
