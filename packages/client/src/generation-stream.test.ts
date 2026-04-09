import { describe, expect, it, vi } from "vitest";
import { runGenerationStream } from "./generation-stream";

describe("runGenerationStream", () => {
  it("forwards authSource to startGeneration", async () => {
    const startGeneration = vi.fn().mockResolvedValue({
      generationId: "gen-1",
      conversationId: "conv-1",
    });
    const client = {
      generation: {
        startGeneration,
        subscribeGeneration: vi.fn().mockResolvedValue((async function* () {})()),
      },
    };

    await runGenerationStream({
      client: client as never,
      input: {
        content: "hi",
        model: "openai/gpt-5.4",
        authSource: "user",
        debugRunDeadlineMs: 60_000,
        debugApprovalHotWaitMs: 5_000,
      },
      callbacks: {},
    });

    expect(startGeneration).toHaveBeenCalledWith({
      content: "hi",
      model: "openai/gpt-5.4",
      authSource: "user",
      debugRunDeadlineMs: 60_000,
      debugApprovalHotWaitMs: 5_000,
    });
  });

  it("forwards status metadata to onStatusChange", async () => {
    const onStatusChange = vi.fn();
    const client = {
      generation: {
        startGeneration: vi.fn().mockResolvedValue({
          generationId: "gen-1",
          conversationId: "conv-1",
        }),
        subscribeGeneration: vi.fn().mockResolvedValue(
          (async function* () {
            yield {
              type: "status_change" as const,
              status: "agent_init_ready",
              metadata: {
                runtimeId: "runtime-789",
                sandboxProvider: "docker" as const,
                runtimeHarness: "agent-sdk" as const,
                runtimeProtocolVersion: "sandbox-agent-v1" as const,
                sandboxId: "sandbox-123",
                sessionId: "session-456",
              },
            };
          })(),
        ),
      },
    };

    await runGenerationStream({
      client: client as never,
      input: {
        content: "hi",
        sandboxProvider: "docker",
      },
      callbacks: {
        onStatusChange,
      },
    });

    expect(onStatusChange).toHaveBeenCalledWith("agent_init_ready", {
      runtimeId: "runtime-789",
      sandboxProvider: "docker",
      runtimeHarness: "agent-sdk",
      runtimeProtocolVersion: "sandbox-agent-v1",
      sandboxId: "sandbox-123",
      sessionId: "session-456",
    });
  });
});
