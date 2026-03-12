import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { runSkillCli } from "../../_test-utils/run-skill-cli";

describe("outlook-mail CLI", () => {
  test("prints help text when auth env is missing", () => {
    const result = runSkillCli(
      "src/sandbox-templates/common/skills/outlook-mail/src/outlook-mail.ts",
      ["--help"],
      {
        OUTLOOK_ACCESS_TOKEN: "",
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Commands");
  });

  test("prints help text when auth env is provided", () => {
    const result = runSkillCli(
      "src/sandbox-templates/common/skills/outlook-mail/src/outlook-mail.ts",
      ["--help"],
      {
        OUTLOOK_ACCESS_TOKEN: "test-token",
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Outlook Mail CLI - Commands");
    expect(result.stdout).toContain("list");
    expect(result.stdout).toContain("search -q <query>");
    expect(result.stdout).toContain("unread");
  });

  test("fails for invalid limit value", () => {
    const result = runSkillCli(
      "src/sandbox-templates/common/skills/outlook-mail/src/outlook-mail.ts",
      ["list", "--limit", "0"],
      {
        OUTLOOK_ACCESS_TOKEN: "test-token",
      },
    );

    expect(result.status).toBe(1);
    expect(result.combined).toContain("Invalid --limit");
  });

  test("requires a query for search", () => {
    const result = runSkillCli(
      "src/sandbox-templates/common/skills/outlook-mail/src/outlook-mail.ts",
      ["search"],
      {
        OUTLOOK_ACCESS_TOKEN: "test-token",
      },
    );

    expect(result.status).toBe(1);
    expect(result.combined).toContain("Required: outlook-mail search --query <search>");
  });

  test("fails send when body contains unsupported html tags", () => {
    const result = runSkillCli(
      "src/sandbox-templates/common/skills/outlook-mail/src/outlook-mail.ts",
      ["send", "--to", "user@example.com", "--subject", "Hello", "--body", "<div>hello</div>"],
      {
        OUTLOOK_ACCESS_TOKEN: "test-token",
      },
    );

    expect(result.status).toBe(1);
    expect(result.combined).toContain("Invalid email body HTML: unsupported tag <div>");
    expect(result.combined).toContain("Allowed tags: b,strong,i,em,u,br,p");
  });

  test("uses html content type in graph payload", () => {
    const source = readFileSync(
      path.resolve(
        process.cwd(),
        "src/sandbox-templates/common/skills/outlook-mail/src/outlook-mail.ts",
      ),
      "utf8",
    );
    expect(source).toContain('contentType: "HTML"');
  });
});
