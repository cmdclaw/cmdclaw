import { describe, expect, it, vi } from "vitest";
import {
  handleChatRun,
  handleCoworkerGet,
  handleCoworkerList,
  handleCoworkerLogs,
  handleCoworkerRun,
} from "./handlers";

describe("MCP handlers", () => {
  it("surfaces needs_auth from chat runs", async () => {
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

    const result = await handleChatRun({
      client: client as never,
      message: "hi",
    });

    expect(result.status).toBe("needs_auth");
  });

  it("lists coworkers", async () => {
    const client = {
      coworker: {
        list: vi.fn().mockResolvedValue([{ id: "cw-1", name: "Daily", username: "daily" }]),
      },
    };

    const result = await handleCoworkerList(client as never);
    expect(result.status).toBe("completed");
    expect(result.coworkers).toHaveLength(1);
  });

  it("gets a coworker by username reference", async () => {
    const client = {
      coworker: {
        list: vi.fn().mockResolvedValue([{ id: "cw-1", name: "Daily", username: "daily" }]),
        get: vi.fn().mockResolvedValue({ id: "cw-1", name: "Daily" }),
      },
    };

    const result = await handleCoworkerGet(client as never, "@daily");
    expect(result.coworker).toMatchObject({ id: "cw-1" });
  });

  it("triggers a coworker run", async () => {
    const client = {
      coworker: {
        list: vi.fn().mockResolvedValue([{ id: "cw-1", name: "Daily", username: "daily" }]),
        trigger: vi.fn().mockResolvedValue({ runId: "run-1", coworkerId: "cw-1" }),
      },
    };

    const result = await handleCoworkerRun({
      client: client as never,
      reference: "@daily",
      payload: { source: "test" },
    });

    expect(result.run).toMatchObject({ runId: "run-1" });
  });

  it("returns coworker logs", async () => {
    const client = {
      coworker: {
        getRun: vi.fn().mockResolvedValue({ id: "run-1", status: "completed", events: [] }),
      },
    };

    const result = await handleCoworkerLogs(client as never, "run-1");
    expect(result.run).toMatchObject({ id: "run-1" });
  });
});
