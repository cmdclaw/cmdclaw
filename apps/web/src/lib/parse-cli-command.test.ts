import { describe, expect, it } from "vitest";
import { parseCliCommand } from "./parse-cli-command";

describe("parseCliCommand", () => {
  it("parses coworker invoke commands", () => {
    expect(
      parseCliCommand(
        'coworker invoke --username linkedin-digest --message "Review this inbox" --json',
      ),
    ).toEqual({
      integration: "coworker",
      operation: "invoke",
      args: {
        username: "linkedin-digest",
        message: "Review this inbox",
        json: "true",
      },
      positionalArgs: [],
      rawCommand: 'coworker invoke --username linkedin-digest --message "Review this inbox" --json',
    });
  });

  it("parses coworker edit commands", () => {
    expect(
      parseCliCommand(
        "coworker edit cw-1 --base-updated-at 2026-03-03T12:00:00.000Z --changes-file /tmp/changes.json --json",
      ),
    ).toEqual({
      integration: "coworker",
      operation: "edit",
      args: {
        "base-updated-at": "2026-03-03T12:00:00.000Z",
        "changes-file": "/tmp/changes.json",
        json: "true",
      },
      positionalArgs: ["cw-1"],
      rawCommand:
        "coworker edit cw-1 --base-updated-at 2026-03-03T12:00:00.000Z --changes-file /tmp/changes.json --json",
    });
  });

  it("parses coworker commands at the end of compound shell commands", () => {
    expect(
      parseCliCommand(
        "python -c \"print('hi')\" && coworker edit cw-1 --base-updated-at 2026-03-03T12:00:00.000Z --changes-file /tmp/changes.json --json",
      ),
    ).toEqual({
      integration: "coworker",
      operation: "edit",
      args: {
        "base-updated-at": "2026-03-03T12:00:00.000Z",
        "changes-file": "/tmp/changes.json",
        json: "true",
      },
      positionalArgs: ["cw-1"],
      rawCommand:
        "python -c \"print('hi')\" && coworker edit cw-1 --base-updated-at 2026-03-03T12:00:00.000Z --changes-file /tmp/changes.json --json",
    });
  });
});
