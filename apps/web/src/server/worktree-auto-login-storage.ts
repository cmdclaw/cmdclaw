import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

type StoredWorktreeCookie = {
  name?: string;
  value?: string;
  expires?: number;
  httpOnly?: boolean;
  sameSite?: string;
};

type StoredWorktreeState = {
  cookies?: StoredWorktreeCookie[];
};

export type WorktreeSessionCookie = {
  expires: Date | undefined;
  httpOnly: boolean;
  sameSite: "lax" | "strict" | "none";
  value: string;
};

function getStorageStatePath(): string | null {
  const instanceRoot = process.env.CMDCLAW_INSTANCE_ROOT?.trim();
  if (!instanceRoot) {
    return null;
  }

  return join(instanceRoot, "runtime", "auth", "dev-user.storage-state.json");
}

function normalizeSameSite(value: string | undefined): "lax" | "strict" | "none" {
  switch (value?.toLowerCase()) {
    case "none":
      return "none";
    case "strict":
      return "strict";
    default:
      return "lax";
  }
}

function normalizeCookieValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function loadWorktreeSessionCookie(): WorktreeSessionCookie | null {
  const statePath = getStorageStatePath();
  if (!statePath || !existsSync(statePath)) {
    return null;
  }

  try {
    const state = JSON.parse(readFileSync(statePath, "utf8")) as StoredWorktreeState;
    const rawCookie = state.cookies?.find((cookie) => {
      return (
        (cookie.name === "better-auth.session_token" ||
          cookie.name === "__Secure-better-auth.session_token") &&
        typeof cookie.value === "string" &&
        cookie.value.length > 0
      );
    });

    if (!rawCookie?.value) {
      return null;
    }

    return {
      value: normalizeCookieValue(rawCookie.value),
      httpOnly: rawCookie.httpOnly !== false,
      sameSite: normalizeSameSite(rawCookie.sameSite),
      expires:
        typeof rawCookie.expires === "number" && Number.isFinite(rawCookie.expires)
          ? new Date(rawCookie.expires * 1000)
          : undefined,
    };
  } catch (error) {
    console.error("[worktree-auth] failed to read bootstrapped session cookie", error);
    return null;
  }
}
