import { describe, expect, it } from "vitest";
import {
  DEFAULT_CREATE_USER_EMAIL,
  DEFAULT_CREATE_WORKSPACE_SLUG,
  parseArgs,
} from "./test-sandbox";

describe("test-sandbox parseArgs", () => {
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

  it("throws when a required flag value is missing", () => {
    expect(() => parseArgs(["--workspace-slug"])).toThrowError(
      "Missing value for --workspace-slug",
    );
  });

  it("throws on unknown arguments", () => {
    expect(() => parseArgs(["--wat"])).toThrowError("Unknown argument: --wat");
  });
});
