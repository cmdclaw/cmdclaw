export function sanitizeReturnPath(value: string | null | undefined, fallback = "/chat"): string {
  if (!value) {
    return fallback;
  }

  if (!value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  return value;
}
