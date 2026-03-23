export const ADMIN_ONLY_CHAT_MODEL = "anthropic/claude-sonnet-4-6";

export function isAdminOnlyChatModel(model: string | null | undefined): boolean {
  return model?.trim() === ADMIN_ONLY_CHAT_MODEL;
}
