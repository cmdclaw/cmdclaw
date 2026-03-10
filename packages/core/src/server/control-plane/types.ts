import type { IntegrationType } from "../oauth/config";

export type CloudAccountLink = {
  cloudUserId: string;
  status: string;
  linkedAt: string;
  updatedAt: string;
};

export type IntegrationLinkStatus = {
  id: string;
  type: IntegrationType;
  displayName: string | null;
  enabled: boolean;
  setupRequired: boolean;
  instanceName: string | null;
  instanceUrl: string | null;
  authStatus: string;
  authErrorCode: string | null;
  scopes: string[] | null;
  createdAt: string;
};

export type DelegatedRuntimeCredentialsRequest = {
  integrationTypes: string[];
};

export type DelegatedRuntimeCredentialsResponse = {
  cliEnv: Record<string, string>;
  tokens: Record<string, string>;
  enabledIntegrations: string[];
  connectedProviders: string[];
  providerAuths: Array<{
    provider: string;
    accessToken: string;
    refreshToken: string | null;
    expiresAt: number | null;
  }>;
  issuedAt: string;
};

export type ControlPlaneHealthStatus = {
  ok: boolean;
  edition: "cloud";
  checkedAt: string;
};

export type ProviderAuthStatusPayload = {
  connected: string[];
};
