import { beforeEach, describe, expect, it, vi } from "vitest";

const { uploadToS3Mock } = vi.hoisted(() => ({
  uploadToS3Mock: vi.fn(async () => undefined),
}));

vi.mock("../storage/s3-client", () => ({
  uploadToS3: uploadToS3Mock,
}));

import { captureRuntimeNoProgressDiagnosticSnapshot } from "./runtime-diagnostic-snapshot-service";
import type { RuntimeHarnessClient } from "../sandbox/core/types";
import type { GenerationContext } from "./generation/types";

describe("captureRuntimeNoProgressDiagnosticSnapshot", () => {
  beforeEach(() => {
    uploadToS3Mock.mockClear();
  });

  it("stores bounded raw probe values without field-name redaction", async () => {
    const runtimeClient = {
      getSession: vi.fn(async () => ({
        data: {
          id: "session-1",
          prompt: "persist this diagnostic prompt",
          token: "diagnostic-token",
        },
        error: null,
      })),
      messages: vi.fn(async () => ({
        data: [
          {
            info: {
              role: "assistant",
              error: {
                message: "Provider rejected model",
                providerID: "openai",
                modelID: "gpt-5.4",
              },
            },
            parts: [{ type: "text", text: "persist this diagnostic output" }],
          },
        ],
        error: null,
      })),
      status: vi.fn(async () => ({
        data: { "session-1": { type: "busy" } },
        error: null,
      })),
    } as unknown as RuntimeHarnessClient;

    await captureRuntimeNoProgressDiagnosticSnapshot({
      ctx: {
        id: "gen-1",
        conversationId: "conv-1",
        userId: "user-1",
        traceId: "trace-1",
        status: "running",
        completionReason: null,
        model: "openai/gpt-5.4",
        runtimeId: "runtime-1",
        sandboxId: "sandbox-1",
        runtimeHarness: "opencode",
        runtimeProtocolVersion: "opencode-v2",
      } as unknown as GenerationContext,
      runtimeClient,
      sandbox: {
        readFile: vi.fn(async () => "raw log line\n[OpenCode][EVENT] type=server.connected\n"),
      },
      sandboxProvider: "daytona",
      sessionId: "session-1",
      reason: "runtime_no_progress_after_prompt",
      timeoutMs: 90_000,
      promptSentAtMs: Date.now() - 1_000,
      eventLoopSnapshot: {
        stats: {
          eventCount: 1,
          progressEventCount: 0,
          toolCallCount: 0,
          permissionCount: 0,
          questionCount: 0,
        },
        sawSessionIdle: false,
        sessionErrorMessage: null,
      },
    });

    const snapshotBody = uploadToS3Mock.mock.calls[0]?.[1].toString() ?? "";
    expect(snapshotBody).toContain("persist this diagnostic prompt");
    expect(snapshotBody).toContain("diagnostic-token");
    expect(snapshotBody).toContain("persist this diagnostic output");
    expect(snapshotBody).toContain("Provider rejected model");
    expect(snapshotBody).not.toContain("redacted=");
  });
});
