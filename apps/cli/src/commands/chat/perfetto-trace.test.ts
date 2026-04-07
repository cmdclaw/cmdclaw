import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  buildPerfettoTraceDirectoryPath,
  buildPerfettoTraceFilename,
  buildPerfettoTraceOutputPath,
  exportPerfettoTraceForCompletedRun,
} from "./perfetto-trace";

function buildArtifacts() {
  return {
    timing: {
      phaseDurationsMs: {
        sandboxInitMs: 820,
        sandboxConnectOrCreateMs: 800,
        sandboxCreateMs: 790,
      },
      phaseTimestamps: [
        { phase: "generation_started", at: "2026-04-02T10:00:00.000Z", elapsedMs: 0 },
        { phase: "sandbox_init_started", at: "2026-04-02T10:00:00.080Z", elapsedMs: 80 },
        {
          phase: "sandbox_init_checking_cache",
          at: "2026-04-02T10:00:00.100Z",
          elapsedMs: 100,
        },
        {
          phase: "sandbox_init_creating",
          at: "2026-04-02T10:00:00.110Z",
          elapsedMs: 110,
        },
        {
          phase: "sandbox_init_created",
          at: "2026-04-02T10:00:00.900Z",
          elapsedMs: 900,
        },
        { phase: "agent_init_started", at: "2026-04-02T10:00:00.900Z", elapsedMs: 900 },
      ],
    },
    attachments: [],
    sandboxFiles: [],
  };
}

describe("chat perfetto trace export", () => {
  it("builds output paths under the current working directory", () => {
    const now = new Date("2026-04-07T12:34:56.789Z");
    expect(buildPerfettoTraceDirectoryPath("/tmp/cmdclaw")).toBe("/tmp/cmdclaw/perfetto-traces");
    expect(buildPerfettoTraceFilename(now)).toBe("2026-04-07T12-34-56.789Z.json");
    expect(
      buildPerfettoTraceOutputPath({
        cwd: "/tmp/cmdclaw",
        now,
      }),
    ).toBe("/tmp/cmdclaw/perfetto-traces/2026-04-07T12-34-56.789Z.json");
  });

  it("writes a one-shot Perfetto trace file", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "cmdclaw-chat-trace-"));
    const now = new Date("2026-04-07T12:34:56.789Z");
    const targetPath = join(rootDir, "perfetto-traces", "2026-04-07T12-34-56.789Z.json");

    const result = exportPerfettoTraceForCompletedRun({
      cwd: rootDir,
      conversationId: "conv-1",
      generationId: "gen-1",
      artifacts: buildArtifacts(),
      now,
    });

    expect(result).toEqual({
      status: "written",
      path: targetPath,
    });
    expect(existsSync(targetPath)).toBe(true);

    const contents = JSON.parse(readFileSync(targetPath, "utf-8")) as {
      traceEvents: Array<{ name: string; tid: number; args: { name?: string } }>;
    };
    expect(contents.traceEvents.some((event) => event.name === "sandbox_connect_or_create")).toBe(
      true,
    );
    expect(contents.traceEvents.some((event) => event.name === "sandbox_init")).toBe(true);
    expect(contents.traceEvents.some((event) => event.name === "sandbox_create")).toBe(true);
    expect(
      contents.traceEvents
        .filter((event) => event.name === "thread_name")
        .map((event) => event.args.name),
    ).toEqual([
      "summary",
      "sandbox_init",
      "agent_init",
      "pre_prompt_memory",
      "pre_prompt_skills",
      "pre_prompt_integration",
      "pre_prompt_runtime",
      "executor_prepare",
    ]);
  });

  it("writes numbered sibling files when the timestamp path is already taken", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "cmdclaw-chat-trace-"));
    const now = new Date("2026-04-07T12:34:56.789Z");

    const first = exportPerfettoTraceForCompletedRun({
      cwd: rootDir,
      conversationId: "conv-1",
      generationId: "gen-1",
      artifacts: buildArtifacts(),
      now,
    });
    const second = exportPerfettoTraceForCompletedRun({
      cwd: rootDir,
      conversationId: "conv-1",
      generationId: "gen-2",
      artifacts: buildArtifacts(),
      now,
    });

    expect(first).toEqual({
      status: "written",
      path: join(rootDir, "perfetto-traces", "2026-04-07T12-34-56.789Z.json"),
    });
    expect(second).toEqual({
      status: "written",
      path: join(rootDir, "perfetto-traces", "2026-04-07T12-34-56.789Z.2.json"),
    });
    expect(existsSync(join(rootDir, "perfetto-traces", "2026-04-07T12-34-56.789Z.json"))).toBe(
      true,
    );
    expect(
      existsSync(join(rootDir, "perfetto-traces", "2026-04-07T12-34-56.789Z.2.json")),
    ).toBe(true);
  });

  it("skips export when timing timestamps are unavailable", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "cmdclaw-chat-trace-"));
    const targetPath = join(rootDir, "perfetto-traces", "2026-04-07T12-34-56.789Z.json");

    const result = exportPerfettoTraceForCompletedRun({
      cwd: rootDir,
      conversationId: "conv-1",
      generationId: "gen-1",
      artifacts: {
        timing: {
          phaseDurationsMs: {
            sandboxConnectOrCreateMs: 800,
          },
        },
        attachments: [],
        sandboxFiles: [],
      },
      now: new Date("2026-04-07T12:34:56.789Z"),
    });

    expect(result).toEqual({
      status: "skipped",
      reason: "missing_phase_timestamps",
    });
    expect(existsSync(targetPath)).toBe(false);
  });
});
