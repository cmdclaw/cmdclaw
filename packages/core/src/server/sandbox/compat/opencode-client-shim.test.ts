import { describe, expect, it, vi } from "vitest";
import { createRuntimeHarnessClientFromOpencodeClient } from "./opencode-client-shim";

describe("createRuntimeHarnessClientFromOpencodeClient", () => {
  it("forwards agent to client.session.prompt", async () => {
    const promptMock = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });
    const client = {
      event: {
        subscribe: vi.fn(),
      },
      session: {
        prompt: promptMock,
        abort: vi.fn(),
        messages: vi.fn(),
        get: vi.fn(),
        create: vi.fn(),
      },
      permission: {
        reply: vi.fn(),
      },
      question: {
        reply: vi.fn(),
        reject: vi.fn(),
      },
    } as Parameters<typeof createRuntimeHarnessClientFromOpencodeClient>[0];

    const harness = createRuntimeHarnessClientFromOpencodeClient(client);
    await harness.prompt({
      sessionID: "session-1",
      agent: "cmdclaw-chat",
      parts: [{ type: "text", text: "hello" }],
      system: "runtime system prompt",
    });

    expect(promptMock).toHaveBeenCalledWith({
      sessionID: "session-1",
      agent: "cmdclaw-chat",
      parts: [{ type: "text", text: "hello" }],
      system: "runtime system prompt",
    });
  });
});
