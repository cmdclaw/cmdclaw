import type { ResolvedProviderAuth } from "../control-plane/subscription-providers";

const HOST_MANAGED_OPENAI_RUNTIME_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type RuntimeProviderAuthPayload =
  | {
      providerID: string;
      auth: {
        type: "api";
        key: string;
      };
    }
  | {
      providerID: string;
      auth: {
        type: "oauth";
        access: string;
        refresh: string;
        expires: number;
      };
    };

export function toRuntimeProviderAuthPayload(
  auth: ResolvedProviderAuth,
): RuntimeProviderAuthPayload {
  if (auth.provider === "kimi" || auth.provider === "google") {
    return {
      providerID: auth.provider === "kimi" ? "kimi-for-coding" : "google",
      auth: {
        type: "api",
        key: auth.accessToken,
      },
    };
  }

  if (auth.provider === "openai") {
    return {
      providerID: auth.provider,
      auth: {
        type: "oauth",
        access: auth.accessToken,
        // Keep OpenAI refresh in CmdClaw so rotated refresh tokens are always
        // persisted centrally instead of being stranded inside sandboxes.
        refresh: "",
        expires: Date.now() + HOST_MANAGED_OPENAI_RUNTIME_TTL_MS,
      },
    };
  }

  return {
    providerID: auth.provider,
    auth: {
      type: "oauth",
      access: auth.accessToken,
      refresh: auth.refreshToken ?? "",
      expires: auth.expiresAt ?? Date.now(),
    },
  };
}
