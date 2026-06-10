import { createHmac, timingSafeEqual } from "node:crypto";

export const MANAGED_MCP_TOKEN_TTL_SECONDS = 10 * 60;

export type ManagedMcpTokenClaims = {
  userId: string;
  workspaceId: string;
  internalKey: string;
  exp: number;
  spawnDepth?: number;
  remoteIntegrationSource?: {
    targetEnv: "staging" | "prod";
    remoteUserId: string;
    requestedByUserId?: string;
    requestedByEmail?: string | null;
    remoteUserEmail?: string | null;
  };
};

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signManagedMcpToken(claims: ManagedMcpTokenClaims, secret: string): string {
  if (!secret) {
    throw new Error("Cannot sign a managed MCP token without a secret.");
  }
  const payload = encodeBase64Url(JSON.stringify(claims));
  const signature = signPayload(payload, secret);
  return `${payload}.${signature}`;
}

export function verifyManagedMcpToken(
  token: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): ManagedMcpTokenClaims {
  // Fail closed: an empty secret must never validate a token, otherwise any
  // verify site that passes `?? ""` would accept attacker-forged tokens.
  if (!secret) {
    throw new Error("Cannot verify a managed MCP token without a secret.");
  }
  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    throw new Error("Invalid managed MCP token format.");
  }

  const expectedSignature = signPayload(payload, secret);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    throw new Error("Invalid managed MCP token signature.");
  }

  const parsed = JSON.parse(decodeBase64Url(payload)) as Partial<ManagedMcpTokenClaims>;
  const remoteIntegrationSource = parsed.remoteIntegrationSource;
  if (
    !parsed.userId ||
    !parsed.workspaceId ||
    !parsed.internalKey ||
    typeof parsed.exp !== "number" ||
    (parsed.spawnDepth !== undefined &&
      (typeof parsed.spawnDepth !== "number" ||
        !Number.isInteger(parsed.spawnDepth) ||
        parsed.spawnDepth < 0)) ||
    (remoteIntegrationSource !== undefined &&
      (typeof remoteIntegrationSource !== "object" ||
        (remoteIntegrationSource.targetEnv !== "staging" &&
          remoteIntegrationSource.targetEnv !== "prod") ||
        typeof remoteIntegrationSource.remoteUserId !== "string" ||
        remoteIntegrationSource.remoteUserId.length === 0 ||
        (remoteIntegrationSource.requestedByUserId !== undefined &&
          (typeof remoteIntegrationSource.requestedByUserId !== "string" ||
            remoteIntegrationSource.requestedByUserId.length === 0)) ||
        (remoteIntegrationSource.requestedByEmail !== undefined &&
          remoteIntegrationSource.requestedByEmail !== null &&
          typeof remoteIntegrationSource.requestedByEmail !== "string") ||
        (remoteIntegrationSource.remoteUserEmail !== undefined &&
          remoteIntegrationSource.remoteUserEmail !== null &&
          typeof remoteIntegrationSource.remoteUserEmail !== "string")))
  ) {
    throw new Error("Invalid managed MCP token payload.");
  }

  if (parsed.exp <= nowSeconds) {
    throw new Error("Managed MCP token has expired.");
  }

  return parsed as ManagedMcpTokenClaims;
}
