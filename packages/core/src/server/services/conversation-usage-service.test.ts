import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

process.env.BETTER_AUTH_SECRET = "test-secret";
process.env.DATABASE_URL = "postgres://localhost/test";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.OPENAI_API_KEY = "test-openai-key";
process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
process.env.SANDBOX_DEFAULT = "docker";
process.env.ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.CMDCLAW_SERVER_SECRET = "1".repeat(64);
process.env.AWS_ENDPOINT_URL = "https://s3.example.com";
process.env.AWS_ACCESS_KEY_ID = "test-access-key";
process.env.AWS_SECRET_ACCESS_KEY = "test-secret-key";

const getOrCreateConversationRuntimeMock = vi.fn();

vi.mock("../sandbox/core/orchestrator", () => ({
  getOrCreateConversationRuntime: getOrCreateConversationRuntimeMock,
}));

let aggregateConversationUsageFromSessionMessages: typeof import("./conversation-usage-service").aggregateConversationUsageFromSessionMessages;
let getConversationUsageFromOpenCodeSession: typeof import("./conversation-usage-service").getConversationUsageFromOpenCodeSession;

describe("conversation-usage-service", () => {
  beforeAll(async () => {
    ({
      aggregateConversationUsageFromSessionMessages,
      getConversationUsageFromOpenCodeSession,
    } = await import("./conversation-usage-service"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("aggregates assistant token usage from session messages", () => {
    const totals = aggregateConversationUsageFromSessionMessages([
      {
        info: {
          role: "assistant",
          tokens: { input: 10, output: 20 },
        },
      },
      {
        info: {
          role: "user",
        },
      },
      {
        info: {
          role: "assistant",
          tokens: { input: 5, output: 7 },
        },
      },
    ]);

    expect(totals).toEqual({
      inputTokens: 15,
      outputTokens: 27,
      totalTokens: 42,
      assistantMessageCount: 2,
    });
  });

  it("treats missing token fields as zero", () => {
    const totals = aggregateConversationUsageFromSessionMessages([
      {
        info: {
          role: "assistant",
        },
      },
      {
        info: {
          role: "assistant",
          tokens: { input: 12 },
        },
      },
    ]);

    expect(totals).toEqual({
      inputTokens: 12,
      outputTokens: 0,
      totalTokens: 12,
      assistantMessageCount: 2,
    });
  });

  it("returns usage from a live reused session", async () => {
    getOrCreateConversationRuntimeMock.mockResolvedValue({
      session: { id: "session-1" },
      sessionSource: "live_session",
      harnessClient: {
        messages: vi.fn().mockResolvedValue({
          data: [
            { info: { role: "assistant", tokens: { input: 3, output: 4 } } },
            { info: { role: "assistant", tokens: { input: 5, output: 6 } } },
          ],
          error: null,
        }),
      },
    });

    const usage = await getConversationUsageFromOpenCodeSession({
      conversationId: "conv-1",
      userId: "user-1",
      model: "anthropic/claude-sonnet-4-6",
      runtimeHarness: "opencode",
    });

    expect(usage).toEqual({
      inputTokens: 8,
      outputTokens: 10,
      totalTokens: 18,
      assistantMessageCount: 2,
      sessionId: "session-1",
      source: "live_session",
    });
  });

  it("returns usage from a restored snapshot session", async () => {
    getOrCreateConversationRuntimeMock.mockResolvedValue({
      session: { id: "session-2" },
      sessionSource: "restored_snapshot",
      harnessClient: {
        messages: vi.fn().mockResolvedValue({
          data: [{ info: { role: "assistant", tokens: { input: 7, output: 9 } } }],
          error: null,
        }),
      },
    });

    const usage = await getConversationUsageFromOpenCodeSession({
      conversationId: "conv-2",
      userId: "user-2",
      model: "anthropic/claude-sonnet-4-6",
      runtimeHarness: "opencode",
    });

    expect(usage).toEqual({
      inputTokens: 7,
      outputTokens: 9,
      totalTokens: 16,
      assistantMessageCount: 1,
      sessionId: "session-2",
      source: "restored_snapshot",
    });
  });

  it("fails when the session had to be recreated from scratch", async () => {
    getOrCreateConversationRuntimeMock.mockResolvedValue({
      session: { id: "session-3" },
      sessionSource: "created_session",
      harnessClient: {
        messages: vi.fn(),
      },
    });

    await expect(
      getConversationUsageFromOpenCodeSession({
        conversationId: "conv-3",
        userId: "user-3",
        model: "anthropic/claude-sonnet-4-6",
        runtimeHarness: "opencode",
      }),
    ).rejects.toThrow("could not be restored");
  });
});
