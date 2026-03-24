const DEFAULT_LIVE_E2E_MODEL = "openai/gpt-5.4-mini";

/**
 * Resolve the model used by live chat E2E tests.
 * Priority:
 * 1) E2E_CHAT_MODEL env override
 * 2) GPT-5.4 Mini shared default
 */
export function resolveLiveE2EModel(): Promise<string> {
  const configured = process.env.E2E_CHAT_MODEL?.trim();
  if (configured) {
    return Promise.resolve(configured);
  }

  return Promise.resolve(DEFAULT_LIVE_E2E_MODEL);
}
