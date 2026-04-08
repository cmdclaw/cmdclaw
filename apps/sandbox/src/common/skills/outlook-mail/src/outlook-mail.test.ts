import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { runSkillCli } from "../../_test-utils/run-skill-cli";

describe("outlook-mail CLI", () => {
  test("prints help text when auth env is missing", () => {
    const result = runSkillCli(
      "src/common/skills/outlook-mail/src/outlook-mail.ts",
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
      "src/common/skills/outlook-mail/src/outlook-mail.ts",
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
    expect(result.stdout).toContain(
      "draft --to <email> --subject <subject> --body <body> [--cc <email>] [--attachment <path>]...",
    );
  });

  test("fails for invalid limit value", () => {
    const result = runSkillCli(
      "src/common/skills/outlook-mail/src/outlook-mail.ts",
      ["list", "--limit", "0"],
      {
        OUTLOOK_ACCESS_TOKEN: "test-token",
      },
    );

    expect(result.status).toBe(1);
    expect(result.combined).toContain("Invalid --limit");
  });

  test("rejects queries on list", () => {
    const result = runSkillCli(
      "src/common/skills/outlook-mail/src/outlook-mail.ts",
      ["list", "--query", "invoice"],
      {
        OUTLOOK_ACCESS_TOKEN: "test-token",
      },
    );

    expect(result.status).toBe(1);
    expect(result.combined).toContain("outlook-mail list does not accept --query");
    expect(result.combined).toContain("Use outlook-mail search instead");
  });

  test("requires a query for search", () => {
    const result = runSkillCli(
      "src/common/skills/outlook-mail/src/outlook-mail.ts",
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
      "src/common/skills/outlook-mail/src/outlook-mail.ts",
      ["send", "--to", "user@example.com", "--subject", "Hello", "--body", "<div>hello</div>"],
      {
        OUTLOOK_ACCESS_TOKEN: "test-token",
      },
    );

    expect(result.status).toBe(1);
    expect(result.combined).toContain("Invalid email body HTML: unsupported tag <div>");
    expect(result.combined).toContain("Allowed tags: b,strong,i,em,u,br,p");
  });

  test("fails draft when body contains unsupported html tags", () => {
    const result = runSkillCli(
      "src/common/skills/outlook-mail/src/outlook-mail.ts",
      ["draft", "--to", "user@example.com", "--subject", "Hello", "--body", "<script>x</script>"],
      {
        OUTLOOK_ACCESS_TOKEN: "test-token",
      },
    );

    expect(result.status).toBe(1);
    expect(result.combined).toContain("Invalid email body HTML: script/style tags are not allowed");
    expect(result.combined).toContain("Allowed tags: b,strong,i,em,u,br,p");
  });

  test("fails send when an attachment file cannot be read", () => {
    const result = runSkillCli(
      "src/common/skills/outlook-mail/src/outlook-mail.ts",
      [
        "send",
        "--to",
        "user@example.com",
        "--subject",
        "Hello",
        "--body",
        "<p>Hello</p>",
        "--attachment",
        "/tmp/does-not-exist.pdf",
      ],
      {
        OUTLOOK_ACCESS_TOKEN: "test-token",
      },
    );

    expect(result.status).toBe(1);
    expect(result.combined).toContain('Failed to read attachment "/tmp/does-not-exist.pdf"');
  });

  test("fails draft when an attachment file cannot be read", () => {
    const result = runSkillCli(
      "src/common/skills/outlook-mail/src/outlook-mail.ts",
      [
        "draft",
        "--to",
        "user@example.com",
        "--subject",
        "Hello",
        "--body",
        "<p>Hello</p>",
        "--attachment",
        "/tmp/does-not-exist.pdf",
      ],
      {
        OUTLOOK_ACCESS_TOKEN: "test-token",
      },
    );

    expect(result.status).toBe(1);
    expect(result.combined).toContain('Failed to read attachment "/tmp/does-not-exist.pdf"');
  });

  test("uses html content type and graph file attachments in payloads", () => {
    const source = readFileSync(
      path.resolve(
        process.cwd(),
        "src/common/skills/outlook-mail/src/outlook-mail.ts",
      ),
      "utf8",
    );
    expect(source).toContain('contentType: "HTML"');
    expect(source).toContain('"#microsoft.graph.fileAttachment"');
    expect(source).toContain('case "draft"');
  });
});
