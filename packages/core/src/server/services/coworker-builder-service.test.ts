import { ORPCError } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { syncCoworkerScheduleJobMock, generateCoworkerMetadataOnFirstPromptFillMock } = vi.hoisted(
  () => ({
  syncCoworkerScheduleJobMock: vi.fn(),
    generateCoworkerMetadataOnFirstPromptFillMock: vi.fn(),
  }),
);

vi.mock("./coworker-scheduler", () => ({
  syncCoworkerScheduleJob: syncCoworkerScheduleJobMock,
}));

vi.mock("./coworker-metadata", () => ({
  generateCoworkerMetadataOnFirstPromptFill: generateCoworkerMetadataOnFirstPromptFillMock,
}));

import {
  applyCoworkerBuilderPatch,
  extractCoworkerBuilderPatch,
  coworkerBuilderPatchEnvelopeSchema,
} from "./coworker-builder-service";

function createDbStub() {
  const findFirst = vi.fn();
  const returning = vi.fn();
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));

  return {
    db: {
      query: {
        coworker: {
          findFirst,
        },
      },
      update,
    },
    mocks: {
      findFirst,
      returning,
      where,
      set,
      update,
    },
  };
}

describe("coworker-builder-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateCoworkerMetadataOnFirstPromptFillMock.mockResolvedValue({});
  });

  it("extracts a valid coworker patch and strips it from assistant text", () => {
    const result = extractCoworkerBuilderPatch(
      [
        "Updated your coworker.",
        "```coworker_builder_patch",
        '{"baseUpdatedAt":"2026-03-03T12:00:00.000Z","patch":{"prompt":"new prompt"}}',
        "```",
      ].join("\n"),
    );

    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }
    expect(result.envelope.patch.prompt).toBe("new prompt");
    expect(result.sanitizedText).toBe("Updated your coworker.");
  });

  it("rejects malformed patch content", () => {
    const result = extractCoworkerBuilderPatch(
      '```coworker_builder_patch\n{"baseUpdatedAt":"oops"}\n```',
    );
    expect(result.status).toBe("invalid");
  });

  it("normalizes common hourly patch aliases", () => {
    const result = extractCoworkerBuilderPatch(
      [
        "```coworker_builder_patch",
        JSON.stringify({
          baseUpdatedAt: "2026-03-03T12:00:00.000Z",
          patch: {
            triggerType: "hourly",
            integrations: ["slack"],
            schedule: { cron: "0 * * * *" },
          },
        }),
        "```",
      ].join("\n"),
    );

    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }

    expect(result.envelope.patch.triggerType).toBe("schedule");
    expect(result.envelope.patch.allowedIntegrations).toEqual(["slack"]);
    expect(result.envelope.patch.schedule).toEqual({
      type: "interval",
      intervalMinutes: 60,
    });
  });

  it("drops invalid schedule when trigger is not schedule", () => {
    const result = extractCoworkerBuilderPatch(
      [
        "```coworker_builder_patch",
        JSON.stringify({
          baseUpdatedAt: "2026-03-03T12:00:00.000Z",
          patch: {
            triggerType: "manual",
            prompt: "keep manual",
            schedule: { cron: "invalid cron" },
          },
        }),
        "```",
      ].join("\n"),
    );

    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }
    expect(result.envelope.patch.triggerType).toBe("manual");
    expect(result.envelope.patch.schedule).toBeUndefined();
  });

  it("enforces strict envelope schema", () => {
    const parsed = coworkerBuilderPatchEnvelopeSchema.safeParse({
      baseUpdatedAt: "2026-03-03T12:00:00.000Z",
      patch: { prompt: "x" },
      extra: true,
    });
    expect(parsed.success).toBe(false);
  });

  it("returns conflict on stale baseUpdatedAt", async () => {
    const { db, mocks } = createDbStub();
    const oldDate = new Date("2026-03-03T12:00:00.000Z");
    const newDate = new Date("2026-03-03T12:01:00.000Z");

    mocks.findFirst
      .mockResolvedValueOnce({
        id: "wf-1",
        ownerId: "user-1",
        builderConversationId: "conv-1",
        name: "",
        description: null,
        username: null,
        prompt: "old",
        model: "anthropic/claude-sonnet-4-6",
        promptDo: null,
        promptDont: null,
        triggerType: "manual",
        schedule: null,
        allowedIntegrations: ["github"],
        allowedCustomIntegrations: [],
        autoApprove: true,
        updatedAt: oldDate,
      })
      .mockResolvedValueOnce({
        id: "wf-1",
        prompt: "latest",
        model: "anthropic/claude-sonnet-4-6",
        toolAccessMode: "all",
        triggerType: "manual",
        schedule: null,
        allowedIntegrations: ["github"],
        updatedAt: newDate,
      });
    mocks.returning.mockResolvedValueOnce([]);

    const result = await applyCoworkerBuilderPatch({
      database: db as never,
      userId: "user-1",
      userRole: "admin",
      coworkerId: "wf-1",
      conversationId: "conv-1",
      baseUpdatedAt: oldDate.toISOString(),
      patch: { prompt: "new prompt" },
    });

    expect(result.status).toBe("conflict");
    if (result.status !== "conflict") {
      return;
    }
    expect(result.coworker.updatedAt).toBe(newDate.toISOString());
  });

  it("rejects invalid trigger/schedule combinations", async () => {
    const { db, mocks } = createDbStub();
    const updatedAt = new Date("2026-03-03T12:00:00.000Z");
    mocks.findFirst.mockResolvedValueOnce({
      id: "wf-1",
      ownerId: "user-1",
      builderConversationId: "conv-1",
      name: "",
      description: null,
      username: null,
      prompt: "old",
      model: "anthropic/claude-sonnet-4-6",
      promptDo: null,
      promptDont: null,
      triggerType: "manual",
      schedule: null,
      allowedIntegrations: ["github"],
      allowedCustomIntegrations: [],
      autoApprove: true,
      updatedAt,
    });

    const result = await applyCoworkerBuilderPatch({
      database: db as never,
      userId: "user-1",
      userRole: "admin",
      coworkerId: "wf-1",
      conversationId: "conv-1",
      baseUpdatedAt: updatedAt.toISOString(),
      patch: { triggerType: "schedule" },
    });

    expect(result.status).toBe("validation_error");
  });

  it("enforces builder conversation linkage", async () => {
    const { db, mocks } = createDbStub();
    mocks.findFirst.mockResolvedValueOnce({
      id: "wf-1",
      ownerId: "user-1",
      builderConversationId: "conv-expected",
      name: "",
      description: null,
      username: null,
      prompt: "old",
      model: "anthropic/claude-sonnet-4-6",
      promptDo: null,
      promptDont: null,
      triggerType: "manual",
      schedule: null,
      allowedIntegrations: ["github"],
      allowedCustomIntegrations: [],
      autoApprove: true,
      updatedAt: new Date("2026-03-03T12:00:00.000Z"),
    });

    await expect(
      applyCoworkerBuilderPatch({
        database: db as never,
        userId: "user-1",
        userRole: "admin",
        coworkerId: "wf-1",
        conversationId: "conv-other",
        baseUpdatedAt: "2026-03-03T12:00:00.000Z",
        patch: { prompt: "new" },
      }),
    ).rejects.toBeInstanceOf(ORPCError);
  });

  it("applies prompt changes and reports changed fields", async () => {
    const { db, mocks } = createDbStub();
    const updatedAt = new Date("2026-03-03T12:00:00.000Z");
    const nextUpdatedAt = new Date("2026-03-03T12:01:00.000Z");
    mocks.findFirst.mockResolvedValueOnce({
      id: "wf-1",
      ownerId: "user-1",
      builderConversationId: "conv-1",
      name: "",
      description: null,
      username: null,
      prompt: "old",
      model: "anthropic/claude-sonnet-4-6",
      promptDo: null,
      promptDont: null,
      triggerType: "manual",
      schedule: null,
      allowedIntegrations: ["github"],
      allowedCustomIntegrations: [],
      autoApprove: true,
      updatedAt,
    });
    mocks.returning.mockResolvedValueOnce([
      {
        id: "wf-1",
        prompt: "new prompt",
        model: "anthropic/claude-sonnet-4-6",
        triggerType: "manual",
        schedule: null,
        allowedIntegrations: ["github"],
        updatedAt: nextUpdatedAt,
        status: "on",
      },
    ]);

    const result = await applyCoworkerBuilderPatch({
      database: db as never,
      userId: "user-1",
      userRole: "admin",
      coworkerId: "wf-1",
      conversationId: "conv-1",
      baseUpdatedAt: updatedAt.toISOString(),
      patch: { prompt: "new prompt" },
    });

    expect(result.status).toBe("applied");
    if (result.status !== "applied") {
      return;
    }
    expect(result.appliedChanges).toEqual(["prompt"]);
    expect(syncCoworkerScheduleJobMock).not.toHaveBeenCalled();
  });

  it("fills missing metadata when builder sets the first prompt", async () => {
    const { db, mocks } = createDbStub();
    const updatedAt = new Date("2026-03-03T12:00:00.000Z");
    const nextUpdatedAt = new Date("2026-03-03T12:01:00.000Z");
    generateCoworkerMetadataOnFirstPromptFillMock.mockResolvedValueOnce({
      name: "Sales Follow Up",
      description: "Follows up with leads after calls.",
      username: "sales-follow-up",
    });
    mocks.findFirst.mockResolvedValueOnce({
      id: "wf-1",
      ownerId: "user-1",
      builderConversationId: "conv-1",
      name: "",
      description: null,
      username: null,
      prompt: "   ",
      model: "anthropic/claude-sonnet-4-6",
      promptDo: null,
      promptDont: null,
      triggerType: "manual",
      schedule: null,
      allowedIntegrations: ["github"],
      allowedCustomIntegrations: [],
      autoApprove: true,
      updatedAt,
    });
    mocks.returning.mockResolvedValueOnce([
      {
        id: "wf-1",
        prompt: "new prompt",
        model: "anthropic/claude-sonnet-4-6",
        triggerType: "manual",
        schedule: null,
        allowedIntegrations: ["github"],
        updatedAt: nextUpdatedAt,
        status: "on",
      },
    ]);

    const result = await applyCoworkerBuilderPatch({
      database: db as never,
      userId: "user-1",
      userRole: "admin",
      coworkerId: "wf-1",
      conversationId: "conv-1",
      baseUpdatedAt: updatedAt.toISOString(),
      patch: { prompt: "new prompt" },
    });

    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "new prompt",
        name: "Sales Follow Up",
        description: "Follows up with leads after calls.",
        username: "sales-follow-up",
      }),
    );
    expect(result.status).toBe("applied");
    if (result.status !== "applied") {
      return;
    }
    expect(result.appliedChanges).toEqual(["name", "description", "username", "prompt"]);
  });

  it("applies model changes and reports them", async () => {
    const { db, mocks } = createDbStub();
    const updatedAt = new Date("2026-03-03T12:00:00.000Z");
    const nextUpdatedAt = new Date("2026-03-03T12:01:00.000Z");
    mocks.findFirst.mockResolvedValueOnce({
      id: "wf-1",
      ownerId: "user-1",
      builderConversationId: "conv-1",
      name: "",
      description: null,
      username: null,
      prompt: "old",
      model: "anthropic/claude-sonnet-4-6",
      promptDo: null,
      promptDont: null,
      triggerType: "manual",
      schedule: null,
      allowedIntegrations: ["github"],
      allowedCustomIntegrations: [],
      autoApprove: true,
      updatedAt,
    });
    mocks.returning.mockResolvedValueOnce([
      {
        id: "wf-1",
        prompt: "old",
        model: "openai/gpt-5.2-codex",
        triggerType: "manual",
        schedule: null,
        allowedIntegrations: ["github"],
        updatedAt: nextUpdatedAt,
        status: "on",
      },
    ]);

    const result = await applyCoworkerBuilderPatch({
      database: db as never,
      userId: "user-1",
      userRole: "admin",
      coworkerId: "wf-1",
      conversationId: "conv-1",
      baseUpdatedAt: updatedAt.toISOString(),
      patch: { model: "openai/gpt-5.2-codex" },
    });

    expect(result.status).toBe("applied");
    if (result.status !== "applied") {
      return;
    }
    expect(result.appliedChanges).toEqual(["model"]);
    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "openai/gpt-5.2-codex",
      }),
    );
  });
});
