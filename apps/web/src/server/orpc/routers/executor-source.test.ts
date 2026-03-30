import { beforeEach, describe, expect, it, vi } from "vitest";

function createProcedureStub() {
  const stub = {
    input: vi.fn(),
    output: vi.fn(),
    handler: vi.fn((fn: unknown) => fn),
  };
  stub.input.mockReturnValue(stub);
  stub.output.mockReturnValue(stub);
  return stub;
}

const {
  startMcpOAuthAuthorizationMock,
  storeExecutorSourceOAuthPendingMock,
  requireActiveWorkspaceAccessMock,
  requireActiveWorkspaceAdminMock,
} = vi.hoisted(() => ({
  startMcpOAuthAuthorizationMock: vi.fn(),
  storeExecutorSourceOAuthPendingMock: vi.fn(),
  requireActiveWorkspaceAccessMock: vi.fn(),
  requireActiveWorkspaceAdminMock: vi.fn(),
}));

vi.mock("../middleware", () => ({
  protectedProcedure: createProcedureStub(),
}));

vi.mock("../workspace-access", () => ({
  requireActiveWorkspaceAccess: requireActiveWorkspaceAccessMock,
  requireActiveWorkspaceAdmin: requireActiveWorkspaceAdminMock,
}));

vi.mock("@cmdclaw/core/server/executor/workspace-sources", () => ({
  computeWorkspaceExecutorSourceRevisionHash: vi.fn(() => "hash"),
  ensureWorkspaceExecutorPackage: vi.fn(),
  listWorkspaceExecutorSources: vi.fn(() => []),
  normalizeExecutorNamespace: vi.fn((value: string) => value),
  setWorkspaceExecutorSourceCredential: vi.fn(),
}));

vi.mock("@cmdclaw/core/server/executor/mcp-oauth", () => ({
  resolveMcpEndpoint: vi.fn(
    ({
      endpoint,
      queryParams,
    }: {
      endpoint: string;
      queryParams?: Record<string, string> | null;
    }) => (queryParams?.region ? `${endpoint}?region=${queryParams.region}` : endpoint),
  ),
  startMcpOAuthAuthorization: startMcpOAuthAuthorizationMock,
}));

vi.mock("@/server/executor-source-oauth", () => ({
  storeExecutorSourceOAuthPending: storeExecutorSourceOAuthPendingMock,
}));

import { executorSourceInputSchema, executorSourceRouter } from "./executor-source";

const executorSourceRouterAny = executorSourceRouter as unknown as Record<
  string,
  (args: unknown) => Promise<unknown>
>;

function createContext() {
  return {
    user: { id: "user-1" },
    db: {
      query: {
        user: {
          findFirst: vi.fn().mockResolvedValue({ role: "admin" }),
        },
        workspace: {
          findFirst: vi.fn().mockResolvedValue({ id: "ws-1", name: "Workspace" }),
        },
        workspaceExecutorSource: {
          findFirst: vi.fn(),
        },
      },
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
}

describe("executorSourceRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireActiveWorkspaceAccessMock.mockResolvedValue({
      workspace: { id: "ws-1", name: "Workspace" },
      membership: { role: "member" },
    });
    requireActiveWorkspaceAdminMock.mockResolvedValue({
      workspace: { id: "ws-1", name: "Workspace" },
      membership: { role: "owner" },
    });
  });

  it("accepts oauth2 auth for MCP sources", () => {
    const parsed = executorSourceInputSchema.safeParse({
      kind: "mcp",
      name: "Linear MCP",
      namespace: "linear-mcp",
      endpoint: "https://mcp.linear.app/mcp",
      transport: "streamable-http",
      authType: "oauth2",
      enabled: true,
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects oauth2 auth for OpenAPI sources", () => {
    const parsed = executorSourceInputSchema.safeParse({
      kind: "openapi",
      name: "GitHub",
      namespace: "github",
      endpoint: "https://api.github.com",
      specUrl: "https://example.com/openapi.json",
      authType: "oauth2",
      enabled: true,
    });

    expect(parsed.success).toBe(false);
  });

  it("starts MCP OAuth for an executor source", async () => {
    const context = createContext();
    context.db.query.workspaceExecutorSource.findFirst.mockResolvedValue({
      id: "src-1",
      workspaceId: "ws-1",
      kind: "mcp",
      authType: "oauth2",
      endpoint: "https://mcp.linear.app/mcp",
      queryParams: { region: "eu" },
    });
    startMcpOAuthAuthorizationMock.mockResolvedValue({
      authorizationUrl: "https://linear.app/oauth/authorize?state=abc",
      session: {
        endpoint: "https://mcp.linear.app/mcp?region=eu",
        redirectUrl: "https://app.example.com/api/oauth/callback",
        codeVerifier: "verifier",
        resourceMetadataUrl: null,
        authorizationServerUrl: null,
        resourceMetadata: null,
        authorizationServerMetadata: null,
        clientInformation: null,
      },
    });

    const result = await executorSourceRouterAny.startOAuth({
      input: {
        workspaceExecutorSourceId: "src-1",
        redirectUrl: "https://app.example.com/toolbox/sources/src-1",
      },
      context,
    });

    expect(result).toEqual({
      authUrl: "https://linear.app/oauth/authorize?state=abc",
    });
    expect(startMcpOAuthAuthorizationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "https://mcp.linear.app/mcp?region=eu",
        redirectUrl: expect.stringContaining("/api/oauth/callback"),
        state: expect.any(String),
      }),
    );
    expect(storeExecutorSourceOAuthPendingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        sourceId: "src-1",
        redirectUrl: "https://app.example.com/toolbox/sources/src-1",
      }),
    );
  });

  it("rejects starting OAuth for a non-oauth source", async () => {
    const context = createContext();
    context.db.query.workspaceExecutorSource.findFirst.mockResolvedValue({
      id: "src-1",
      workspaceId: "ws-1",
      kind: "mcp",
      authType: "bearer",
      endpoint: "https://mcp.linear.app/mcp",
      queryParams: null,
    });

    await expect(
      executorSourceRouterAny.startOAuth({
        input: {
          workspaceExecutorSourceId: "src-1",
          redirectUrl: "https://app.example.com/toolbox/sources/src-1",
        },
        context,
      }),
    ).rejects.toMatchObject({
      message: "This source is not configured for MCP OAuth.",
    });
  });
});
