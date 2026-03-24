import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SandboxBackend } from "../sandbox/types";

vi.mock("@cmdclaw/db/client", () => ({
  db: {
    insert: vi.fn(),
  },
}));

vi.mock("@cmdclaw/db/schema", () => ({
  sandboxFile: {},
}));

vi.mock("../storage/s3-client", () => ({
  ensureBucket: vi.fn(),
  uploadToS3: vi.fn(),
}));

import { collectNewSandboxFiles } from "./sandbox-file-service";

function createSandbox(
  overrides: Partial<SandboxBackend> = {},
): SandboxBackend {
  return {
    setup: vi.fn(async () => undefined),
    execute: vi.fn(async () => ({ exitCode: 0, stdout: "", stderr: "" })),
    writeFile: vi.fn(async () => undefined),
    readFile: vi.fn(async () => ""),
    teardown: vi.fn(async () => undefined),
    isAvailable: vi.fn(() => true),
    ...overrides,
  };
}

describe("sandbox-file-service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("skips file scan noise when the sandbox has terminated", async () => {
    const sandbox = createSandbox({
      execute: vi.fn(async () => {
        throw new Error("2: [unknown] terminated");
      }),
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const files = await collectNewSandboxFiles(sandbox, Date.now());

    expect(files).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      "[SandboxFileService] Skipping file scan because the sandbox is terminated",
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("still logs unexpected scan failures as errors", async () => {
    const failure = new Error("permission denied");
    const sandbox = createSandbox({
      execute: vi.fn(async () => {
        throw failure;
      }),
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const files = await collectNewSandboxFiles(sandbox, Date.now());

    expect(files).toEqual([]);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      "[SandboxFileService] Failed to find new files:",
      failure,
    );
  });
});
