const CHAT_SYSTEM_BEHAVIOR_PROMPT = [
  "When drafting or sending email bodies, do not use Markdown syntax.",
  "Allowed HTML tags for email formatting are: <b>, <strong>, <i>, <em>, <u>, <br>, <p>.",
  "Do not use any other HTML tags for email bodies.",
  "Prefer plain text when formatting is unnecessary.",
].join("\n");

export function getChatSystemBehaviorPrompt(): string | null {
  if (!CHAT_SYSTEM_BEHAVIOR_PROMPT) {
    return null;
  }

  return CHAT_SYSTEM_BEHAVIOR_PROMPT;
}
