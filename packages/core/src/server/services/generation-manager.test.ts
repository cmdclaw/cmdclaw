import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  updateWhereMock,
  updateSetMock,
  insertReturningMock,
  insertValuesMock,
  generationFindFirstMock,
  generationFindManyMock,
  messageFindFirstMock,
  conversationFindFirstMock,
  conversationQueuedMessageFindManyMock,
  coworkerRunFindFirstMock,
  coworkerFindFirstMock,
  providerAuthFindFirstMock,
  queueAddMock,
  dbMock,
} = vi.hoisted(() => {
  const updateWhereMock = vi.fn();
  const updateSetMock = vi.fn(() => ({ where: updateWhereMock }));
  const updateMock = vi.fn(() => ({ set: updateSetMock }));

  const insertReturningMock = vi.fn();
  const insertValuesMock = vi.fn(() => ({ returning: insertReturningMock }));
  const insertMock = vi.fn(() => ({ values: insertValuesMock }));
  const generationFindFirstMock = vi.fn();
  const generationFindManyMock = vi.fn();
  const messageFindFirstMock = vi.fn();
  const conversationFindFirstMock = vi.fn();
  const conversationQueuedMessageFindManyMock = vi.fn();
  const coworkerRunFindFirstMock = vi.fn();
  const coworkerFindFirstMock = vi.fn();
  const providerAuthFindFirstMock = vi.fn();
  const queueAddMock = vi.fn();

  const dbMock = {
    query: {
      generation: { findFirst: generationFindFirstMock, findMany: generationFindManyMock },
      message: { findFirst: messageFindFirstMock },
      conversation: { findFirst: conversationFindFirstMock },
      conversationQueuedMessage: { findMany: conversationQueuedMessageFindManyMock },
      coworkerRun: { findFirst: coworkerRunFindFirstMock },
      coworker: { findFirst: coworkerFindFirstMock },
      providerAuth: { findFirst: providerAuthFindFirstMock, findMany: vi.fn(() => []) },
      skill: { findMany: vi.fn(() => []) },
      customIntegrationCredential: { findMany: vi.fn(() => []) },
    },
    update: updateMock,
    insert: insertMock,
  };

  return {
    updateWhereMock,
    updateSetMock,
    insertReturningMock,
    insertValuesMock,
    generationFindFirstMock,
    generationFindManyMock,
    messageFindFirstMock,
    conversationFindFirstMock,
    conversationQueuedMessageFindManyMock,
    coworkerRunFindFirstMock,
    coworkerFindFirstMock,
    providerAuthFindFirstMock,
    queueAddMock,
    dbMock,
  };
});

const {
  publishGenerationStreamEventMock,
  readGenerationStreamAfterMock,
  generationStreamExistsMock,
  getLatestGenerationStreamCursorMock,
  getLatestGenerationStreamEnvelopeMock,
} = vi.hoisted(() => ({
  publishGenerationStreamEventMock: vi.fn(async () => "1-1"),
  readGenerationStreamAfterMock: vi.fn(async () => []),
  generationStreamExistsMock: vi.fn(async () => false),
  getLatestGenerationStreamCursorMock: vi.fn(async () => null),
  getLatestGenerationStreamEnvelopeMock: vi.fn(async () => null),
}));

const { isStatelessServerlessRuntimeMock } = vi.hoisted(() => ({
  isStatelessServerlessRuntimeMock: vi.fn(() => false),
}));

const {
  sandboxSlotAcquireMock,
  sandboxSlotRenewMock,
  sandboxSlotReleaseMock,
  sandboxSlotClearPendingMock,
} = vi.hoisted(() => ({
  sandboxSlotAcquireMock: vi.fn(async () => ({
    granted: true as const,
    token: "slot-token",
    activeCount: 1,
    requestAtMs: Date.now(),
  })),
  sandboxSlotRenewMock: vi.fn(async () => true),
  sandboxSlotReleaseMock: vi.fn(async () => undefined),
  sandboxSlotClearPendingMock: vi.fn(async () => undefined),
}));

const {
  interruptStore,
  createInterruptMock,
  getInterruptMock,
  getPendingInterruptForGenerationMock,
  listPendingInterruptsForGenerationMock,
  findPendingInterruptByToolUseIdMock,
  findPendingAuthInterruptByIntegrationMock,
  refreshInterruptExpiryMock,
  resolveInterruptMock,
  expireInterruptMock,
  cancelInterruptsForGenerationMock,
  projectInterruptEventMock,
} = vi.hoisted(() => {
  const interruptStore = new Map<string, any>();

  const projectInterruptEventMock = vi.fn((interrupt: any) => ({
    interruptId: interrupt.id,
    generationId: interrupt.generationId,
    conversationId: interrupt.conversationId,
    kind: interrupt.kind,
    status: interrupt.status,
    providerToolUseId: interrupt.providerToolUseId,
    display: interrupt.display,
    responsePayload: interrupt.responsePayload,
  }));

  const createInterruptMock = vi.fn(async (input: any) => {
    const interrupt = {
      id: `interrupt-${input.providerToolUseId ?? input.kind}`,
      generationId: input.generationId,
      conversationId: input.conversationId,
      kind: input.kind,
      status: "pending",
      display: input.display,
      provider: input.provider,
      providerRequestId: input.providerRequestId ?? null,
      providerToolUseId: input.providerToolUseId,
      responsePayload: undefined,
      requestedAt: new Date("2026-03-11T15:00:00.000Z"),
      expiresAt: input.expiresAt ?? null,
      resolvedAt: null,
      requestedByUserId: input.requestedByUserId ?? null,
      resolvedByUserId: null,
    };
    interruptStore.set(interrupt.id, interrupt);
    return interrupt;
  });

  const getInterruptMock = vi.fn(async (interruptId: string) => interruptStore.get(interruptId) ?? null);

  const getPendingInterruptForGenerationMock = vi.fn(async (generationId: string) => {
    const pending = [...interruptStore.values()].find(
      (interrupt) => interrupt.generationId === generationId && interrupt.status === "pending",
    );
    return pending ?? null;
  });

  const listPendingInterruptsForGenerationMock = vi.fn(async (generationId: string) =>
    [...interruptStore.values()].filter(
      (interrupt) => interrupt.generationId === generationId && interrupt.status === "pending",
    ),
  );

  const findPendingInterruptByToolUseIdMock = vi.fn(async (params: any) => {
    const interrupt = [...interruptStore.values()].find(
      (entry) =>
        entry.generationId === params.generationId &&
        entry.providerToolUseId === params.providerToolUseId &&
        entry.status === "pending",
    );
    return interrupt ?? null;
  });

  const findPendingAuthInterruptByIntegrationMock = vi.fn(async (params: any) => {
    const interrupt = [...interruptStore.values()].find(
      (entry) =>
        entry.generationId === params.generationId &&
        entry.kind === "auth" &&
        entry.status === "pending" &&
        entry.display.authSpec?.integrations?.includes(params.integration),
    );
    return interrupt ?? null;
  });

  const resolveInterruptMock = vi.fn(async (params: any) => {
    const existing = interruptStore.get(params.interruptId);
    if (!existing) {
      return null;
    }
    const resolved = {
      ...existing,
      status: params.status,
      responsePayload: params.responsePayload,
      resolvedAt: new Date("2026-03-11T15:01:00.000Z"),
      resolvedByUserId: params.resolvedByUserId ?? null,
    };
    interruptStore.set(resolved.id, resolved);
    return resolved;
  });

  const refreshInterruptExpiryMock = vi.fn(async (interruptId: string, expiresAt: Date) => {
    const existing = interruptStore.get(interruptId);
    if (!existing) {
      return null;
    }
    const refreshed = { ...existing, expiresAt };
    interruptStore.set(refreshed.id, refreshed);
    return refreshed;
  });

  const expireInterruptMock = vi.fn(async (interruptId: string) =>
    resolveInterruptMock({ interruptId, status: "expired" }),
  );

  const cancelInterruptsForGenerationMock = vi.fn(async (generationId: string) => {
    for (const interrupt of interruptStore.values()) {
      if (interrupt.generationId === generationId && interrupt.status === "pending") {
        interrupt.status = "cancelled";
        interrupt.resolvedAt = new Date("2026-03-11T15:01:00.000Z");
      }
    }
  });

  return {
    interruptStore,
    createInterruptMock,
    getInterruptMock,
    getPendingInterruptForGenerationMock,
    listPendingInterruptsForGenerationMock,
    findPendingInterruptByToolUseIdMock,
    findPendingAuthInterruptByIntegrationMock,
    refreshInterruptExpiryMock,
    resolveInterruptMock,
    expireInterruptMock,
    cancelInterruptsForGenerationMock,
    projectInterruptEventMock,
  };
});

const { ensureBucketMock, uploadToS3Mock } = vi.hoisted(() => ({
  ensureBucketMock: vi.fn(),
  uploadToS3Mock: vi.fn(),
}));

vi.mock("../../env", () => ({
  env: {},
}));

vi.mock("@cmdclaw/db/client", () => ({
  db: dbMock,
}));

vi.mock("../sandbox/opencode-session", () => ({
  getOrCreateSession: vi.fn(),
  writeSkillsToSandbox: vi.fn(),
  getSkillsSystemPrompt: vi.fn(() => ""),
  writeResolvedIntegrationSkillsToSandbox: vi.fn(),
  getIntegrationSkillsSystemPrompt: vi.fn(() => ""),
}));

vi.mock("../integrations/cli-env", () => ({
  getCliEnvForUser: vi.fn(),
  getCliInstructions: vi.fn(() => ""),
  getCliInstructionsWithCustom: vi.fn(() => ""),
  getEnabledIntegrationTypes: vi.fn(() => []),
}));

vi.mock("../utils/generate-title", () => ({
  generateConversationTitle: vi.fn(),
}));

vi.mock("../sandbox/factory", () => ({
  getPreferredCloudSandboxProvider: vi.fn(() => "e2b"),
}));

vi.mock("../ai/permission-checker", () => ({
  parseBashCommand: vi.fn(() => null),
}));

vi.mock("./memory-service", () => ({
  buildMemorySystemPrompt: vi.fn(() => ""),
  readMemoryFile: vi.fn(),
  searchMemoryWithSessions: vi.fn(() => []),
  syncMemoryToSandbox: vi.fn(),
  writeMemoryEntry: vi.fn(),
  writeSessionTranscriptFromConversation: vi.fn(),
}));

vi.mock("./sandbox-file-service", () => ({
  uploadSandboxFile: vi.fn(),
  collectNewSandboxFiles: vi.fn(() => []),
}));

vi.mock("../storage/s3-client", () => ({
  ensureBucket: ensureBucketMock,
  uploadToS3: uploadToS3Mock,
}));

vi.mock("./integration-skill-service", () => ({
  createCommunityIntegrationSkill: vi.fn(),
  resolvePreferredCommunitySkillsForUser: vi.fn(() => []),
}));

vi.mock("../utils/observability", () => ({
  createTraceId: vi.fn(() => "trace-1"),
  logServerEvent: vi.fn(),
}));

vi.mock("../queues", () => ({
  buildQueueJobId: (parts: Array<string | number | null | undefined>) =>
    parts
      .map((part) => String(part ?? "").trim())
      .filter(Boolean)
      .join("-"),
  CHAT_GENERATION_JOB_NAME: "generation:chat-run",
  COWORKER_GENERATION_JOB_NAME: "generation:coworker-run",
  CONVERSATION_QUEUED_MESSAGE_PROCESS_JOB_NAME: "conversation:queued-message-process",
  GENERATION_APPROVAL_TIMEOUT_JOB_NAME: "generation:approval-timeout",
  GENERATION_AUTH_TIMEOUT_JOB_NAME: "generation:auth-timeout",
  GENERATION_PREPARING_STUCK_CHECK_JOB_NAME: "generation:preparing-stuck-check",
  getQueue: () => ({
    add: queueAddMock,
  }),
}));

vi.mock("../utils/runtime-platform", () => ({
  isStatelessServerlessRuntime: isStatelessServerlessRuntimeMock,
}));

vi.mock("./generation-interrupt-service", () => ({
  generationInterruptService: {
    createInterrupt: createInterruptMock,
    getInterrupt: getInterruptMock,
    getPendingInterruptForGeneration: getPendingInterruptForGenerationMock,
    listPendingInterruptsForGeneration: listPendingInterruptsForGenerationMock,
    findPendingInterruptByToolUseId: findPendingInterruptByToolUseIdMock,
    findPendingAuthInterruptByIntegration: findPendingAuthInterruptByIntegrationMock,
    refreshInterruptExpiry: refreshInterruptExpiryMock,
    resolveInterrupt: resolveInterruptMock,
    expireInterrupt: expireInterruptMock,
    cancelInterruptsForGeneration: cancelInterruptsForGenerationMock,
    projectInterruptEvent: projectInterruptEventMock,
  },
}));

vi.mock("./sandbox-slot-manager", () => ({
  getSandboxSlotManager: () => ({
    acquireLease: sandboxSlotAcquireMock,
    renewLease: sandboxSlotRenewMock,
    releaseLease: sandboxSlotReleaseMock,
    clearPendingRequest: sandboxSlotClearPendingMock,
    hasActiveLease: vi.fn(async () => false),
  }),
}));

vi.mock("../redis/generation-event-bus", () => ({
  publishGenerationStreamEvent: publishGenerationStreamEventMock,
  readGenerationStreamAfter: readGenerationStreamAfterMock,
  generationStreamExists: generationStreamExistsMock,
  getLatestGenerationStreamCursor: getLatestGenerationStreamCursorMock,
  getLatestGenerationStreamEnvelope: getLatestGenerationStreamEnvelopeMock,
}));

import {
  getCliEnvForUser,
  getCliInstructionsWithCustom,
  getEnabledIntegrationTypes,
} from "../integrations/cli-env";
import { getChatSystemBehaviorPrompt } from "../prompts/chat-system-behavior-prompt";
import { getCoworkerSystemBehaviorPrompt } from "../prompts/coworker-system-behavior-prompt";
import { getPreferredCloudSandboxProvider } from "../sandbox/factory";
import {
  getOrCreateSession,
  writeSkillsToSandbox,
  getSkillsSystemPrompt,
  writeResolvedIntegrationSkillsToSandbox,
  getIntegrationSkillsSystemPrompt,
} from "../sandbox/opencode-session";
import {
  buildDefaultQuestionAnswers,
  buildQuestionCommand,
  generationManager,
} from "./generation-manager";
import {
  syncMemoryToSandbox,
  buildMemorySystemPrompt,
} from "./memory-service";
import {
  uploadSandboxFile,
  collectNewSandboxFiles,
} from "./sandbox-file-service";
import { logServerEvent } from "../utils/observability";
import { env } from "../../env";

type GenerationCtx = {
  id: string;
  traceId: string;
  conversationId: string;
  userId: string;
  status: string;
  contentParts: unknown[];
  assistantContent: string;
  abortController: AbortController;
  pendingApproval: unknown;
  pendingAuth: {
    integrations?: string[];
    connectedIntegrations?: string[];
    requestedAt?: string;
    [key: string]: unknown;
  } | null;
  usage: { inputTokens: number; outputTokens: number; totalCostUsd: number };
  startedAt: Date;
  lastSaveAt: Date;
  isNewConversation: boolean;
  model: string;
  userMessageContent: string;
  assistantMessageIds: Set<string>;
  messageRoles: Map<string, string>;
  pendingMessageParts: Map<string, unknown>;
  backendType: string;
  autoApprove: boolean;
  uploadedSandboxFileIds?: Set<string>;
  [key: string]: unknown;
};

type GenerationManagerTestHarness = {
  activeGenerations: Map<string, GenerationCtx>;
  finishGeneration: (ctx: GenerationCtx, status: string) => Promise<void>;
  runGeneration: (ctx: GenerationCtx) => Promise<void>;
  handleSessionReset: (ctx: GenerationCtx) => Promise<void>;
  runOpenCodeGeneration: (ctx: GenerationCtx) => Promise<void>;
  buildCoworkerPrompt: (ctx: GenerationCtx) => string | null;
  buildCoworkerBuilderPrompt: (ctx: GenerationCtx) => string | null;
  processOpencodeEvent: (...args: unknown[]) => Promise<void>;
  handleOpenCodeActionableEvent: (...args: unknown[]) => Promise<unknown>;
  handleOpenCodePermissionAsked: (...args: unknown[]) => Promise<void>;
  importIntegrationSkillDraftsFromSandbox: (...args: unknown[]) => Promise<void>;
  waitForAuth: (...args: unknown[]) => Promise<{ success: boolean }>;
  waitForApproval: (...args: unknown[]) => Promise<string>;
};

function asTestManager(): GenerationManagerTestHarness {
  return generationManager as unknown as GenerationManagerTestHarness;
}

function createCtx(overrides: Partial<GenerationCtx> = {}): GenerationCtx {
  const ctx: GenerationCtx = {
    id: "gen-1",
    traceId: "trace-1",
    conversationId: "conv-1",
    userId: "user-1",
    status: "running",
    contentParts: [],
    assistantContent: "",
    abortController: new AbortController(),
    pendingApproval: null,
    pendingAuth: null,
    usage: { inputTokens: 0, outputTokens: 0, totalCostUsd: 0 },
    startedAt: new Date(),
    lastSaveAt: new Date(),
    isNewConversation: false,
    model: "openai/gpt-4",
    userMessageContent: "hello",
    assistantMessageIds: new Set(),
    messageRoles: new Map(),
    pendingMessageParts: new Map(),
    backendType: "opencode",
    autoApprove: false,
    ...overrides,
  };
  return ctx;
}

function deriveInterruptFromCtx(ctx: GenerationCtx): any | null {
  if (ctx.status === "awaiting_approval" && ctx.pendingApproval) {
    const pendingApproval = ctx.pendingApproval as {
      toolUseId: string;
      toolName?: string;
      toolInput?: Record<string, unknown>;
      integration?: string;
      operation?: string;
      command?: string;
      requestedAt?: string;
      expiresAt?: string;
    };
    return {
      id: `interrupt-${pendingApproval.toolUseId}`,
      generationId: ctx.id,
      conversationId: ctx.conversationId,
      kind:
        pendingApproval.operation === "question" || pendingApproval.operation === "permission"
          ? pendingApproval.operation === "question"
            ? "runtime_question"
            : "runtime_permission"
          : "plugin_write",
      status: "pending",
      display: {
        title: pendingApproval.toolName ?? "Bash",
        integration: pendingApproval.integration ?? "cmdclaw",
        operation: pendingApproval.operation ?? "unknown",
        command: pendingApproval.command,
        toolInput: pendingApproval.toolInput ?? {},
      },
      provider: "plugin",
      providerRequestId: null,
      providerToolUseId: pendingApproval.toolUseId,
      responsePayload: undefined,
      requestedAt: new Date(pendingApproval.requestedAt ?? "2026-03-11T15:00:00.000Z"),
      expiresAt: pendingApproval.expiresAt ? new Date(pendingApproval.expiresAt) : null,
      resolvedAt: null,
      requestedByUserId: null,
      resolvedByUserId: null,
    };
  }

  if (ctx.status === "awaiting_auth" && ctx.pendingAuth) {
    const pendingAuth = ctx.pendingAuth;
    return {
      id: `interrupt-auth-${ctx.id}`,
      generationId: ctx.id,
      conversationId: ctx.conversationId,
      kind: "auth",
      status: "pending",
      display: {
        title: "Auth Required",
        authSpec: {
          integrations: pendingAuth.integrations ?? [],
          connectedIntegrations: pendingAuth.connectedIntegrations ?? [],
        },
      },
      provider: "plugin",
      providerRequestId: null,
      providerToolUseId: `auth-${ctx.id}`,
      responsePayload: {
        connectedIntegrations: pendingAuth.connectedIntegrations ?? [],
      },
      requestedAt: new Date(String(pendingAuth.requestedAt ?? "2026-03-11T15:00:00.000Z")),
      expiresAt: pendingAuth.expiresAt ? new Date(String(pendingAuth.expiresAt)) : null,
      resolvedAt: null,
      requestedByUserId: null,
      resolvedByUserId: null,
    };
  }

  return null;
}

function syncInterruptStateMocks(interrupt: {
  kind: "plugin_write" | "runtime_permission" | "runtime_question" | "auth";
  status: string;
} | null): void {
  const generationStatus =
    !interrupt || interrupt.status !== "pending"
      ? "running"
      : interrupt.kind === "auth"
        ? "awaiting_auth"
        : "awaiting_approval";
  const conversationStatus =
    !interrupt || interrupt.status !== "pending"
      ? "generating"
      : interrupt.kind === "auth"
        ? "awaiting_auth"
        : "awaiting_approval";

  updateSetMock({
    status: generationStatus,
    pendingApproval: null,
    pendingAuth: null,
  });
  updateSetMock({
    generationStatus: conversationStatus,
  });
}

async function collectEvents(generator: AsyncGenerator<unknown>) {
  const events: unknown[] = [];
  for await (const event of generator) {
    events.push(event);
  }
  return events;
}

async function* asAsyncIterable<T>(items: T[]) {
  for (const item of items) {
    yield item;
  }
}

describe("generationManager transitions", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.useFakeTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    interruptStore.clear();
    createInterruptMock.mockImplementation(async (input: any) => {
      const interrupt = {
        id: `interrupt-${input.providerToolUseId ?? input.kind}`,
        generationId: input.generationId,
        conversationId: input.conversationId,
        kind: input.kind,
        status: "pending",
        display: input.display,
        provider: input.provider,
        providerRequestId: input.providerRequestId ?? null,
        providerToolUseId: input.providerToolUseId,
        responsePayload: undefined,
        requestedAt: new Date("2026-03-11T15:00:00.000Z"),
        expiresAt: input.expiresAt ?? null,
        resolvedAt: null,
        requestedByUserId: input.requestedByUserId ?? null,
        resolvedByUserId: null,
      };
      interruptStore.set(interrupt.id, interrupt);
      syncInterruptStateMocks(interrupt);

      const activeCtx = asTestManager().activeGenerations.get(input.generationId);
      if (activeCtx) {
        activeCtx.currentInterruptId = interrupt.id;
        activeCtx.status = input.kind === "auth" ? "awaiting_auth" : "awaiting_approval";
        if (input.kind === "auth") {
          activeCtx.pendingAuth = {
            integrations: input.display.authSpec?.integrations ?? [],
            connectedIntegrations: input.display.authSpec?.connectedIntegrations ?? [],
            requestedAt: interrupt.requestedAt.toISOString(),
            expiresAt: interrupt.expiresAt?.toISOString(),
          };
        } else {
          activeCtx.pendingApproval = {
            toolUseId: input.providerToolUseId,
            toolName: input.display.title,
            toolInput: input.display.toolInput ?? {},
            integration: input.display.integration ?? "cmdclaw",
            operation: input.display.operation ?? "unknown",
            command: input.display.command,
            requestedAt: interrupt.requestedAt.toISOString(),
            expiresAt: interrupt.expiresAt?.toISOString(),
          };
        }
      }

      return interrupt;
    });
    getInterruptMock.mockImplementation(async (interruptId: string) => interruptStore.get(interruptId) ?? null);
    getPendingInterruptForGenerationMock.mockImplementation(async (generationId: string) => {
      const stored = [...interruptStore.values()].find(
        (interrupt) => interrupt.generationId === generationId && interrupt.status === "pending",
      );
      if (stored) {
        return stored;
      }
      const activeCtx = asTestManager().activeGenerations.get(generationId);
      return activeCtx ? deriveInterruptFromCtx(activeCtx) : null;
    });
    listPendingInterruptsForGenerationMock.mockImplementation(async (generationId: string) => {
      const stored = [...interruptStore.values()].filter(
        (interrupt) => interrupt.generationId === generationId && interrupt.status === "pending",
      );
      if (stored.length > 0) {
        return stored;
      }
      const activeCtx = asTestManager().activeGenerations.get(generationId);
      const derived = activeCtx ? deriveInterruptFromCtx(activeCtx) : null;
      return derived ? [derived] : [];
    });
    findPendingInterruptByToolUseIdMock.mockImplementation(async (params: any) => {
      const stored = [...interruptStore.values()].find(
        (entry) =>
          entry.generationId === params.generationId &&
          entry.providerToolUseId === params.providerToolUseId &&
          entry.status === "pending",
      );
      if (stored) {
        return stored;
      }
      const activeCtx = asTestManager().activeGenerations.get(params.generationId);
      const derived = activeCtx ? deriveInterruptFromCtx(activeCtx) : null;
      return derived?.providerToolUseId === params.providerToolUseId ? derived : null;
    });
    findPendingAuthInterruptByIntegrationMock.mockImplementation(async (params: any) => {
      const stored = [...interruptStore.values()].find(
        (entry) =>
          entry.generationId === params.generationId &&
          entry.kind === "auth" &&
          entry.status === "pending" &&
          entry.display.authSpec?.integrations?.includes(params.integration),
      );
      if (stored) {
        return stored;
      }
      const activeCtx = asTestManager().activeGenerations.get(params.generationId);
      const derived = activeCtx ? deriveInterruptFromCtx(activeCtx) : null;
      return derived?.kind === "auth" &&
        derived.display.authSpec?.integrations?.includes(params.integration)
        ? derived
        : null;
    });
    resolveInterruptMock.mockImplementation(async (params: any) => {
      const derivedMatch = [...asTestManager().activeGenerations.values()]
        .map((ctx) => deriveInterruptFromCtx(ctx))
        .find((entry) => entry?.id === params.interruptId);
      const existing =
        interruptStore.get(params.interruptId) ??
        derivedMatch ??
        [...interruptStore.values()].find((entry) => entry.id === params.interruptId) ??
        null;
      if (!existing) {
        return null;
      }
      const resolved = {
        ...existing,
        status: params.status,
        responsePayload: params.responsePayload,
        resolvedAt: new Date("2026-03-11T15:01:00.000Z"),
        resolvedByUserId: params.resolvedByUserId ?? null,
      };
      interruptStore.set(resolved.id, resolved);

      const activeCtx = asTestManager().activeGenerations.get(resolved.generationId);
      const derivedInterrupt = activeCtx ? deriveInterruptFromCtx(activeCtx) : null;
      if (
        activeCtx &&
        (activeCtx.currentInterruptId === resolved.id || derivedInterrupt?.id === resolved.id)
      ) {
        activeCtx.currentInterruptId = undefined;
        activeCtx.pendingApproval = null;
        activeCtx.pendingAuth = null;
      }
      const nextPending =
        [...interruptStore.values()].find(
          (entry) => entry.generationId === resolved.generationId && entry.status === "pending",
        ) ?? null;
      syncInterruptStateMocks(nextPending);

      return resolved;
    });
    expireInterruptMock.mockImplementation(async (interruptId: string) =>
      resolveInterruptMock({ interruptId, status: "expired" }),
    );
    cancelInterruptsForGenerationMock.mockImplementation(async (generationId: string) => {
      for (const interrupt of interruptStore.values()) {
        if (interrupt.generationId === generationId && interrupt.status === "pending") {
          interrupt.status = "cancelled";
          interrupt.resolvedAt = new Date("2026-03-11T15:01:00.000Z");
        }
      }
      const activeCtx = asTestManager().activeGenerations.get(generationId);
      if (activeCtx) {
        activeCtx.currentInterruptId = undefined;
        activeCtx.pendingApproval = null;
        activeCtx.pendingAuth = null;
      }
      syncInterruptStateMocks(null);
    });
    projectInterruptEventMock.mockImplementation((interrupt: any) => ({
      interruptId: interrupt.id,
      generationId: interrupt.generationId,
      conversationId: interrupt.conversationId,
      kind: interrupt.kind,
      status: interrupt.status,
      providerToolUseId: interrupt.providerToolUseId,
      display: interrupt.display,
      responsePayload: interrupt.responsePayload,
    }));
    updateWhereMock.mockResolvedValue(undefined);
    insertValuesMock.mockReset();
    insertReturningMock.mockReset();
    insertValuesMock.mockImplementation(() => ({
      returning: insertReturningMock,
    }));
    insertReturningMock.mockResolvedValue([]);
    generationFindFirstMock.mockResolvedValue(null);
    generationFindManyMock.mockResolvedValue([]);
    messageFindFirstMock.mockResolvedValue(null);
    conversationFindFirstMock.mockResolvedValue(null);
    publishGenerationStreamEventMock.mockReset();
    publishGenerationStreamEventMock.mockResolvedValue("1-1");
    readGenerationStreamAfterMock.mockReset();
    readGenerationStreamAfterMock.mockResolvedValue([]);
    generationStreamExistsMock.mockReset();
    generationStreamExistsMock.mockResolvedValue(false);
    getLatestGenerationStreamCursorMock.mockReset();
    getLatestGenerationStreamCursorMock.mockResolvedValue(null);
    getLatestGenerationStreamEnvelopeMock.mockReset();
    getLatestGenerationStreamEnvelopeMock.mockResolvedValue(null);
    conversationQueuedMessageFindManyMock.mockResolvedValue([]);
    coworkerRunFindFirstMock.mockResolvedValue(null);
    coworkerFindFirstMock.mockResolvedValue(null);
    providerAuthFindFirstMock.mockResolvedValue(null);
    vi.mocked(getPreferredCloudSandboxProvider).mockReturnValue("e2b");
    isStatelessServerlessRuntimeMock.mockReturnValue(false);
    ensureBucketMock.mockReset();
    ensureBucketMock.mockResolvedValue(undefined);
    uploadToS3Mock.mockReset();
    uploadToS3Mock.mockResolvedValue(undefined);
    queueAddMock.mockReset();
    sandboxSlotAcquireMock.mockReset();
    sandboxSlotAcquireMock.mockResolvedValue({
      granted: true,
      token: "slot-token",
      activeCount: 1,
      requestAtMs: Date.now(),
    });
    sandboxSlotRenewMock.mockReset();
    sandboxSlotRenewMock.mockResolvedValue(true);
    sandboxSlotReleaseMock.mockReset();
    sandboxSlotReleaseMock.mockResolvedValue(undefined);
    sandboxSlotClearPendingMock.mockReset();
    sandboxSlotClearPendingMock.mockResolvedValue(undefined);
    refreshInterruptExpiryMock.mockClear();
    delete process.env.KUMA_PUSH_URL;

    const mgr = asTestManager();
    mgr.activeGenerations.clear();
  });

  it("formats cmdclaw question approvals from the questions payload", () => {
    const request = {
      id: "que-1",
      sessionID: "ses-1",
      questions: [
        {
          header: "Goal",
          question: "What do you want me to ask you about?",
          options: [
            { label: "Project task (Recommended)" },
            { label: "Preferences" },
          ],
        },
        {
          header: "Format",
          question: "How should I phrase it?",
          options: [{ label: "Direct" }],
        },
      ],
      tool: {
        messageID: "msg-1",
        callID: "call-1",
      },
    };

    expect(buildQuestionCommand(request)).toBe(
      "Question: What do you want me to ask you about? [Project task (Recommended) | Preferences] (+1 more)",
    );
    expect(buildDefaultQuestionAnswers(request)).toEqual([
      ["Project task (Recommended)"],
      ["Direct"],
    ]);
  });

  it("cancels generation by aborting active context and setting cancel_requested", async () => {
    const ctx = createCtx();
    const mgr = asTestManager();
    mgr.activeGenerations.set(ctx.id, ctx);
    generationFindFirstMock.mockResolvedValueOnce({
      id: ctx.id,
      status: "running",
      conversation: {
        id: ctx.conversationId,
        userId: ctx.userId,
      },
    });

    const finishSpy = vi.spyOn(mgr, "finishGeneration").mockResolvedValue(undefined);

    const result = await generationManager.cancelGeneration(ctx.id, ctx.userId);

    expect(result).toBe(true);
    expect(ctx.abortController.signal.aborted).toBe(true);
    expect(finishSpy).not.toHaveBeenCalled();
  });

  it("submits approval, stores an approval content part, and emits interrupt resolution", async () => {
    const ctx = createCtx({
      status: "awaiting_approval",
      pendingApproval: {
        toolUseId: "tool-1",
        toolName: "Bash",
        toolInput: { command: "slack send" },
        requestedAt: new Date().toISOString(),
        integration: "slack",
        operation: "send",
      },
    });
    generationFindFirstMock.mockResolvedValue({
      id: ctx.id,
      conversationId: ctx.conversationId,
      pendingApproval: ctx.pendingApproval,
      conversation: {
        id: ctx.conversationId,
        userId: ctx.userId,
      },
    });
    const mgr = asTestManager();
    mgr.activeGenerations.set(ctx.id, ctx);

    const result = await generationManager.submitApproval(ctx.id, "tool-1", "approve", ctx.userId);

    expect(result).toBe(true);
    expect(ctx.pendingApproval).toBeNull();

    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contentParts: [
          expect.objectContaining({
            type: "approval",
            tool_use_id: "tool-1",
            tool_name: "Bash",
            tool_input: { command: "slack send" },
            integration: "slack",
            operation: "send",
            status: "approved",
          }),
        ],
      }),
    );
    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "running",
        pendingApproval: null,
        pendingAuth: null,
      }),
    );
    expect(resolveInterruptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "accepted",
        resolvedByUserId: ctx.userId,
      }),
    );

    const publishedPayloads = (publishGenerationStreamEventMock.mock.calls as unknown[][])
      .map((call) => call[1] as { payload?: unknown } | undefined)
      .filter((entry): entry is { payload?: unknown } => !!entry)
      .map((entry) => entry.payload);

    expect(publishedPayloads).toContainEqual(
      expect.objectContaining({
        type: "interrupt_resolved",
        generationId: ctx.id,
        conversationId: ctx.conversationId,
        kind: "plugin_write",
        status: "accepted",
        providerToolUseId: "tool-1",
      }),
    );
  });

  it("submits question approval and persists decision for worker reconciliation", async () => {
    const ctx = createCtx({
      status: "awaiting_approval",
      pendingApproval: {
        toolUseId: "question-1",
        toolName: "Question",
        toolInput: { id: "question-request-1" },
        requestedAt: new Date().toISOString(),
        integration: "cmdclaw",
        operation: "question",
        command: "Choose one",
      },
    });

    const mgr = asTestManager();
    mgr.activeGenerations.set(ctx.id, ctx);
    generationFindFirstMock.mockResolvedValue({
      id: ctx.id,
      conversationId: ctx.conversationId,
      pendingApproval: ctx.pendingApproval,
      conversation: {
        id: ctx.conversationId,
        userId: ctx.userId,
      },
    });

    const result = await generationManager.submitApproval(
      ctx.id,
      "question-1",
      "approve",
      ctx.userId,
    );

    expect(result).toBe(true);
    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contentParts: [
          expect.objectContaining({
            type: "approval",
            tool_use_id: "question-1",
            tool_name: "Question",
            tool_input: { id: "question-request-1" },
            integration: "cmdclaw",
            operation: "question",
            command: "Choose one",
            status: "approved",
          }),
        ],
      }),
    );
  });

  it("submits question answers selected in the frontend", async () => {
    const ctx = createCtx({
      status: "awaiting_approval",
      pendingApproval: {
        toolUseId: "question-3",
        toolName: "Question",
        toolInput: { id: "question-request-3" },
        requestedAt: new Date().toISOString(),
        integration: "cmdclaw",
        operation: "question",
        command: "Choose one",
      },
    });

    const mgr = asTestManager();
    mgr.activeGenerations.set(ctx.id, ctx);
    generationFindFirstMock.mockResolvedValue({
      id: ctx.id,
      conversationId: ctx.conversationId,
      pendingApproval: ctx.pendingApproval,
      conversation: {
        id: ctx.conversationId,
        userId: ctx.userId,
      },
    });

    const result = await generationManager.submitApproval(
      ctx.id,
      "question-3",
      "approve",
      ctx.userId,
      [["  Coding/Development  "]],
    );

    expect(result).toBe(true);
    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contentParts: [
          expect.objectContaining({
            type: "approval",
            tool_use_id: "question-3",
            question_answers: [["Coding/Development"]],
            status: "approved",
          }),
        ],
      }),
    );
  });

  it("submits denied question approval and persists deny decision", async () => {
    const ctx = createCtx({
      status: "awaiting_approval",
      pendingApproval: {
        toolUseId: "question-2",
        toolName: "Question",
        toolInput: { id: "question-request-2" },
        requestedAt: new Date().toISOString(),
        integration: "cmdclaw",
        operation: "question",
        command: "Choose one",
      },
    });

    const mgr = asTestManager();
    mgr.activeGenerations.set(ctx.id, ctx);
    generationFindFirstMock.mockResolvedValue({
      id: ctx.id,
      conversationId: ctx.conversationId,
      pendingApproval: ctx.pendingApproval,
      conversation: {
        id: ctx.conversationId,
        userId: ctx.userId,
      },
    });

    const result = await generationManager.submitApproval(ctx.id, "question-2", "deny", ctx.userId);

    expect(result).toBe(true);
    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contentParts: [
          expect.objectContaining({
            type: "approval",
            tool_use_id: "question-2",
            status: "denied",
          }),
        ],
      }),
    );
  });

  it("submits permission approval and persists decision for worker reconciliation", async () => {
    const ctx = createCtx({
      status: "awaiting_approval",
      pendingApproval: {
        toolUseId: "permission-1",
        toolName: "Bash",
        toolInput: { command: "slack send" },
        requestedAt: new Date().toISOString(),
        integration: "slack",
        operation: "send",
        command: "slack send",
      },
    });

    const mgr = asTestManager();
    mgr.activeGenerations.set(ctx.id, ctx);
    generationFindFirstMock.mockResolvedValue({
      id: ctx.id,
      conversationId: ctx.conversationId,
      pendingApproval: ctx.pendingApproval,
      conversation: {
        id: ctx.conversationId,
        userId: ctx.userId,
      },
    });

    const result = await generationManager.submitApproval(
      ctx.id,
      "permission-1",
      "approve",
      ctx.userId,
    );

    expect(result).toBe(true);
    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contentParts: [
          expect.objectContaining({
            type: "approval",
            tool_use_id: "permission-1",
            tool_name: "Bash",
            status: "approved",
          }),
        ],
      }),
    );
  });

  it("auto-approves OpenCode permission asks when conversation auto-approve is enabled", async () => {
    const permissionReplyMock = vi.fn().mockResolvedValue({ data: true, error: undefined });
    const ctx = createCtx({
      autoApprove: true,
      opencodeClient: {
        permission: {
          reply: permissionReplyMock,
        },
      },
    });
    const mgr = asTestManager();

    await mgr.handleOpenCodePermissionAsked(
      ctx,
      {
        permission: {
          reply: permissionReplyMock,
        },
      },
      {
        id: "permission-request-auto-approve",
        permission: "external_directory",
        patterns: ["/tmp/non-allowlisted-path"],
      },
    );

    expect(permissionReplyMock).toHaveBeenCalledWith({
      requestID: "permission-request-auto-approve",
      reply: "always",
    });
    expect(ctx.pendingApproval).toBeNull();
    expect(ctx.status).toBe("running");
  });

  it("auto-approves allowlisted external directories (/tmp and /app)", async () => {
    const permissionReplyMock = vi.fn().mockResolvedValue({ data: true, error: undefined });
    const ctx = createCtx({
      autoApprove: false,
      opencodeClient: {
        permission: {
          reply: permissionReplyMock,
        },
      },
    });
    const mgr = asTestManager();

    await mgr.handleOpenCodePermissionAsked(
      ctx,
      {
        permission: {
          reply: permissionReplyMock,
        },
      },
      {
        id: "permission-request-allowlisted-paths",
        permission: "external_directory",
        patterns: ["/tmp/hello.txt", "/app/output/report.txt"],
      },
    );

    expect(permissionReplyMock).toHaveBeenCalledWith({
      requestID: "permission-request-allowlisted-paths",
      reply: "always",
    });
    expect(ctx.pendingApproval).toBeNull();
    expect(ctx.status).toBe("running");
  });

  it("does not auto-answer OpenCode questions when autoApprove is enabled", async () => {
    const questionReplyMock = vi.fn().mockResolvedValue({ data: true, error: undefined });
    const ctx = createCtx({
      autoApprove: true,
      opencodeClient: {
        question: {
          reply: questionReplyMock,
          reject: vi.fn(),
        },
      },
    });
    const mgr = asTestManager();
    const queueApprovalSpy = vi
      .spyOn(mgr, "queueOpenCodeApprovalRequest")
      .mockResolvedValue(undefined);
    const request = {
      id: "question-request-manual",
      sessionID: "session-1",
      questions: [
        {
          header: "Destination",
          question: "Where should this run?",
          options: [{ label: "Slack" }],
        },
      ],
      tool: {
        messageID: "msg-1",
        callID: "call-1",
      },
    };

    await mgr.handleOpenCodeQuestionAsked(
      ctx,
      {
        question: {
          reply: questionReplyMock,
          reject: vi.fn(),
        },
      },
      request,
    );

    expect(questionReplyMock).not.toHaveBeenCalled();
    expect(queueApprovalSpy).toHaveBeenCalledWith(
      ctx,
      expect.any(Object),
      {
        kind: "question",
        request,
        defaultAnswers: buildDefaultQuestionAnswers(request),
      },
      expect.objectContaining({
        integration: "cmdclaw",
        operation: "question",
      }),
    );
  });

  it("times out approval into paused status and emits status_change", async () => {
    const ctx = createCtx();
    coworkerRunFindFirstMock.mockResolvedValue({ id: "wf-run-1" });
    const stalePendingApproval = {
      toolUseId: "plugin-stale",
      toolName: "Bash",
      toolInput: { command: "slack send" },
      requestedAt: new Date(0).toISOString(),
      expiresAt: new Date(1).toISOString(),
      integration: "slack",
      operation: "send",
      command: "slack send -t hi",
    };

    const mgr = asTestManager();
    mgr.activeGenerations.set(ctx.id, ctx);
    generationFindFirstMock.mockImplementation(async (input?: unknown) => {
      const request = input as { with?: { conversation?: boolean } } | undefined;
      if (request?.with?.conversation) {
        return {
          id: ctx.id,
          conversationId: ctx.conversationId,
          status: "awaiting_approval",
          pendingApproval: stalePendingApproval,
          conversation: {
            id: ctx.conversationId,
            userId: ctx.userId,
            autoApprove: false,
          },
        };
      }
      return {
        id: ctx.id,
        conversationId: ctx.conversationId,
        status: "awaiting_approval",
        pendingApproval: stalePendingApproval,
        conversation: {
          id: ctx.conversationId,
          userId: ctx.userId,
        },
      };
    });

    const approvalPromise = generationManager.waitForApproval(ctx.id, {
      toolInput: { command: "slack send" },
      integration: "slack",
      operation: "send",
      command: "slack send -t hi",
    });

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1);

    await expect(approvalPromise).resolves.toBe("deny");

    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "paused",
        isPaused: true,
      }),
    );
    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        generationStatus: "paused",
      }),
    );
    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "paused",
      }),
    );
  });

  it("accepts an auth interrupt and resumes persisted generation state", async () => {
    const ctx = createCtx({
      status: "awaiting_auth",
      pendingAuth: {
        integrations: ["slack"],
        connectedIntegrations: [],
        requestedAt: new Date().toISOString(),
      },
    });

    const mgr = asTestManager();
    mgr.activeGenerations.set(ctx.id, ctx);
    generationFindFirstMock
      .mockResolvedValueOnce({
        id: ctx.id,
        conversationId: ctx.conversationId,
        conversation: {
          id: ctx.conversationId,
          userId: ctx.userId,
        },
      });

    const first = await generationManager.submitAuthResult(ctx.id, "slack", true, ctx.userId);
    expect(first).toBe(true);

    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "running",
        pendingAuth: null,
      }),
    );
    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        generationStatus: "generating",
      }),
    );
    expect(resolveInterruptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "accepted",
        responsePayload: {
          connectedIntegrations: ["slack"],
          integration: "slack",
        },
      }),
    );
  });

  it("pauses on auth timeout", async () => {
    const ctx = createCtx();
    const mgr = asTestManager();
    mgr.activeGenerations.set(ctx.id, ctx);
    const stalePendingAuth = {
      integrations: ["slack"],
      connectedIntegrations: [],
      requestedAt: new Date(0).toISOString(),
      expiresAt: new Date(1).toISOString(),
    };
    generationFindFirstMock.mockImplementation(async () => ({
      id: ctx.id,
      conversationId: ctx.conversationId,
      status: "awaiting_auth",
      pendingAuth: stalePendingAuth,
      conversation: {
        id: ctx.conversationId,
        userId: ctx.userId,
      },
      cancelRequestedAt: null,
    }));

    const finishSpy = vi.spyOn(mgr, "finishGeneration").mockResolvedValue(undefined);

    const authPromise = generationManager.waitForAuth(ctx.id, {
      integration: "slack",
      reason: "Slack authentication required",
    });

    await vi.advanceTimersByTimeAsync(10 * 60 * 1000 + 1);

    await expect(authPromise).resolves.toEqual({ success: false });
    expect(finishSpy).not.toHaveBeenCalled();
    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "paused",
        isPaused: true,
      }),
    );
    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        generationStatus: "paused",
      }),
    );
  });

  it("starts a new generation and enqueues background run", async () => {
    const mgr = asTestManager();
    const runSpy = vi.spyOn(mgr, "runGeneration").mockResolvedValue(undefined);

    insertReturningMock
      .mockResolvedValueOnce([
        {
          id: "conv-new",
          userId: "user-1",
          model: "anthropic/claude-sonnet-4-6",
          autoApprove: false,
          type: "chat",
        },
      ])
      .mockResolvedValueOnce([{ id: "msg-user" }])
      .mockResolvedValueOnce([{ id: "gen-new" }]);

    const result = await generationManager.startGeneration({
      content: "Write a status update",
      userId: "user-1",
    });

    expect(result).toEqual({
      generationId: "gen-new",
      conversationId: "conv-new",
    });
    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(mgr.activeGenerations.get("gen-new")).toMatchObject({
      id: "gen-new",
      conversationId: "conv-new",
      backendType: "opencode",
      userId: "user-1",
    });
  });

  it("does not persist per-run autoApprove onto an existing conversation", async () => {
    const mgr = asTestManager();
    const runSpy = vi.spyOn(mgr, "runGeneration").mockResolvedValue(undefined);

    generationFindFirstMock.mockResolvedValueOnce(null);
    conversationFindFirstMock.mockResolvedValueOnce({
      id: "conv-existing",
      userId: "user-1",
      model: "anthropic/claude-sonnet-4-6",
      autoApprove: true,
      type: "chat",
    });
    insertReturningMock
      .mockResolvedValueOnce([{ id: "msg-user" }])
      .mockResolvedValueOnce([{ id: "gen-existing" }]);

    const result = await generationManager.startGeneration({
      conversationId: "conv-existing",
      content: "hello",
      userId: "user-1",
      autoApprove: false,
    });

    expect(result).toEqual({
      generationId: "gen-existing",
      conversationId: "conv-existing",
    });
    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(updateSetMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        autoApprove: false,
      }),
    );
  });

  it("fills coworker metadata from the first builder user message before the prompt patch lands", async () => {
    const mgr = asTestManager();
    const runSpy = vi.spyOn(mgr, "runGeneration").mockResolvedValue(undefined);
    const updatedAt = new Date("2026-03-12T10:00:00.000Z");
    const refreshedUpdatedAt = new Date("2026-03-12T10:00:01.000Z");

    generationFindFirstMock.mockResolvedValueOnce(null);
    conversationFindFirstMock.mockResolvedValueOnce({
      id: "conv-coworker-builder",
      userId: "user-1",
      model: "anthropic/claude-sonnet-4-6",
      autoApprove: false,
      type: "coworker",
    });
    coworkerFindFirstMock
      .mockResolvedValueOnce({
        id: "cw-1",
        prompt: "",
        model: "anthropic/claude-sonnet-4-6",
        toolAccessMode: "all",
        triggerType: "manual",
        schedule: null,
        allowedIntegrations: ["slack"],
        updatedAt,
      })
      .mockResolvedValueOnce({
        id: "cw-1",
        name: "",
        description: null,
        username: null,
        prompt: "",
        triggerType: "manual",
        allowedIntegrations: ["slack"],
        allowedCustomIntegrations: [],
        schedule: null,
        autoApprove: false,
        promptDo: null,
        promptDont: null,
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "cw-1",
        prompt: "",
        model: "anthropic/claude-sonnet-4-6",
        toolAccessMode: "all",
        triggerType: "manual",
        schedule: null,
        allowedIntegrations: ["slack"],
        updatedAt: refreshedUpdatedAt,
      });
    insertReturningMock
      .mockResolvedValueOnce([{ id: "msg-user" }])
      .mockResolvedValueOnce([{ id: "gen-coworker-builder" }]);

    await generationManager.startGeneration({
      conversationId: "conv-coworker-builder",
      content: "Follow up with new inbound leads after every sales call.",
      userId: "user-1",
    });

    expect(runSpy).toHaveBeenCalledTimes(1);
    const metadataUpdateCall = updateSetMock.mock.calls.find(
      ([values]) =>
        typeof values?.name === "string" && typeof values?.description === "string",
    )?.[0] as { name: string; description: string; username?: string } | undefined;

    expect(metadataUpdateCall).toMatchObject({
      name: "Follow up with new inbound leads after every sales call",
      description: "Follow up with new inbound leads after every sales call.",
    });
    expect(metadataUpdateCall?.username).toMatch(
      /^follow-up-with-new-inbound-leads-after-every-sales-call/,
    );
    expect(
      mgr.activeGenerations.get("gen-coworker-builder")?.builderCoworkerContext?.updatedAt,
    ).toBe(refreshedUpdatedAt.toISOString());
  });

  it("returns an empty queued-message list when conversation no longer exists", async () => {
    conversationFindFirstMock.mockResolvedValue(null);

    const result = await generationManager.listConversationQueuedMessages("conv-missing", "user-1");

    expect(result).toEqual([]);
    expect(conversationQueuedMessageFindManyMock).not.toHaveBeenCalled();
  });

  it("forces opencode backend for OpenAI subscription models even when Daytona is preferred", async () => {
    vi.mocked(getPreferredCloudSandboxProvider).mockReturnValue("daytona");
    const mgr = asTestManager();
    const runSpy = vi.spyOn(mgr, "runGeneration").mockResolvedValue(undefined);

    insertReturningMock
      .mockResolvedValueOnce([
        {
          id: "conv-openai",
          userId: "user-1",
          model: "openai/gpt-5.2-codex",
          autoApprove: false,
          type: "chat",
        },
      ])
      .mockResolvedValueOnce([{ id: "msg-user" }])
      .mockResolvedValueOnce([{ id: "gen-openai" }]);

    providerAuthFindFirstMock.mockResolvedValue({ id: "auth-openai" });

    await generationManager.startGeneration({
      content: "hi",
      userId: "user-1",
      model: "openai/gpt-5.2-codex",
    });

    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(mgr.activeGenerations.get("gen-openai")).toMatchObject({
      id: "gen-openai",
      backendType: "opencode",
      model: "openai/gpt-5.2-codex",
    });
  });

  it("enqueues run and preparing-stuck check jobs when deferred to worker", async () => {
    isStatelessServerlessRuntimeMock.mockReturnValue(true);
    const mgr = asTestManager();
    const runSpy = vi.spyOn(mgr, "runGeneration").mockResolvedValue(undefined);
    const pdfAttachment = {
      name: "questionnaire.pdf",
      mimeType: "application/pdf",
      dataUrl: "data:application/pdf;base64,JVBERi0xLjQK",
    };

    insertReturningMock
      .mockResolvedValueOnce([
        {
          id: "conv-new",
          userId: "user-1",
          model: "anthropic/claude-sonnet-4-6",
          autoApprove: false,
          type: "chat",
        },
      ])
      .mockResolvedValueOnce([{ id: "msg-user" }])
      .mockResolvedValueOnce([{ id: "gen-new" }]);

    await generationManager.startGeneration({
      content: "hi",
      userId: "user-1",
      fileAttachments: [pdfAttachment],
    });

    expect(runSpy).not.toHaveBeenCalled();
    expect(queueAddMock).toHaveBeenCalledTimes(2);
    expect(queueAddMock).toHaveBeenNthCalledWith(
      1,
      "generation:preparing-stuck-check",
      { generationId: "gen-new" },
      expect.objectContaining({
        delay: 5 * 60 * 1000,
      }),
    );
    expect(queueAddMock).toHaveBeenNthCalledWith(
      2,
      "generation:chat-run",
      { generationId: "gen-new" },
      expect.any(Object),
    );
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        executionPolicy: expect.objectContaining({
          queuedFileAttachments: [pdfAttachment],
        }),
      }),
    );
  });

  it("rehydrates queued file attachments into generation context", async () => {
    const mgr = asTestManager();
    const runSpy = vi.spyOn(mgr, "runGeneration").mockResolvedValue(undefined);
    const queuedAttachment = {
      name: "questionnaire.pdf",
      mimeType: "application/pdf",
      dataUrl: "data:application/pdf;base64,JVBERi0xLjQK",
    };

    generationFindFirstMock.mockResolvedValueOnce({
      id: "gen-queued",
      status: "running",
      conversationId: "conv-queued",
      conversation: {
        id: "conv-queued",
        userId: "user-1",
        autoApprove: false,
        model: "anthropic/claude-sonnet-4-6",
      },
      contentParts: [],
      pendingApproval: null,
      pendingAuth: null,
      inputTokens: 0,
      outputTokens: 0,
      startedAt: new Date(),
      executionPolicy: {
        autoApprove: false,
        queuedFileAttachments: [queuedAttachment],
      },
    });
    messageFindFirstMock.mockResolvedValueOnce({
      content: "fill this pdf",
    });
    coworkerRunFindFirstMock.mockResolvedValueOnce(null);

    await generationManager.runQueuedGeneration("gen-queued");

    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(runSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [queuedAttachment],
      }),
    );
  });

  it("reports stuck preparing generations and pushes to kuma", async () => {
    process.env.KUMA_PUSH_URL = "https://kuma.example/push/abc";
    generationFindFirstMock.mockResolvedValueOnce({
      id: "gen-stuck",
      status: "running",
      sandboxId: null,
      completedAt: null,
      startedAt: new Date(Date.now() - 6 * 60 * 1000),
      conversation: {
        id: "conv-stuck",
        userId: "user-1",
        type: "chat",
      },
    });

    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await generationManager.processPreparingStuckCheck("gen-stuck");

    expect(logServerEvent).toHaveBeenCalledWith(
      "warn",
      "GENERATION_PREPARING_STUCK_DETECTED",
      expect.objectContaining({
        generationId: "gen-stuck",
        conversationId: "conv-stuck",
        userId: "user-1",
      }),
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl] = fetchMock.mock.calls[0] as [string];
    expect(calledUrl).toContain("status=down");
    expect(calledUrl).toContain("conversation%3Dconv-stuck");
    expect(calledUrl).toContain("user%3Duser-1");
  });

  it("rejects startGeneration when an active generation already exists in DB", async () => {
    generationFindFirstMock.mockResolvedValueOnce({
      id: "gen-existing",
      status: "running",
    });

    await expect(
      generationManager.startGeneration({
        conversationId: "conv-existing",
        content: "hello",
        userId: "user-1",
      }),
    ).rejects.toThrow("Generation already in progress for this conversation");
  });

  it("rejects startGeneration when conversation belongs to another user", async () => {
    conversationFindFirstMock.mockResolvedValueOnce({
      id: "conv-1",
      userId: "other-user",
      model: "anthropic/claude-sonnet-4-6",
      autoApprove: false,
    });

    await expect(
      generationManager.startGeneration({
        conversationId: "conv-1",
        content: "hello",
        userId: "user-1",
      }),
    ).rejects.toThrow("Access denied");
  });

  it("rejects startGeneration when an OpenAI model is selected without ChatGPT connection", async () => {
    insertReturningMock.mockResolvedValueOnce([
      {
        id: "conv-new",
        userId: "user-1",
        model: "openai/gpt-5.2-codex",
        autoApprove: false,
        type: "chat",
      },
    ]);

    await expect(
      generationManager.startGeneration({
        content: "hello",
        userId: "user-1",
        model: "openai/gpt-5.2-codex",
      }),
    ).rejects.toThrow(
      "This ChatGPT model requires a connected ChatGPT account. Connect it in Settings > Connected AI Account, then retry.",
    );
  });

  it("starts coworker generation and keeps coworker context fields", async () => {
    const mgr = asTestManager();
    const runSpy = vi.spyOn(mgr, "runGeneration").mockResolvedValue(undefined);
    providerAuthFindFirstMock.mockResolvedValue({ id: "auth-openai" });

    insertReturningMock
      .mockResolvedValueOnce([
        {
          id: "conv-coworker",
          userId: "user-1",
          model: "anthropic/claude-sonnet-4-6",
          autoApprove: true,
          type: "coworker",
        },
      ])
      .mockResolvedValueOnce([{ id: "msg-coworker-user" }])
      .mockResolvedValueOnce([{ id: "gen-coworker" }]);

    const result = await generationManager.startCoworkerGeneration({
      coworkerRunId: "wf-run-1",
      content: "Create a weekly report",
      userId: "user-1",
      autoApprove: true,
      allowedIntegrations: ["github"],
      allowedCustomIntegrations: ["custom-slug"],
      model: "anthropic/claude-sonnet-4-6",
    });

    expect(result).toEqual({
      generationId: "gen-coworker",
      conversationId: "conv-coworker",
    });
    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(mgr.activeGenerations.get("gen-coworker")).toMatchObject({
      coworkerRunId: "wf-run-1",
      allowedIntegrations: ["github"],
      allowedCustomIntegrations: ["custom-slug"],
      coworkerPrompt: undefined,
      coworkerPromptDo: undefined,
      coworkerPromptDont: undefined,
      triggerPayload: undefined,
    });
  });

  it("rejects inaccessible saved coworker models before generation starts", async () => {
    await expect(
      generationManager.startCoworkerGeneration({
        coworkerRunId: "wf-run-1",
        content: "Create a weekly report",
        userId: "user-1",
        autoApprove: true,
        allowedIntegrations: ["github"],
        model: "openai/gpt-5.2-codex",
      }),
    ).rejects.toThrow(
      "This ChatGPT model requires a connected ChatGPT account. Connect it in Settings > Connected AI Account, then retry.",
    );
  });

  it("returns status from database when context is active", async () => {
    const ctx = createCtx({
      contentParts: [{ type: "text", text: "hello" }],
      usage: { inputTokens: 3, outputTokens: 5, totalCostUsd: 0 },
      pendingApproval: {
        toolUseId: "tool-1",
        toolName: "Bash",
        toolInput: {},
        requestedAt: new Date().toISOString(),
      },
    });
    const mgr = asTestManager();
    mgr.activeGenerations.set(ctx.id, ctx);
    generationFindFirstMock.mockResolvedValueOnce({
      status: "running",
      contentParts: [{ type: "text", text: "persisted" }],
      pendingApproval: { toolUseId: "tool-db" },
      inputTokens: 6,
      outputTokens: 8,
    });

    const status = await generationManager.getGenerationStatus(ctx.id);

    expect(status).toEqual({
      status: "running",
      contentParts: [{ type: "text", text: "persisted" }],
      pendingApproval: null,
      usage: { inputTokens: 6, outputTokens: 8 },
    });
  });

  it("returns status from database when context is not active", async () => {
    generationFindFirstMock.mockResolvedValueOnce({
      status: "paused",
      contentParts: [{ type: "text", text: "persisted" }],
      pendingApproval: { toolUseId: "tool-db" },
      inputTokens: 9,
      outputTokens: 11,
    });

    const status = await generationManager.getGenerationStatus("gen-db");

    expect(status).toEqual({
      status: "paused",
      contentParts: [{ type: "text", text: "persisted" }],
      pendingApproval: null,
      usage: { inputTokens: 9, outputTokens: 11 },
    });
  });

  it("subscribes from DB terminal state and replays terminal events", async () => {
    generationFindFirstMock.mockResolvedValue({
      id: "gen-db",
      conversationId: "conv-db",
      status: "completed",
      messageId: "msg-final",
      inputTokens: 7,
      outputTokens: 13,
      errorMessage: null,
      conversation: {
        userId: "user-1",
      },
      contentParts: [
        { type: "text", text: "hi" },
        {
          type: "tool_use",
          id: "tool-1",
          name: "bash",
          input: { command: "echo hi" },
          integration: "slack",
          operation: "send",
        },
        { type: "tool_result", tool_use_id: "tool-1", content: "ok" },
        { type: "thinking", id: "think-1", content: "..." },
      ],
    });

    const events = await collectEvents(generationManager.subscribeToGeneration("gen-db", "user-1"));

    expect(events).toEqual([
      { type: "text", content: "hi" },
      {
        type: "tool_use",
        toolName: "bash",
        toolInput: { command: "echo hi" },
        toolUseId: "tool-1",
        integration: "slack",
        operation: "send",
      },
      { type: "tool_result", toolName: "bash", result: "ok", toolUseId: "tool-1" },
      { type: "thinking", content: "...", thinkingId: "think-1" },
      { type: "status_change", status: "completed" },
      {
        type: "done",
        generationId: "gen-db",
        conversationId: "conv-db",
        messageId: "msg-final",
        usage: { inputTokens: 7, outputTokens: 13, totalCostUsd: 0 },
      },
    ]);
  });

  it("subscribes from active context and replays pending approval/auth state", async () => {
    const ctx = createCtx({
      status: "awaiting_approval",
      contentParts: [
        { type: "text", text: "hi" },
        {
          type: "tool_use",
          id: "tool-1",
          name: "bash",
          input: { command: "ls" },
        },
        { type: "tool_result", tool_use_id: "tool-1", content: "ok" },
      ],
      pendingApproval: {
        toolUseId: "tool-pending",
        toolName: "Bash",
        toolInput: { command: "rm -rf /tmp/x" },
        requestedAt: new Date().toISOString(),
        integration: "slack",
        operation: "send",
        command: "rm -rf /tmp/x",
      },
      pendingAuth: null,
    });

    const mgr = asTestManager();
    mgr.activeGenerations.set(ctx.id, ctx);
    generationFindFirstMock
      .mockResolvedValueOnce({
        id: ctx.id,
        conversationId: ctx.conversationId,
        status: "awaiting_approval",
        messageId: null,
        inputTokens: 0,
        outputTokens: 0,
        errorMessage: null,
        conversation: {
          userId: ctx.userId,
          type: "chat",
        },
        contentParts: ctx.contentParts,
        pendingApproval: ctx.pendingApproval,
        pendingAuth: null,
      })
      .mockResolvedValueOnce({
        id: ctx.id,
        conversationId: ctx.conversationId,
        status: "awaiting_approval",
        messageId: null,
        inputTokens: 0,
        outputTokens: 0,
        errorMessage: null,
        conversation: {
          userId: ctx.userId,
          type: "chat",
        },
        contentParts: ctx.contentParts,
        pendingApproval: ctx.pendingApproval,
        pendingAuth: null,
      })
      .mockResolvedValueOnce({
        id: ctx.id,
        conversationId: ctx.conversationId,
        status: "cancelled",
        messageId: null,
        inputTokens: 0,
        outputTokens: 0,
        errorMessage: null,
        conversation: {
          userId: ctx.userId,
          type: "chat",
        },
        contentParts: ctx.contentParts,
        pendingApproval: null,
        pendingAuth: null,
      });

    const eventsPromise = collectEvents(
      generationManager.subscribeToGeneration(ctx.id, ctx.userId),
    );
    await vi.advanceTimersByTimeAsync(500);
    const events = await eventsPromise;

    expect(events).toEqual(
      expect.arrayContaining([
        { type: "text", content: "hi" },
        {
          type: "tool_use",
          toolName: "bash",
          toolInput: { command: "ls" },
          toolUseId: "tool-1",
        },
        { type: "tool_result", toolName: "bash", result: "ok", toolUseId: "tool-1" },
        { type: "status_change", status: "awaiting_approval" },
        {
          type: "interrupt_pending",
          interruptId: "interrupt-tool-pending",
          generationId: "gen-1",
          conversationId: "conv-1",
          kind: "plugin_write",
          status: "pending",
          providerToolUseId: "tool-pending",
          display: {
            title: "Bash",
            toolInput: { command: "rm -rf /tmp/x" },
            integration: "slack",
            operation: "send",
            command: "rm -rf /tmp/x",
          },
          responsePayload: undefined,
        },
        {
          type: "status_change",
          status: "cancelled",
        },
        {
          type: "cancelled",
          generationId: "gen-1",
          conversationId: "conv-1",
          messageId: undefined,
        },
      ]),
    );
  });

  it("dispatches runGeneration to session reset and opencode backend", async () => {
    const mgr = asTestManager();
    const resetSpy = vi.spyOn(mgr, "handleSessionReset").mockResolvedValue(undefined);
    const opencodeSpy = vi.spyOn(mgr, "runOpenCodeGeneration").mockResolvedValue(undefined);

    await mgr.runGeneration(createCtx({ userMessageContent: " /new ", backendType: "opencode" }));
    await mgr.runGeneration(createCtx({ userMessageContent: "hello", backendType: "opencode" }));

    expect(resetSpy).toHaveBeenCalledTimes(1);
    expect(opencodeSpy).toHaveBeenCalledTimes(1);
  });

  it("finishes completed generation, emits done, and cleans up in-memory state", async () => {
    insertReturningMock.mockResolvedValueOnce([{ id: "msg-assistant-1" }]);

    const ctx = createCtx({
      assistantContent: "Final answer",
      contentParts: [{ type: "text", text: "Final answer" }],
      sessionId: "session-1",
      uploadedSandboxFileIds: new Set(),
    });

    const mgr = asTestManager();
    mgr.activeGenerations.set(ctx.id, ctx);

    await mgr.finishGeneration(ctx, "completed");

    expect(ctx.status).toBe("completed");
    expect(publishGenerationStreamEventMock).toHaveBeenCalled();
    expect(mgr.activeGenerations.has(ctx.id)).toBe(false);
  });

  it("auto-collects only sandbox files mentioned in final answer text", async () => {
    insertReturningMock.mockResolvedValueOnce([{ id: "msg-assistant-files-1" }]);
    vi.mocked(collectNewSandboxFiles).mockResolvedValue([
      { path: "/app/QUESTIONNAIRE_RCP_rempli.pdf", content: Buffer.from("pdf") },
      { path: "/app/rcp_payload.json", content: Buffer.from("{}") },
    ]);
    vi.mocked(uploadSandboxFile).mockResolvedValue({
      id: "sandbox-file-mentioned",
      filename: "QUESTIONNAIRE_RCP_rempli.pdf",
      mimeType: "application/pdf",
      sizeBytes: 3,
      path: "/app/QUESTIONNAIRE_RCP_rempli.pdf",
      storageKey: "k/QUESTIONNAIRE_RCP_rempli.pdf",
    });

    const ctx = createCtx({
      assistantContent:
        "Questionnaire rempli avec les informations personnelles fournies et télécharge ici : `QUESTIONNAIRE_RCP_rempli.pdf`.",
      contentParts: [
        {
          type: "text",
          text: "Questionnaire rempli avec les informations personnelles fournies et télécharge ici : `QUESTIONNAIRE_RCP_rempli.pdf`.",
        },
      ],
      generationMarkerTime: Date.now() - 1_000,
      sandbox: {} as unknown,
      uploadedSandboxFileIds: new Set(),
    });

    const mgr = asTestManager();
    await mgr.finishGeneration(ctx, "completed");

    expect(vi.mocked(uploadSandboxFile)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(uploadSandboxFile)).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/app/QUESTIONNAIRE_RCP_rempli.pdf",
      }),
    );
    expect(ctx.uploadedSandboxFileIds?.has("sandbox-file-mentioned")).toBe(true);
  });

  it("does not auto-collect sandbox files when none are mentioned in final answer text", async () => {
    insertReturningMock.mockResolvedValueOnce([{ id: "msg-assistant-files-2" }]);
    vi.mocked(collectNewSandboxFiles).mockResolvedValue([
      { path: "/app/questionnaire-rcp-pdf.template.json", content: Buffer.from("{}") },
    ]);

    const ctx = createCtx({
      assistantContent: "Traitement terminé.",
      contentParts: [{ type: "text", text: "Traitement terminé." }],
      generationMarkerTime: Date.now() - 1_000,
      sandbox: {} as unknown,
      uploadedSandboxFileIds: new Set(),
    });

    const mgr = asTestManager();
    await mgr.finishGeneration(ctx, "completed");

    expect(vi.mocked(uploadSandboxFile)).not.toHaveBeenCalled();
    expect(ctx.uploadedSandboxFileIds?.size).toBe(0);
  });

  it("finishes cancelled generation with interruption marker and emits cancelled", async () => {
    insertReturningMock.mockResolvedValueOnce([{ id: "msg-assistant-2" }]);

    const ctx = createCtx({
      assistantContent: "",
      contentParts: [{ type: "text", text: "partial" }],
      uploadedSandboxFileIds: new Set(),
    });

    const mgr = asTestManager();
    mgr.activeGenerations.set(ctx.id, ctx);

    await mgr.finishGeneration(ctx, "cancelled");

    expect(ctx.status).toBe("cancelled");
    expect(
      ctx.contentParts.some(
        (p: unknown) =>
          !!p &&
          typeof p === "object" &&
          (p as { type?: unknown }).type === "system" &&
          (p as { content?: unknown }).content === "Interrupted by user",
      ),
    ).toBe(true);
    expect(publishGenerationStreamEventMock).toHaveBeenCalled();
  });

  it("handles submitApproval guard paths (missing context, access denied, mismatched toolUseId)", async () => {
    const missing = await generationManager.submitApproval(
      "missing",
      "tool-1",
      "approve",
      "user-1",
    );
    expect(missing).toBe(false);

    const deniedCtx = createCtx({
      pendingApproval: {
        toolUseId: "tool-1",
        toolName: "Bash",
        toolInput: {},
        requestedAt: new Date().toISOString(),
      },
    });
    const mgr = asTestManager();
    mgr.activeGenerations.set("gen-denied", deniedCtx);
    generationFindFirstMock.mockResolvedValueOnce({
      id: "gen-denied",
      conversationId: deniedCtx.conversationId,
      pendingApproval: deniedCtx.pendingApproval,
      conversation: {
        id: deniedCtx.conversationId,
        userId: deniedCtx.userId,
      },
    });

    await expect(
      generationManager.submitApproval("gen-denied", "tool-1", "approve", "other-user"),
    ).rejects.toThrow("Access denied");

    generationFindFirstMock.mockResolvedValueOnce({
      id: "gen-denied",
      conversationId: deniedCtx.conversationId,
      pendingApproval: deniedCtx.pendingApproval,
      conversation: {
        id: deniedCtx.conversationId,
        userId: deniedCtx.userId,
      },
    });
    const mismatch = await generationManager.submitApproval(
      "gen-denied",
      "tool-does-not-match",
      "approve",
      deniedCtx.userId,
    );
    expect(mismatch).toBe(false);
  });

  it("handles submitAuthResult guard paths and cancellation path", async () => {
    const missing = await generationManager.submitAuthResult("missing", "slack", true, "user-1");
    expect(missing).toBe(false);

    const mgr = asTestManager();
    const ctx = createCtx({ pendingAuth: null });
    mgr.activeGenerations.set(ctx.id, ctx);
    generationFindFirstMock.mockResolvedValueOnce({
      id: ctx.id,
      conversationId: ctx.conversationId,
      pendingAuth: null,
      conversation: {
        id: ctx.conversationId,
        userId: ctx.userId,
      },
    });

    await expect(
      generationManager.submitAuthResult(ctx.id, "slack", true, "other-user"),
    ).rejects.toThrow("Access denied");

    generationFindFirstMock.mockResolvedValueOnce({
      id: ctx.id,
      conversationId: ctx.conversationId,
      pendingAuth: null,
      conversation: {
        id: ctx.conversationId,
        userId: ctx.userId,
      },
    });
    const noPending = await generationManager.submitAuthResult(ctx.id, "slack", true, ctx.userId);
    expect(noPending).toBe(false);

    const ctxWithPendingAuth = createCtx({
      id: "gen-auth-fail",
      status: "awaiting_auth",
      pendingAuth: {
        integrations: ["slack"],
        connectedIntegrations: [],
        requestedAt: new Date().toISOString(),
      },
    });
    mgr.activeGenerations.set(ctxWithPendingAuth.id, ctxWithPendingAuth);
    const finishSpy = vi.spyOn(mgr, "finishGeneration").mockResolvedValue(undefined);
    generationFindFirstMock.mockResolvedValueOnce({
      id: ctxWithPendingAuth.id,
      conversationId: ctxWithPendingAuth.conversationId,
      conversation: {
        id: ctxWithPendingAuth.conversationId,
        userId: ctxWithPendingAuth.userId,
      },
    });

    const cancelled = await generationManager.submitAuthResult(
      ctxWithPendingAuth.id,
      "slack",
      false,
      ctxWithPendingAuth.userId,
    );
    expect(cancelled).toBe(true);
    expect(finishSpy).not.toHaveBeenCalled();
    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "cancelled",
        completedAt: expect.any(Date),
      }),
    );
    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        generationStatus: "idle",
      }),
    );
  });

  it("returns immediate fallback values for waitForApproval/waitForAuth guard paths", async () => {
    await expect(
      generationManager.waitForApproval("missing", {
        toolInput: {},
        integration: "slack",
        operation: "send",
        command: "slack send",
      }),
    ).resolves.toBe("deny");

    await expect(
      generationManager.waitForAuth("missing", {
        integration: "slack",
      }),
    ).resolves.toEqual({ success: false });

    const ctx = createCtx({ autoApprove: true });
    const mgr = asTestManager();
    mgr.activeGenerations.set(ctx.id, ctx);
    generationFindFirstMock.mockResolvedValueOnce({
      id: ctx.id,
      conversationId: ctx.conversationId,
      conversation: {
        id: ctx.conversationId,
        userId: ctx.userId,
        autoApprove: true,
      },
    });

    await expect(
      generationManager.waitForApproval(ctx.id, {
        toolInput: {},
        integration: "github",
        operation: "create-issue",
        command: "github create-issue --title bug",
      }),
    ).resolves.toBe("allow");
  });

  it("auto-approves write requests when autoApprove is enabled", async () => {
    const ctx = createCtx({ autoApprove: true });
    const mgr = asTestManager();
    mgr.activeGenerations.set(ctx.id, ctx);
    generationFindFirstMock.mockResolvedValue({
      id: ctx.id,
      conversationId: ctx.conversationId,
      conversation: {
        id: ctx.conversationId,
        userId: ctx.userId,
        autoApprove: true,
      },
    });

    await expect(
      generationManager.waitForApproval(ctx.id, {
        toolInput: { command: "slack send -c C123 -t hi" },
        integration: "slack",
        operation: "send",
        command: "slack send -c C123 -t hi",
      }),
    ).resolves.toBe("allow");
    await expect(
      generationManager.waitForApproval(ctx.id, {
        toolInput: {},
        integration: "github",
        operation: "create-issue",
        command: "github create-issue --title bug",
      }),
    ).resolves.toBe("allow");
    expect(updateSetMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        pendingApproval: expect.anything(),
      }),
    );
  });

  it("broadcasts pending approval for plugin write requests to live subscribers", async () => {
    const ctx = createCtx();
    const mgr = asTestManager();
    mgr.activeGenerations.set(ctx.id, ctx);
    generationFindFirstMock.mockResolvedValue({
      id: ctx.id,
      conversationId: ctx.conversationId,
      conversation: {
        id: ctx.conversationId,
        userId: ctx.userId,
        autoApprove: false,
      },
    });

    const result = await generationManager.requestPluginApproval(ctx.id, {
      toolInput: { command: "slack send -c C123 -t hi" },
      integration: "slack",
      operation: "send",
      command: "slack send -c C123 -t hi",
    });

    expect(result.decision).toBe("pending");
    expect(result.toolUseId).toBeTruthy();
    expect(result.expiresAt).toBeTruthy();
    expect(ctx.status).toBe("awaiting_approval");
    expect(ctx.pendingApproval).toEqual(
      expect.objectContaining({
        toolUseId: result.toolUseId,
        integration: "slack",
        operation: "send",
        command: "slack send -c C123 -t hi",
      }),
    );
    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "awaiting_approval",
        pendingApproval: null,
        pendingAuth: null,
      }),
    );

    const publishedPayloads = (publishGenerationStreamEventMock.mock.calls as unknown[][])
      .map((call) => call[1] as { payload?: unknown } | undefined)
      .filter((entry): entry is { payload?: unknown } => !!entry)
      .map((entry) => entry.payload);

    expect(publishedPayloads).toContainEqual({
      type: "interrupt_pending",
      interruptId: `interrupt-${result.toolUseId}`,
      generationId: ctx.id,
      conversationId: ctx.conversationId,
      kind: "plugin_write",
      status: "pending",
      providerToolUseId: result.toolUseId,
      display: {
        title: "Bash",
        toolInput: { command: "slack send -c C123 -t hi" },
        integration: "slack",
        operation: "send",
        command: "slack send -c C123 -t hi",
      },
      responsePayload: undefined,
    });
  });

  it("publishes pending approval to the generation stream without an active in-memory context", async () => {
    generationFindFirstMock.mockResolvedValue({
      id: "gen-detached",
      conversationId: "conv-detached",
      conversation: {
        id: "conv-detached",
        userId: "user-1",
        autoApprove: false,
      },
    });
    getLatestGenerationStreamEnvelopeMock.mockResolvedValue({
      cursor: "1-1",
      envelope: {
        generationId: "gen-detached",
        conversationId: "conv-detached",
        sequence: 7,
        eventType: "tool_use",
        payload: {
          type: "tool_use",
          toolName: "bash",
          toolInput: { command: "slack channels" },
        },
        createdAtMs: Date.now() - 1000,
      },
    });

    const result = await generationManager.requestPluginApproval("gen-detached", {
      toolInput: { command: "slack send -c C123 -t hi" },
      integration: "slack",
      operation: "send",
      command: "slack send -c C123 -t hi",
    });

    expect(result.decision).toBe("pending");
    expect(publishGenerationStreamEventMock).toHaveBeenCalledWith(
      "gen-detached",
      expect.objectContaining({
        generationId: "gen-detached",
        conversationId: "conv-detached",
        sequence: 8,
        eventType: "interrupt_pending",
        payload: {
          type: "interrupt_pending",
          interruptId: `interrupt-${result.toolUseId}`,
          generationId: "gen-detached",
          conversationId: "conv-detached",
          kind: "plugin_write",
          status: "pending",
          providerToolUseId: result.toolUseId,
          display: {
            title: "Bash",
            toolInput: { command: "slack send -c C123 -t hi" },
            integration: "slack",
            operation: "send",
            command: "slack send -c C123 -t hi",
          },
          responsePayload: undefined,
        },
      }),
    );
  });

  it("builds coworker prompt sections only when coworker context is present", () => {
    const mgr = asTestManager();

    expect(
      mgr.buildCoworkerPrompt(createCtx({ coworkerPrompt: undefined, triggerPayload: undefined })),
    ).toBeNull();

    const prompt = mgr.buildCoworkerPrompt(
      createCtx({
        coworkerPrompt: "Primary coworker instructions",
        coworkerPromptDo: "Do this",
        coworkerPromptDont: "Do not do that",
        triggerPayload: { event: "cron" },
      }),
    );

    expect(prompt).toContain("## Coworker Instructions");
    expect(prompt).toContain("Primary coworker instructions");
    expect(prompt).toContain("## Do");
    expect(prompt).toContain("## Don't");
    expect(prompt).toContain("## Trigger Payload");
  });

  it("builds coworker builder context prompt when builder context is present", () => {
    const mgr = asTestManager();
    const prompt = mgr.buildCoworkerBuilderPrompt(
      createCtx({
        builderCoworkerContext: {
          coworkerId: "wf-1",
          updatedAt: "2026-03-03T12:00:00.000Z",
          prompt: "Current coworker prompt",
          model: "anthropic/claude-sonnet-4-6",
          triggerType: "manual",
          schedule: null,
          allowedIntegrations: ["github"],
        },
      }),
    );

    expect(prompt).toContain("Coworker Builder Context");
    expect(prompt).toContain("coworker_builder_patch");
    expect(prompt).toContain('"coworkerId": "wf-1"');
    expect(prompt).toContain('"model": "anthropic/claude-sonnet-4-6"');
  });

  it("runs OpenCode generation happy path and completes", async () => {
    Object.defineProperty(env, "ANTHROPIC_API_KEY", { value: "test-key", configurable: true });

    vi.mocked(getCliEnvForUser).mockResolvedValue({
      GITHUB_ACCESS_TOKEN: "gh-token",
      SLACK_ACCESS_TOKEN: "slack-token",
    });
    vi.mocked(getEnabledIntegrationTypes).mockResolvedValue(["github", "slack"]);
    vi.mocked(getCliInstructionsWithCustom).mockResolvedValue("cli instructions");
    vi.mocked(writeSkillsToSandbox).mockResolvedValue(["base-skill"]);
    vi.mocked(getSkillsSystemPrompt).mockReturnValue("skills prompt");
    vi.mocked(writeResolvedIntegrationSkillsToSandbox).mockResolvedValue(["github"]);
    vi.mocked(getIntegrationSkillsSystemPrompt).mockReturnValue("integration skills prompt");
    vi.mocked(syncMemoryToSandbox).mockResolvedValue([]);
    vi.mocked(buildMemorySystemPrompt).mockReturnValue("memory prompt");
    vi.mocked(collectNewSandboxFiles).mockResolvedValue([
      { path: "/app/out/report.txt", content: Buffer.from("report") },
    ]);
    vi.mocked(uploadSandboxFile).mockResolvedValue({
      id: "sandbox-file-1",
      filename: "report.txt",
      mimeType: "text/plain",
      sizeBytes: 6,
      path: "/app/out/report.txt",
      storageKey: "k/report.txt",
    });

    conversationFindFirstMock.mockResolvedValue({
      id: "conv-opencode",
      title: "Conversation",
      opencodeSessionId: "session-existing",
    });

    const promptMock = vi.fn().mockResolvedValue(undefined);
    const subscribeMock = vi.fn().mockResolvedValue({
      stream: asAsyncIterable([
        { type: "server.connected", properties: {} },
        { type: "session.idle", properties: {} },
      ]),
    });
    vi.mocked(getOrCreateSession).mockResolvedValue({
      client: {
        event: { subscribe: subscribeMock },
        session: { prompt: promptMock },
      },
      sessionId: "session-1",
      sandbox: {
        sandboxId: "sandbox-1",
        files: {
          write: vi.fn().mockResolvedValue(undefined),
        },
        commands: {
          run: vi.fn().mockResolvedValue({}),
        },
      },
    } as unknown as Awaited<ReturnType<typeof getOrCreateSession>>);

    const mgr = asTestManager();
    const finishSpy = vi.spyOn(mgr, "finishGeneration").mockResolvedValue(undefined);
    vi.spyOn(mgr, "importIntegrationSkillDraftsFromSandbox").mockResolvedValue(undefined);
    vi.spyOn(mgr, "processOpencodeEvent").mockResolvedValue(undefined);
    vi.spyOn(mgr, "handleOpenCodeActionableEvent").mockResolvedValue({
      type: "none",
    });

    const ctx = createCtx({
      id: "gen-opencode",
      conversationId: "conv-opencode",
      backendType: "opencode",
      model: "anthropic/claude-sonnet-4-6",
      allowedIntegrations: ["github"],
      userMessageContent: "Process these files",
      assistantContent: "The generated file is report.txt.",
      attachments: [
        {
          name: "image.png",
          mimeType: "image/png",
          dataUrl: "data:image/png;base64,aGVsbG8=",
        },
        {
          name: "notes.txt",
          mimeType: "text/plain",
          dataUrl: "data:text/plain;base64,aGVsbG8=",
        },
      ],
      uploadedSandboxFileIds: new Set(),
    });

    await mgr.runOpenCodeGeneration(ctx);

    expect(promptMock).toHaveBeenCalledTimes(1);
    const promptArg = promptMock.mock.calls[0]?.[0] as { system?: string };
    expect(promptArg.system).not.toContain(getCoworkerSystemBehaviorPrompt());
    expect(promptArg.system).toContain(getChatSystemBehaviorPrompt() || "");
    expect(vi.mocked(collectNewSandboxFiles)).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Number),
      expect.arrayContaining(["/home/user/uploads/notes.txt"]),
    );
    expect(vi.mocked(uploadSandboxFile)).toHaveBeenCalled();
    expect(finishSpy).toHaveBeenCalledWith(ctx, "completed");
    expect(ctx.uploadedSandboxFileIds?.has("sandbox-file-1")).toBe(true);
  });

  it("adds coworker autonomy behavior prompt only for coworker runs", async () => {
    Object.defineProperty(env, "ANTHROPIC_API_KEY", { value: "test-key", configurable: true });

    vi.mocked(getCliEnvForUser).mockResolvedValue({});
    vi.mocked(getEnabledIntegrationTypes).mockResolvedValue([]);
    vi.mocked(getCliInstructionsWithCustom).mockResolvedValue("");
    vi.mocked(writeSkillsToSandbox).mockResolvedValue([]);
    vi.mocked(getSkillsSystemPrompt).mockReturnValue("");
    vi.mocked(writeResolvedIntegrationSkillsToSandbox).mockResolvedValue([]);
    vi.mocked(getIntegrationSkillsSystemPrompt).mockReturnValue("");
    vi.mocked(syncMemoryToSandbox).mockResolvedValue([]);
    vi.mocked(buildMemorySystemPrompt).mockReturnValue("");
    vi.mocked(collectNewSandboxFiles).mockResolvedValue([]);

    conversationFindFirstMock.mockResolvedValue({
      id: "conv-coworker",
      title: "Coworker Conversation",
      opencodeSessionId: "session-existing",
    });

    const promptMock = vi.fn().mockResolvedValue(undefined);
    const subscribeMock = vi.fn().mockResolvedValue({
      stream: asAsyncIterable([
        { type: "server.connected", properties: {} },
        { type: "session.idle", properties: {} },
      ]),
    });
    vi.mocked(getOrCreateSession).mockResolvedValue({
      client: {
        event: { subscribe: subscribeMock },
        session: { prompt: promptMock },
      },
      sessionId: "session-1",
      sandbox: {
        sandboxId: "sandbox-1",
        files: {
          write: vi.fn().mockResolvedValue(undefined),
          read: vi.fn().mockRejectedValue(new Error("no cache")),
        },
        commands: {
          run: vi.fn().mockResolvedValue({}),
        },
      },
    } as unknown as Awaited<ReturnType<typeof getOrCreateSession>>);

    const mgr = asTestManager();
    const finishSpy = vi.spyOn(mgr, "finishGeneration").mockResolvedValue(undefined);
    vi.spyOn(mgr, "importIntegrationSkillDraftsFromSandbox").mockResolvedValue(undefined);
    vi.spyOn(mgr, "processOpencodeEvent").mockResolvedValue(undefined);
    vi.spyOn(mgr, "handleOpenCodeActionableEvent").mockResolvedValue({
      type: "none",
    });

    const ctx = createCtx({
      id: "gen-coworker-opencode",
      conversationId: "conv-coworker",
      backendType: "opencode",
      model: "anthropic/claude-sonnet-4-6",
      coworkerRunId: "wf-run-1",
      userMessageContent: "Execute scheduled coworker task",
    });

    await mgr.runOpenCodeGeneration(ctx);

    expect(promptMock).toHaveBeenCalledTimes(1);
    const promptArg = promptMock.mock.calls[0]?.[0] as { system?: string };
    expect(promptArg.system).toContain(getCoworkerSystemBehaviorPrompt());
    expect(promptArg.system).toContain("Do not ask clarifying questions.");
    expect(finishSpy).toHaveBeenCalledWith(ctx, "completed");
  });

  it("streams OpenCode reasoning parts as thinking events", async () => {
    Object.defineProperty(env, "ANTHROPIC_API_KEY", { value: "test-key", configurable: true });

    vi.mocked(getCliEnvForUser).mockResolvedValue({});
    vi.mocked(getEnabledIntegrationTypes).mockResolvedValue([]);
    vi.mocked(getCliInstructionsWithCustom).mockResolvedValue("");
    vi.mocked(writeSkillsToSandbox).mockResolvedValue([]);
    vi.mocked(getSkillsSystemPrompt).mockReturnValue("");
    vi.mocked(writeResolvedIntegrationSkillsToSandbox).mockResolvedValue([]);
    vi.mocked(getIntegrationSkillsSystemPrompt).mockReturnValue("");
    vi.mocked(syncMemoryToSandbox).mockResolvedValue([]);
    vi.mocked(buildMemorySystemPrompt).mockReturnValue("");
    vi.mocked(collectNewSandboxFiles).mockResolvedValue([]);

    conversationFindFirstMock.mockResolvedValue({
      id: "conv-reasoning",
      title: "Conversation",
      opencodeSessionId: "session-existing",
    });

    const promptMock = vi.fn().mockResolvedValue(undefined);
    const subscribeMock = vi.fn().mockResolvedValue({
      stream: asAsyncIterable([
        { type: "server.connected", properties: {} },
        {
          type: "message.part.updated",
          properties: {
            part: {
              id: "reason-1",
              sessionID: "session-1",
              messageID: "msg-1",
              type: "reasoning",
              text: "plan",
              time: { start: Date.now() },
            },
          },
        },
        {
          type: "message.part.updated",
          properties: {
            part: {
              id: "reason-1",
              sessionID: "session-1",
              messageID: "msg-1",
              type: "reasoning",
              text: "plan more",
              time: { start: Date.now() },
            },
          },
        },
        { type: "session.idle", properties: {} },
      ]),
    });
    vi.mocked(getOrCreateSession).mockResolvedValue({
      client: {
        event: { subscribe: subscribeMock },
        session: { prompt: promptMock },
      },
      sessionId: "session-1",
      sandbox: {
        sandboxId: "sandbox-1",
        files: { write: vi.fn().mockResolvedValue(undefined) },
        commands: { run: vi.fn().mockResolvedValue({}) },
      },
    } as unknown as Awaited<ReturnType<typeof getOrCreateSession>>);

    const mgr = asTestManager();
    vi.spyOn(mgr, "importIntegrationSkillDraftsFromSandbox").mockResolvedValue(undefined);
    vi.spyOn(mgr, "handleOpenCodeActionableEvent").mockResolvedValue({ type: "none" });
    const finishSpy = vi.spyOn(mgr, "finishGeneration").mockResolvedValue(undefined);

    const ctx = createCtx({
      id: "gen-reasoning",
      conversationId: "conv-reasoning",
      backendType: "opencode",
      model: "openai/gpt-5.2-codex",
    });

    await mgr.runOpenCodeGeneration(ctx);

    expect(finishSpy).toHaveBeenCalledWith(ctx, "completed");
    const publishedThinkingEvents = (publishGenerationStreamEventMock.mock.calls as unknown[][])
      .map((call) => call[1] as { payload?: unknown } | undefined)
      .filter((entry): entry is { payload?: unknown } => !!entry)
      .map((entry) => entry.payload)
      .filter(
        (event): event is { type: "thinking"; content: string; thinkingId: string } =>
          !!event && typeof event === "object" && (event as { type?: unknown }).type === "thinking",
      );
    expect(publishedThinkingEvents).toEqual(
      expect.arrayContaining([
        { type: "thinking", content: "plan", thinkingId: "reason-1" },
        { type: "thinking", content: " more", thinkingId: "reason-1" },
      ]),
    );
    expect(ctx.contentParts).toEqual(
      expect.arrayContaining([{ type: "thinking", id: "reason-1", content: "plan more" }]),
    );
  });

  it("reaps stale generations and evicts matching active contexts", async () => {
    const now = Date.now();
    generationFindManyMock.mockResolvedValue([
      {
        id: "gen-stale-running",
        status: "running",
        startedAt: new Date(now - 7 * 60 * 60 * 1000),
      },
      {
        id: "gen-stale-paused",
        status: "paused",
        startedAt: new Date(now - 2 * 60 * 60 * 1000),
      },
      {
        id: "gen-fresh-running",
        status: "running",
        startedAt: new Date(now - 30 * 60 * 1000),
      },
    ]);

    const mgr = asTestManager();
    mgr.activeGenerations.set("gen-stale-running", createCtx({ id: "gen-stale-running" }));
    mgr.activeGenerations.set("gen-stale-paused", createCtx({ id: "gen-stale-paused" }));
    mgr.activeGenerations.set("gen-fresh-running", createCtx({ id: "gen-fresh-running" }));

    const summary = await generationManager.reapStaleGenerations();

    expect(summary).toEqual({
      scanned: 3,
      stale: 1,
      finalizedRunningAsError: 1,
      finalizedOtherAsCancelled: 0,
    });

    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "error",
        completedAt: expect.any(Date),
      }),
    );
    expect(mgr.activeGenerations.has("gen-stale-running")).toBe(false);
    expect(mgr.activeGenerations.has("gen-stale-paused")).toBe(true);
    expect(mgr.activeGenerations.has("gen-fresh-running")).toBe(true);
  });

  it("bounds pending unknown message parts and resets queue after TTL", async () => {
    const mgr = asTestManager();
    const ctx = createCtx({
      userMessageContent: "hello",
    });

    const processEvent = async (id: string, text = "hello") => {
      await mgr.processOpencodeEvent(
        ctx,
        {
          type: "message.part.updated",
          properties: {
            part: {
              id,
              type: "text",
              text,
              messageID: "msg-unknown",
            },
          },
        } as unknown,
        null,
        null,
        () => {},
      );
    };

    for (let i = 0; i < 120; i += 1) {
      // eslint-disable-next-line no-await-in-loop -- sequential enqueueing is intentional in this test
      await processEvent(`part-${i}`);
    }

    const queuedBeforeTtl = ctx.pendingMessageParts.get("msg-unknown") as
      | { firstQueuedAtMs: number; parts: unknown[] }
      | undefined;
    expect(queuedBeforeTtl).toBeDefined();
    expect(queuedBeforeTtl?.parts).toHaveLength(100);

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1);
    await processEvent("part-after-ttl");

    const queuedAfterTtl = ctx.pendingMessageParts.get("msg-unknown") as
      | { firstQueuedAtMs: number; parts: unknown[] }
      | undefined;
    expect(queuedAfterTtl).toBeDefined();
    expect(queuedAfterTtl?.parts).toHaveLength(1);
  });

  it("truncates oversized OpenCode tool results before storing content parts", async () => {
    const mgr = asTestManager();
    const ctx = createCtx({
      contentParts: [
        {
          type: "tool_use",
          id: "tool-1",
          name: "bash",
          input: { command: "echo big" },
        },
      ],
      messageRoles: new Map([["assistant-msg", "assistant"]]),
    });

    const hugeOutput = "x".repeat(120_000);

    await mgr.processOpencodeEvent(
      ctx,
      {
        type: "message.part.updated",
        properties: {
          part: {
            id: "tool-part-1",
            type: "tool",
            tool: "bash",
            callID: "tool-1",
            messageID: "assistant-msg",
            state: {
              status: "completed",
              output: hugeOutput,
            },
          },
        },
      } as unknown,
      null,
      null,
      () => {},
    );

    const toolResult = ctx.contentParts.find(
      (part) =>
        !!part &&
        typeof part === "object" &&
        (part as { type?: unknown }).type === "tool_result" &&
        (part as { tool_use_id?: unknown }).tool_use_id === "tool-1",
    ) as { content?: unknown } | undefined;

    expect(toolResult).toBeDefined();
    expect(typeof toolResult?.content).toBe("string");
    expect(String(toolResult?.content)).toContain("... (output truncated)");
    expect(String(toolResult?.content).length).toBeLessThanOrEqual(100_024);
  });
});
