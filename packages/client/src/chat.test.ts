import { describe, expect, it, vi } from "vitest";
import { runChatSession } from "./chat";

describe("runChatSession", () => {
  it("returns needs_auth when auth is required and not handled", async () => {
    const client = {
      generation: {
        startGeneration: vi.fn().mockResolvedValue({
          generationId: "gen-1",
          conversationId: "conv-1",
        }),
        subscribeGeneration: vi.fn().mockResolvedValue(
          (async function* () {
            yield {
              type: "interrupt_pending" as const,
              generationId: "gen-1",
              conversationId: "conv-1",
              kind: "auth" as const,
              providerToolUseId: "tool-1",
              display: {
                title: "Auth required",
                authSpec: {
                  integrations: ["google_drive"],
                },
              },
            };
          })(),
        ),
      },
    };

    const result = await runChatSession({
      client: client as never,
      input: { content: "hi" },
    });

    expect(result.status).toBe("needs_auth");
    if (result.status === "needs_auth") {
      expect(result.auth.integrations).toEqual(["google_drive"]);
    }
  });

  it("returns needs_approval when approval is required and not handled", async () => {
    const client = {
      generation: {
        startGeneration: vi.fn().mockResolvedValue({
          generationId: "gen-2",
          conversationId: "conv-2",
        }),
        subscribeGeneration: vi.fn().mockResolvedValue(
          (async function* () {
            yield {
              type: "interrupt_pending" as const,
              generationId: "gen-2",
              conversationId: "conv-2",
              kind: "plugin_write" as const,
              providerToolUseId: "tool-2",
              display: {
                title: "Slack postMessage",
                integration: "slack",
                operation: "post_message",
                toolInput: { channel: "#general" },
              },
            };
          })(),
        ),
      },
    };

    const result = await runChatSession({
      client: client as never,
      input: { content: "send a message" },
    });

    expect(result.status).toBe("needs_approval");
    if (result.status === "needs_approval") {
      expect(result.approval.integration).toBe("slack");
    }
  });

  it("returns completed when the generation finishes", async () => {
    const client = {
      generation: {
        startGeneration: vi.fn().mockResolvedValue({
          generationId: "gen-3",
          conversationId: "conv-3",
        }),
        subscribeGeneration: vi.fn().mockResolvedValue(
          (async function* () {
            yield { type: "text" as const, content: "hello" };
            yield {
              type: "done" as const,
              generationId: "gen-3",
              conversationId: "conv-3",
              messageId: "msg-1",
              usage: {
                inputTokens: 1,
                outputTokens: 1,
                totalCostUsd: 0.01,
              },
            };
          })(),
        ),
      },
    };

    const result = await runChatSession({
      client: client as never,
      input: { content: "hi" },
    });

    expect(result.status).toBe("completed");
    if (result.status === "completed") {
      expect(result.messageId).toBe("msg-1");
      expect(result.assistant.content).toContain("hello");
    }
  });

  it("attaches to an existing generation without starting a new one", async () => {
    const startGeneration = vi.fn();
    const subscribeGeneration = vi.fn().mockResolvedValue(
      (async function* () {
        yield { type: "text" as const, content: "attached" };
        yield {
          type: "done" as const,
          generationId: "gen-attached",
          conversationId: "conv-attached",
          messageId: "msg-attached",
          usage: {
            inputTokens: 1,
            outputTokens: 1,
            totalCostUsd: 0,
          },
        };
      })(),
    );
    const client = {
      generation: {
        startGeneration,
        subscribeGeneration,
      },
    };

    const result = await runChatSession({
      client: client as never,
      generationId: "gen-attached",
    });

    expect(startGeneration).not.toHaveBeenCalled();
    expect(subscribeGeneration).toHaveBeenCalledWith(
      { generationId: "gen-attached" },
      expect.any(Object),
    );
    expect(result.status).toBe("completed");
    if (result.status === "completed") {
      expect(result.conversationId).toBe("conv-attached");
      expect(result.assistant.content).toContain("attached");
    }
  });

  it("keeps stream error diagnostics on failed chat results", async () => {
    const client = {
      generation: {
        startGeneration: vi.fn().mockResolvedValue({
          generationId: "gen-error",
          conversationId: "conv-error",
        }),
        subscribeGeneration: vi.fn().mockResolvedValue(
          (async function* () {
            yield {
              type: "error" as const,
              message: "The sandbox stopped while this run was still active.",
              diagnosticMessage: "SandboxError: 403: blocked: team is blocked",
            };
          })(),
        ),
      },
    };

    const result = await runChatSession({
      client: client as never,
      input: { content: "hi" },
    });

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.error.message).toBe("The sandbox stopped while this run was still active.");
      expect(result.error.diagnosticMessage).toBe(
        "SandboxError: 403: blocked: team is blocked",
      );
    }
  });
});
