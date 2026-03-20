import {
  SUBSCRIPTION_PROVIDERS,
  isOAuthProviderConfig,
} from "@cmdclaw/core/server/ai/subscription-providers";
import { isSelfHostedEdition } from "@cmdclaw/core/server/edition";
import { sharedProviderAuth, user } from "@cmdclaw/db/schema";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { deletePending, getPending, storePending } from "@/server/ai/pending-oauth";
import { protectedProcedure, type AuthenticatedContext } from "../middleware";
import { storeSharedProviderTokens } from "./provider-auth";

const providerSchema = z.literal("openai");
const pollProviderSchema = z.object({
  provider: z.literal("openai"),
  flowId: z.string().min(1),
});

const openAIDeviceCodeResponseSchema = z.object({
  device_auth_id: z.string(),
  user_code: z.string(),
  expires_in: z.coerce.number().optional(),
  expires_at: z.string().optional(),
  interval: z.coerce.number().optional(),
});

const openAIDeviceTokenResponseSchema = z.object({
  authorization_code: z.string(),
  code_verifier: z.string(),
});

const openAITokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.coerce.number().optional(),
});

const openAIDeviceFlowStateSchema = z.object({
  deviceAuthId: z.string(),
  userCode: z.string(),
  interval: z.number(),
});

function generateState(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function requestOpenAIDeviceCode(config: {
  clientId: string;
  authUrl: string;
}): Promise<z.infer<typeof openAIDeviceCodeResponseSchema>> {
  const issuer = new URL(config.authUrl).origin;
  const deviceCodeUrl = new URL("/api/accounts/deviceauth/usercode", issuer).toString();

  const response = await fetch(deviceCodeUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "opencode/cmdclaw",
    },
    body: JSON.stringify({ client_id: config.clientId }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `OpenAI device-code request failed (${response.status}): ${text.slice(0, 180)}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("OpenAI device-code response was not JSON");
  }

  return openAIDeviceCodeResponseSchema.parse(parsed);
}

async function requireAdmin(context: Pick<AuthenticatedContext, "db" | "user">) {
  const dbUser = await context.db.query.user.findFirst({
    where: eq(user.id, context.user.id),
    columns: { role: true },
  });

  if (dbUser?.role !== "admin") {
    throw new ORPCError("FORBIDDEN", { message: "Admin access required" });
  }
}

const connect = protectedProcedure
  .input(z.object({ provider: providerSchema }))
  .handler(async ({ input, context }) => {
    await requireAdmin(context);

    if (isSelfHostedEdition()) {
      throw new ORPCError("FORBIDDEN", {
        message: "Shared provider auth is not available in self-hosted edition",
      });
    }

    const config = SUBSCRIPTION_PROVIDERS[input.provider];
    if (!isOAuthProviderConfig(config)) {
      throw new Error(`Provider "${input.provider}" does not support OAuth`);
    }

    const flowId = generateState();
    const device = await requestOpenAIDeviceCode({
      clientId: config.clientId,
      authUrl: config.authUrl,
    });
    const interval = Math.max(device.interval ?? 5, 1);
    const flowState = openAIDeviceFlowStateSchema.parse({
      deviceAuthId: device.device_auth_id,
      userCode: device.user_code,
      interval,
    });

    await storePending(flowId, {
      userId: context.user.id,
      provider: input.provider,
      codeVerifier: JSON.stringify(flowState),
    });

    return {
      mode: "device" as const,
      flowId,
      userCode: device.user_code,
      verificationUri: `${new URL(config.authUrl).origin}/codex/device`,
      verificationUriComplete: `${new URL(config.authUrl).origin}/codex/device`,
      interval,
      expiresIn: device.expires_at
        ? Math.max(Math.floor((new Date(device.expires_at).getTime() - Date.now()) / 1000), 30)
        : (device.expires_in ?? 900),
    };
  });

const poll = protectedProcedure.input(pollProviderSchema).handler(async ({ input, context }) => {
  await requireAdmin(context);

  if (isSelfHostedEdition()) {
    return {
      status: "failed" as const,
      error: "shared_provider_auth_unavailable",
    };
  }

  const pending = await getPending(input.flowId);
  if (!pending || pending.userId !== context.user.id || pending.provider !== input.provider) {
    return {
      status: "failed" as const,
      error: "invalid_state",
    };
  }

  const config = SUBSCRIPTION_PROVIDERS[input.provider];
  if (!isOAuthProviderConfig(config)) {
    return {
      status: "failed" as const,
      error: "invalid_provider",
    };
  }

  const issuer = new URL(config.authUrl).origin;

  let flowState: z.infer<typeof openAIDeviceFlowStateSchema>;
  try {
    flowState = openAIDeviceFlowStateSchema.parse(JSON.parse(pending.codeVerifier));
  } catch {
    await deletePending(input.flowId);
    return { status: "failed" as const, error: "invalid_state_payload" };
  }

  const deviceTokenResponse = await fetch(`${issuer}/api/accounts/deviceauth/token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "opencode/cmdclaw",
    },
    body: JSON.stringify({
      device_auth_id: flowState.deviceAuthId,
      user_code: flowState.userCode,
    }),
  });

  if (deviceTokenResponse.status === 403 || deviceTokenResponse.status === 404) {
    return { status: "pending" as const, interval: flowState.interval + 3 };
  }
  if (!deviceTokenResponse.ok) {
    await deletePending(input.flowId);
    return {
      status: "failed" as const,
      error: `device_token_failed_${deviceTokenResponse.status}`,
    };
  }

  let deviceTokenData: z.infer<typeof openAIDeviceTokenResponseSchema>;
  try {
    deviceTokenData = openAIDeviceTokenResponseSchema.parse(await deviceTokenResponse.json());
  } catch {
    await deletePending(input.flowId);
    return { status: "failed" as const, error: "invalid_device_token_response" };
  }

  const oauthTokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    code: deviceTokenData.authorization_code,
    redirect_uri: `${issuer}/deviceauth/callback`,
    client_id: config.clientId,
    code_verifier: deviceTokenData.code_verifier,
  });

  const tokenResponse = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: oauthTokenBody,
  });

  const text = await tokenResponse.text();
  if (!tokenResponse.ok) {
    await deletePending(input.flowId);
    return { status: "failed" as const, error: `oauth_token_failed_${tokenResponse.status}` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { status: "failed" as const, error: "invalid_token_response" };
  }

  const tokens = openAITokenResponseSchema.parse(parsed);
  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000);

  await storeSharedProviderTokens({
    managedByUserId: context.user.id,
    provider: input.provider,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? "",
    expiresAt,
  });
  await deletePending(input.flowId);

  return { status: "connected" as const };
});

const status = protectedProcedure.handler(async ({ context }) => {
  await requireAdmin(context);

  if (isSelfHostedEdition()) {
    return { connected: {} };
  }

  const auths = await context.db.query.sharedProviderAuth.findMany();
  const connected: Record<string, { connectedAt: Date }> = {};
  for (const auth of auths) {
    connected[auth.provider] = { connectedAt: auth.createdAt };
  }

  return { connected };
});

const disconnect = protectedProcedure
  .input(z.object({ provider: providerSchema }))
  .handler(async ({ input, context }) => {
    await requireAdmin(context);

    if (isSelfHostedEdition()) {
      throw new ORPCError("FORBIDDEN", {
        message: "Shared provider auth is not available in self-hosted edition",
      });
    }

    await context.db
      .delete(sharedProviderAuth)
      .where(eq(sharedProviderAuth.provider, input.provider));

    return { success: true };
  });

export const adminSharedProviderAuthRouter = {
  connect,
  poll,
  status,
  disconnect,
};
