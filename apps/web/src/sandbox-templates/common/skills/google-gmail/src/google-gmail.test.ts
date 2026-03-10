import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { runSkillCli } from "../../_test-utils/run-skill-cli";

describe("google-gmail CLI", () => {
  test("prints help text when auth env is missing", () => {
    const result = runSkillCli(
      "src/sandbox-templates/common/skills/google-gmail/src/google-gmail.ts",
      ["--help"],
      {
        GMAIL_ACCESS_TOKEN: "",
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Commands");
  });

  test("prints help text when auth env is provided", () => {
    const result = runSkillCli(
      "src/sandbox-templates/common/skills/google-gmail/src/google-gmail.ts",
      ["--help"],
      {
        GMAIL_ACCESS_TOKEN: "test-token",
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Google Gmail CLI - Commands");
    expect(result.stdout).toContain("latest");
    expect(result.stdout).toContain("--scope inbox|all|strict-all");
    expect(result.stdout).toContain("draft --to <email> --subject <subject> --body <body>");
  });

  test("fails for unsupported scope value", () => {
    const result = runSkillCli(
      "src/sandbox-templates/common/skills/google-gmail/src/google-gmail.ts",
      ["list", "--scope", "archive-only"],
      {
        GMAIL_ACCESS_TOKEN: "test-token",
      },
    );

    expect(result.status).toBe(1);
    expect(result.combined).toContain("Invalid --scope");
  });

  test("fails send when body contains unsupported html tags", () => {
    const result = runSkillCli(
      "src/sandbox-templates/common/skills/google-gmail/src/google-gmail.ts",
      [
        "send",
        "--to",
        "user@example.com",
        "--subject",
        "Hello",
        "--body",
        "<p>Hello</p><table><tr><td>x</td></tr></table>",
      ],
      {
        GMAIL_ACCESS_TOKEN: "test-token",
      },
    );

    expect(result.status).toBe(1);
    expect(result.combined).toContain("Invalid email body HTML: unsupported tag <table>");
    expect(result.combined).toContain("Allowed tags: b,strong,i,em,u,br,p");
  });

  test("fails draft when body contains unsupported html tags", () => {
    const result = runSkillCli(
      "src/sandbox-templates/common/skills/google-gmail/src/google-gmail.ts",
      [
        "draft",
        "--to",
        "user@example.com",
        "--subject",
        "Hello",
        "--body",
        "<script>alert(1)</script>",
      ],
      {
        GMAIL_ACCESS_TOKEN: "test-token",
      },
    );

    expect(result.status).toBe(1);
    expect(result.combined).toContain("Invalid email body HTML: script/style tags are not allowed");
    expect(result.combined).toContain("Allowed tags: b,strong,i,em,u,br,p");
  });

  test("uses html mime content type for outgoing messages", () => {
    const source = readFileSync(
      path.resolve(
        process.cwd(),
        "src/sandbox-templates/common/skills/google-gmail/src/google-gmail.ts",
      ),
      "utf8",
    );
    expect(source).toContain("Content-Type: text/html; charset=utf-8");
  });
});
