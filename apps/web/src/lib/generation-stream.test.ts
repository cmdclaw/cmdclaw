import { describe, expect, it, vi } from "vitest";

type VitestProcedure = Extract<
  NonNullable<Parameters<typeof vi.fn>[0]>,
  (...args: never[]) => unknown
>;
import { runGenerationStream } from "./generation-stream";

describe("runGenerationStream", () => {
  it("forwards authSource to startGeneration", async () => {
    const startGeneration = vi.fn<VitestProcedure>().mockResolvedValue({
      generationId: "gen-1",
      conversationId: "conv-1",
    });
    const client = {
      generation: {
        startGeneration,
        subscribeGeneration: vi.fn<VitestProcedure>().mockResolvedValue((async function* () {})()),
      },
    };

    await runGenerationStream({
      client: client as never,
      input: {
        content: "hi",
        model: "openai/gpt-5.4",
        authSource: "user",
      },
      callbacks: {},
    });

    expect(startGeneration).toHaveBeenCalledWith({
      content: "hi",
      model: "openai/gpt-5.4",
      authSource: "user",
    });
  });

  it("forwards status metadata to onStatusChange", async () => {
    const onStatusChange = vi.fn<VitestProcedure>();
    const client = {
      generation: {
        startGeneration: vi.fn<VitestProcedure>().mockResolvedValue({
          generationId: "gen-1",
          conversationId: "conv-1",
        }),
        subscribeGeneration: vi.fn<VitestProcedure>().mockResolvedValue(
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

  it("reconnects automatically when the server returns a replay cursor", async () => {
    const subscribeGeneration = vi
      .fn<VitestProcedure>()
      .mockResolvedValueOnce(
        (async function* () {
          yield {
            type: "status_change" as const,
            status: "approval_parked",
            metadata: {
              releasedSandboxId: "sandbox-old",
            },
            cursor: "1-1",
          };
          yield {
            type: "error" as const,
            message:
              "Generation is still processing. Reconnect with the returned cursor to resume stream replay.",
            cursor: "1-1",
          };
        })(),
      )
      .mockResolvedValueOnce(
        (async function* () {
          yield {
            type: "done" as const,
            generationId: "gen-2",
            conversationId: "conv-2",
            messageId: "msg-2",
            usage: {
              inputTokens: 1,
              outputTokens: 2,
              totalCostUsd: 0.01,
            },
            cursor: "1-2",
          };
        })(),
      );
    const onStatusChange = vi.fn<VitestProcedure>();
    const onDone = vi.fn<VitestProcedure>();
    const onError = vi.fn<VitestProcedure>();
    const client = {
      generation: {
        startGeneration: vi.fn<VitestProcedure>().mockResolvedValue({
          generationId: "gen-2",
          conversationId: "conv-2",
        }),
        subscribeGeneration,
      },
    };

    await runGenerationStream({
      client: client as never,
      input: {
        content: "hi",
      },
      callbacks: {
        onStatusChange,
        onDone,
        onError,
      },
    });

    expect(subscribeGeneration).toHaveBeenNthCalledWith(1, { generationId: "gen-2" });
    expect(subscribeGeneration).toHaveBeenNthCalledWith(2, {
      generationId: "gen-2",
      cursor: "1-1",
    });
    expect(onStatusChange).toHaveBeenCalledWith("approval_parked", {
      releasedSandboxId: "sandbox-old",
    });
    expect(onDone).toHaveBeenCalledWith(
      "gen-2",
      "conv-2",
      "msg-2",
      {
        inputTokens: 1,
        outputTokens: 2,
        totalCostUsd: 0.01,
      },
      undefined,
    );
    expect(onError).not.toHaveBeenCalled();
  });
});
