export function sanitizeReturnPath(value: string | null | undefined, fallback = "/chat"): string {
  if (!value) {
    return fallback;
  }

  if (!value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  try {
    const parsed = new URL(value, "http://localhost");
    const normalizedPath = parsed.pathname;

    if (
      normalizedPath === "/login" ||
      normalizedPath.startsWith("/api/auth") ||
      normalizedPath.startsWith("/api/control-plane/auth") ||
      normalizedPath.startsWith("/api/instance/auth")
    ) {
      return fallback;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
