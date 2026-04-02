import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  buildChromeTraceOutputPath,
  exportChromeTraceForCompletedRun,
} from "./chrome-trace";

function buildArtifacts() {
  return {
    timing: {
      phaseDurationsMs: {
        sandboxConnectOrCreateMs: 800,
      },
      phaseTimestamps: [
        { phase: "generation_started", at: "2026-04-02T10:00:00.000Z", elapsedMs: 0 },
        {
          phase: "agent_init_sandbox_checking_cache",
          at: "2026-04-02T10:00:00.100Z",
          elapsedMs: 100,
        },
        {
          phase: "agent_init_sandbox_created",
          at: "2026-04-02T10:00:00.900Z",
          elapsedMs: 900,
        },
      ],
    },
    attachments: [],
    sandboxFiles: [],
  };
}

describe("chat chrome trace export", () => {
  it("uses the requested path for the first export and numbers follow-ups", () => {
    expect(buildChromeTraceOutputPath("/tmp/trace.json", 1)).toBe("/tmp/trace.json");
    expect(buildChromeTraceOutputPath("/tmp/trace.json", 2)).toBe("/tmp/trace.2.json");
    expect(buildChromeTraceOutputPath("/tmp/trace", 3)).toBe("/tmp/trace.3");
  });

  it("writes a one-shot Chrome trace file", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "cmdclaw-chat-trace-"));
    const targetPath = join(rootDir, "trace.json");

    const result = exportChromeTraceForCompletedRun({
      basePath: targetPath,
      exportIndex: 1,
      conversationId: "conv-1",
      generationId: "gen-1",
      artifacts: buildArtifacts(),
    });

    expect(result).toEqual({
      status: "written",
      path: targetPath,
    });
    expect(existsSync(targetPath)).toBe(true);

    const contents = JSON.parse(readFileSync(targetPath, "utf-8")) as {
      traceEvents: Array<{ name: string }>;
    };
    expect(contents.traceEvents.some((event) => event.name === "sandbox_connect_or_create")).toBe(
      true,
    );
  });

  it("writes numbered sibling files for follow-up exports", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "cmdclaw-chat-trace-"));
    const targetPath = join(rootDir, "trace.json");

    const first = exportChromeTraceForCompletedRun({
      basePath: targetPath,
      exportIndex: 1,
      conversationId: "conv-1",
      generationId: "gen-1",
      artifacts: buildArtifacts(),
    });
    const second = exportChromeTraceForCompletedRun({
      basePath: targetPath,
      exportIndex: 2,
      conversationId: "conv-1",
      generationId: "gen-2",
      artifacts: buildArtifacts(),
    });

    expect(first).toEqual({
      status: "written",
      path: targetPath,
    });
    expect(second).toEqual({
      status: "written",
      path: join(rootDir, "trace.2.json"),
    });
    expect(existsSync(join(rootDir, "trace.json"))).toBe(true);
    expect(existsSync(join(rootDir, "trace.2.json"))).toBe(true);
  });

  it("skips export when timing timestamps are unavailable", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "cmdclaw-chat-trace-"));
    const targetPath = join(rootDir, "trace.json");

    const result = exportChromeTraceForCompletedRun({
      basePath: targetPath,
      exportIndex: 1,
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
    });

    expect(result).toEqual({
      status: "skipped",
      reason: "missing_phase_timestamps",
    });
    expect(existsSync(targetPath)).toBe(false);
  });
});
