import { describe, expect, it, vi } from "vitest";
import { runGenerationStream } from "./generation-stream";

describe("runGenerationStream", () => {
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
      sandboxProvider: "docker",
      runtimeHarness: "agent-sdk",
      runtimeProtocolVersion: "sandbox-agent-v1",
      sandboxId: "sandbox-123",
      sessionId: "session-456",
    });
  });
});
