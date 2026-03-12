import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, test } from "vitest";

const SCRIPT_PATH = path.resolve(process.cwd(), "scripts/tool.ts");

function runToolCli(args: string[]) {
  const result = spawnSync("bun", [SCRIPT_PATH, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 15_000,
    env: process.env,
  });

  return {
    status: result.status ?? (result.error ? -1 : 0),
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

describe("tool CLI wrapper", () => {
  test("lists sandbox-backed tools in help output", () => {
    const result = runToolCli(["--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("google-gmail");
    expect(result.stdout).toContain("linkedin");
    expect(result.stdout).toContain("slack");
  });

  test("passes through tool help without requiring local auth bootstrap", () => {
    const result = runToolCli(["google-gmail", "--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Google Gmail CLI - Commands");
  });

  test("rejects unsupported tool names", () => {
    const result = runToolCli(["not-a-real-tool"]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unknown tool: not-a-real-tool");
  });
});
