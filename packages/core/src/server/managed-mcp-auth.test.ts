import { describe, expect, it } from "vitest";
import { signManagedMcpToken, verifyManagedMcpToken } from "./managed-mcp-auth";

describe("managed MCP auth", () => {
  it("round-trips a signed token", () => {
    const token = signManagedMcpToken(
      {
        userId: "user-1",
        workspaceId: "ws-1",
        internalKey: "gmail",
        exp: 2_000_000_000,
      },
      "test-secret",
    );

    expect(verifyManagedMcpToken(token, "test-secret", 1_900_000_000)).toMatchObject({
      userId: "user-1",
      workspaceId: "ws-1",
      internalKey: "gmail",
    });
  });

  it("round-trips a remote integration source", () => {
    const token = signManagedMcpToken(
      {
        userId: "user-1",
        workspaceId: "ws-1",
        internalKey: "gmail",
        exp: 2_000_000_000,
        remoteIntegrationSource: {
          targetEnv: "prod",
          remoteUserId: "remote-user-1",
          requestedByUserId: "admin-1",
          requestedByEmail: "admin@example.com",
          remoteUserEmail: "client@example.com",
        },
      },
      "test-secret",
    );

    expect(verifyManagedMcpToken(token, "test-secret", 1_900_000_000)).toMatchObject({
      remoteIntegrationSource: {
        targetEnv: "prod",
        remoteUserId: "remote-user-1",
        requestedByUserId: "admin-1",
        requestedByEmail: "admin@example.com",
        remoteUserEmail: "client@example.com",
      },
    });
  });

  it("rejects expired tokens", () => {
    const token = signManagedMcpToken(
      {
        userId: "user-1",
        workspaceId: "ws-1",
        internalKey: "gmail",
        exp: 100,
      },
      "test-secret",
    );

    expect(() => verifyManagedMcpToken(token, "test-secret", 101)).toThrow(/expired/i);
  });
});
