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
});
