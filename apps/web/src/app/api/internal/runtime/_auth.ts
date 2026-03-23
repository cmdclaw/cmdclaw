import {
  conversationRuntimeService,
  type AuthorizedRuntimeContext,
} from "@cmdclaw/core/server/services/conversation-runtime-service";

export async function authorizeRuntimeTurn(params: {
  runtimeId: string;
  turnSeq: number;
  authorizationHeader: string | null;
}): Promise<AuthorizedRuntimeContext> {
  return await conversationRuntimeService.authorizeRuntimeTurn(params);
}
