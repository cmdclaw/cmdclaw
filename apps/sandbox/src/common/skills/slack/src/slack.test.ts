import { describe, expect, test } from "vitest";
import { runSkillCli } from "../../_test-utils/run-skill-cli";

const SLACK_CLI = "sandbox/src/common/skills/slack/src/slack.ts";

describe("slack CLI", () => {
  test("fails fast when auth env is missing", () => {
    const result = runSkillCli(SLACK_CLI, ["channels"], {
      SLACK_ACCESS_TOKEN: "",
    });

    expect(result.status).toBe(1);
    expect(result.combined).toContain("SLACK_ACCESS_TOKEN");
  });

  test("prints help text when auth env is provided", () => {
    const result = runSkillCli(SLACK_CLI, ["--help"], {
      SLACK_ACCESS_TOKEN: "test-token",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Slack CLI - Commands");
  });
});
