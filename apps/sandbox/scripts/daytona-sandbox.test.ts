import { describe, expect, it } from "vitest";
import {
  DEFAULT_CREATE_USER_EMAIL,
  DEFAULT_CREATE_WORKSPACE_SLUG,
  parseArgs,
} from "./daytona-sandbox";

describe("daytona-sandbox parseArgs", () => {
  it("uses default create user and workspace when no flags are provided", () => {
    expect(parseArgs([])).toEqual({
      userEmail: DEFAULT_CREATE_USER_EMAIL,
      workspaceSlug: DEFAULT_CREATE_WORKSPACE_SLUG,
      help: false,
    });
  });

  it("allows overriding the workspace slug", () => {
    const parsed = parseArgs([
      "--workspace-slug",
      "workspace-slug",
      "--user-email",
      "dev@test.com",
    ]);

    expect(parsed.workspaceSlug).toBe("workspace-slug");
    expect(parsed.userEmail).toBe("dev@test.com");
  });

  it("throws when attach selectors are combined", () => {
    expect(() => parseArgs(["--sandbox-id", "sbx_123", "--run-id", "run_123"])).toThrowError(
      "Use only one attach selector: --sandbox-id, --conversation-id, --run-id, or --builder-coworker-id.",
    );
  });

  it("throws when a required flag value is missing", () => {
    expect(() => parseArgs(["--workspace-slug"])).toThrowError(
      "Missing value for --workspace-slug",
    );
  });

  it("throws on unknown arguments", () => {
    expect(() => parseArgs(["--wat"])).toThrowError("Unknown argument: --wat");
  });
});
