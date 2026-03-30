import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SandboxHandle } from "../core/types";
import { prepareExecutorInSandbox } from "./executor-prep";

const { getWorkspaceExecutorBootstrapMock } = vi.hoisted(() => ({
  getWorkspaceExecutorBootstrapMock: vi.fn(),
}));

vi.mock("../../executor/workspace-sources", () => ({
  getWorkspaceExecutorBootstrap: getWorkspaceExecutorBootstrapMock,
}));

function makeSandboxHandle(): SandboxHandle {
  return {
    provider: "e2b",
    sandboxId: "sandbox-1",
    exec: vi.fn(),
    writeFile: vi.fn(),
    readFile: vi.fn(),
    ensureDir: vi.fn(),
  };
}

describe("prepareExecutorInSandbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getWorkspaceExecutorBootstrapMock.mockResolvedValue({
      revisionHash: "rev-1",
      configJson: "{\n  \"sources\": {}\n}\n",
      workspaceStateJson: "{\n  \"workspace\": true\n}\n",
      sources: [
        {
          id: "source-1",
          name: "CRM",
          namespace: "crm",
          kind: "openapi",
          enabled: true,
          connected: true,
        },
      ],
    });
  });

  it("starts executor via executor up and validates reachable status", async () => {
    const sandbox = makeSandboxHandle();
    vi.mocked(sandbox.exec)
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: "Executor is ready.\n",
        stderr: "",
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: JSON.stringify({ reachable: true }),
        stderr: "",
      });

    const result = await prepareExecutorInSandbox({
      sandbox,
      workspaceId: "workspace-1",
      workspaceName: "Workspace",
      userId: "user-1",
    });

    expect(result?.sourceCount).toBe(1);
    expect(sandbox.ensureDir).toHaveBeenCalledWith("/app/.executor/state");
    expect(vi.mocked(sandbox.exec).mock.calls[0]?.[0]).toContain("executor up --base-url");
    expect(vi.mocked(sandbox.exec).mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        env: {
          EXECUTOR_HOME: "/tmp/cmdclaw-executor/default",
        },
      }),
    );
    expect(sandbox.exec).toHaveBeenNthCalledWith(
      2,
      "executor status --base-url 'http://127.0.0.1:8788' --json",
      expect.objectContaining({
        env: {
          EXECUTOR_HOME: "/tmp/cmdclaw-executor/default",
        },
      }),
    );
  });

  it("throws when executor status is not reachable even if the command exits zero", async () => {
    const sandbox = makeSandboxHandle();
    vi.mocked(sandbox.exec)
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: "Executor is ready.\n",
        stderr: "",
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: JSON.stringify({ reachable: false }),
        stderr: "",
      });

    await expect(
      prepareExecutorInSandbox({
        sandbox,
        workspaceId: "workspace-1",
        workspaceName: "Workspace",
        userId: "user-1",
      }),
    ).rejects.toThrow("Executor status check failed");
  });
});
