import type { ToolExtraArguments } from "xmcp";
import { getManagedIntegrationTokens } from "../../../../shared/control-plane";
import { createGmailClient } from "./gmail";

type ManagedGmailClaims = {
  userId: string;
  workspaceId: string;
  audience: string;
  remoteIntegrationSource?: {
    targetEnv: "staging" | "prod";
    remoteUserId: string;
    requestedByUserId?: string;
    requestedByEmail?: string | null;
    remoteUserEmail?: string | null;
  };
};

export async function createManagedGmailClient(extra?: ToolExtraArguments) {
  const claims = extra?.authInfo?.extra as ManagedGmailClaims | undefined;
  if (!claims?.userId || !claims.workspaceId || claims.audience !== "gmail") {
    throw new Error("Managed Gmail MCP authentication is required.");
  }

  const tokens = await getManagedIntegrationTokens({
    userId: claims.userId,
    workspaceId: claims.workspaceId,
    integrationTypes: ["google_gmail"],
    remoteIntegrationSource: claims.remoteIntegrationSource,
  });
  const accessToken = tokens.GMAIL_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("Gmail integration is not connected for this user.");
  }

  return createGmailClient(accessToken, process.env.BAP_USER_TIMEZONE?.trim());
}
