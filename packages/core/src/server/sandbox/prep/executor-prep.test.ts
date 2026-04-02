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

  it("starts executor via executor server start and validates the local server", async () => {
    const sandbox = makeSandboxHandle();
    vi.mocked(sandbox.exec)
      .mockResolvedValueOnce({
        exitCode: 1,
        stdout: "",
        stderr: "",
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: "",
        stderr: "",
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: "",
        stderr: "",
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: '"ok"\n',
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
    expect(vi.mocked(sandbox.exec).mock.calls[0]?.[0]).toBe(
      "curl -fsS 'http://127.0.0.1:8788/' >/dev/null",
    );
    expect(vi.mocked(sandbox.exec).mock.calls[1]?.[0]).toContain(
      "executor server start --port 8788",
    );
    expect(vi.mocked(sandbox.exec).mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        background: true,
        env: {
          EXECUTOR_HOME: "/tmp/cmdclaw-executor/default",
        },
      }),
    );
    expect(sandbox.exec).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("executor server did not become ready"),
      expect.objectContaining({
        env: {
          EXECUTOR_HOME: "/tmp/cmdclaw-executor/default",
        },
      }),
    );
    expect(sandbox.exec).toHaveBeenNthCalledWith(
      4,
      `executor call --base-url 'http://127.0.0.1:8788' --no-open 'return "ok"'`,
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
        stdout: "",
        stderr: "",
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: "",
        stderr: "",
      })
      .mockResolvedValueOnce({
        exitCode: 1,
        stdout: "",
        stderr: "server unreachable",
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
