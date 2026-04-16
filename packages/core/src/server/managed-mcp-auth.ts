import { createHmac, timingSafeEqual } from "node:crypto";

export type ManagedMcpTokenClaims = {
  userId: string;
  workspaceId: string;
  internalKey: string;
  exp: number;
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
  const payload = encodeBase64Url(JSON.stringify(claims));
  const signature = signPayload(payload, secret);
  return `${payload}.${signature}`;
}

export function verifyManagedMcpToken(
  token: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): ManagedMcpTokenClaims {
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
  if (
    !parsed.userId ||
    !parsed.workspaceId ||
    !parsed.internalKey ||
    typeof parsed.exp !== "number"
  ) {
    throw new Error("Invalid managed MCP token payload.");
  }

  if (parsed.exp <= nowSeconds) {
    throw new Error("Managed MCP token has expired.");
  }

  return parsed as ManagedMcpTokenClaims;
}
