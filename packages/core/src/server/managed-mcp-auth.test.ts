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

  it("round-trips a spawn depth claim", () => {
    const token = signManagedMcpToken(
      {
        userId: "user-1",
        workspaceId: "ws-1",
        internalKey: "cmdclaw",
        exp: 2_000_000_000,
        spawnDepth: 2,
      },
      "test-secret",
    );

    expect(verifyManagedMcpToken(token, "test-secret", 1_900_000_000)).toMatchObject({
      internalKey: "cmdclaw",
      spawnDepth: 2,
    });
  });

  it("rejects a negative or non-integer spawn depth", () => {
    for (const spawnDepth of [-1, 1.5]) {
      const token = signManagedMcpToken(
        {
          userId: "user-1",
          workspaceId: "ws-1",
          internalKey: "cmdclaw",
          exp: 2_000_000_000,
          spawnDepth,
        },
        "test-secret",
      );

      expect(() => verifyManagedMcpToken(token, "test-secret", 1_900_000_000)).toThrow(
        /payload/i,
      );
    }
  });

  it("fails closed when the secret is empty", () => {
    const token = signManagedMcpToken(
      { userId: "user-1", workspaceId: "ws-1", internalKey: "cmdclaw", exp: 2_000_000_000 },
      "test-secret",
    );
    expect(() => verifyManagedMcpToken(token, "", 1_900_000_000)).toThrow(/without a secret/i);
    expect(() =>
      signManagedMcpToken(
        { userId: "user-1", workspaceId: "ws-1", internalKey: "cmdclaw", exp: 2_000_000_000 },
        "",
      ),
    ).toThrow(/without a secret/i);
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
