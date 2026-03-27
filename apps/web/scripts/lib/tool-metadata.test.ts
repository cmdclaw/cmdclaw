import { describe, expect, it } from "vitest";
import { resolveCliToolMetadata } from "./tool-metadata";

describe("resolveCliToolMetadata", () => {
  it("derives coworker metadata from bash commands", () => {
    expect(
      resolveCliToolMetadata({
        toolName: "bash",
        toolInput: {
          command:
            "coworker edit cw-1 --base-updated-at 2026-03-27T11:25:30.016Z --changes-file /app/tmp/coworker-edit.json --json",
        },
      }),
    ).toEqual({
      integration: "coworker",
      isWrite: true,
    });
  });

  it("preserves streamed metadata when already present", () => {
    expect(
      resolveCliToolMetadata({
        toolName: "bash",
        toolInput: { command: "google-gmail list -l 1" },
        integration: "google_gmail",
        isWrite: false,
      }),
    ).toEqual({
      integration: "google_gmail",
      isWrite: false,
    });
  });
});
