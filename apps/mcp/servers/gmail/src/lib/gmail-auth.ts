import type { ToolExtraArguments } from "xmcp";
import { getManagedIntegrationTokens } from "../../../../shared/control-plane";
import { createGmailClient } from "./gmail";

type ManagedGmailClaims = {
  userId: string;
  workspaceId: string;
  internalKey: string;
};

export async function createManagedGmailClient(extra?: ToolExtraArguments) {
  const claims = extra?.authInfo?.extra as ManagedGmailClaims | undefined;
  if (!claims?.userId || !claims.workspaceId || claims.internalKey !== "gmail") {
    throw new Error("Managed Gmail MCP authentication is required.");
  }

  const tokens = await getManagedIntegrationTokens({
    userId: claims.userId,
    workspaceId: claims.workspaceId,
    integrationTypes: ["google_gmail"],
  });
  const accessToken = tokens.GMAIL_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("Gmail integration is not connected for this user.");
  }

  return createGmailClient(accessToken, process.env.CMDCLAW_USER_TIMEZONE?.trim());
}
