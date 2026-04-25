import { db } from "@cmdclaw/db/client";
import { conversationRuntime, generation } from "@cmdclaw/db/schema";
import { Daytona } from "@daytonaio/sdk";
import { inArray, or } from "drizzle-orm";
import type { SandboxProvider } from "../e2e/live-sandbox";

const DAYTONA_DELETE_WAIT_TIMEOUT_MS = Number(
  process.env.E2E_DAYTONA_DELETE_WAIT_TIMEOUT_MS ?? "15000",
);
const DAYTONA_DELETE_POLL_INTERVAL_MS = 500;

export type CliLiveCleanupState = {
  conversationIds: Set<string>;
  generationIds: Set<string>;
};

type CleanupGenerationRow = {
  id: string;
  conversationId: string;
  sandboxId: string | null;
  sandboxProvider: string | null;
  runtimeId: string | null;
};

type CleanupRuntimeRow = {
  id: string;
  conversationId: string;
  sandboxId: string | null;
  sandboxProvider: string | null;
  sessionId: string | null;
  status: string;
  activeGenerationId: string | null;
};

type CleanupRows = {
  generationRows: CleanupGenerationRow[];
  runtimeRows: CleanupRuntimeRow[];
};

type CliLiveCleanupPlan = {
  sandboxIds: string[];
  runtimeIds: string[];
  conversationIds: string[];
  providerMismatches: string[];
};

type DaytonaSandboxStatus = {
  id?: string;
  state?: string;
  delete?: () => Promise<void>;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function uniqueNonEmpty(values: Iterable<string> | undefined): string[] {
  return Array.from(new Set(Array.from(values ?? []).filter((value) => value.trim().length > 0)));
}

export function createCliLiveCleanupState(): CliLiveCleanupState {
  return {
    conversationIds: new Set<string>(),
    generationIds: new Set<string>(),
  };
}

export function trackCliIdentifiersFromText(state: CliLiveCleanupState | null, text: string): void {
  if (!state || text.trim().length === 0) {
    return;
  }

  const generationMatches = text.matchAll(/\[generation\]\s+([^\s]+)/g);
  for (const match of generationMatches) {
    const id = match[1]?.trim();
    if (id) {
      state.generationIds.add(id);
    }
  }

  const conversationMatches = text.matchAll(/\[conversation\]\s+([^\s]+)/g);
  for (const match of conversationMatches) {
    const id = match[1]?.trim();
    if (id) {
      state.conversationIds.add(id);
    }
  }
}

async function loadCleanupRows(state: CliLiveCleanupState): Promise<CleanupRows> {
  const generationIds = uniqueNonEmpty(state.generationIds);
  const conversationIds = uniqueNonEmpty(state.conversationIds);

  if (generationIds.length === 0 && conversationIds.length === 0) {
    return {
      generationRows: [],
      runtimeRows: [],
    };
  }

  const generationWhere =
    generationIds.length > 0 && conversationIds.length > 0
      ? or(
          inArray(generation.id, generationIds),
          inArray(generation.conversationId, conversationIds),
        )
      : generationIds.length > 0
        ? inArray(generation.id, generationIds)
        : inArray(generation.conversationId, conversationIds);

  const [generationRows, runtimeRows] = await Promise.all([
    db.query.generation.findMany({
      where: generationWhere,
      columns: {
        id: true,
        conversationId: true,
        sandboxId: true,
        sandboxProvider: true,
        runtimeId: true,
      },
    }),
    conversationIds.length > 0
      ? db.query.conversationRuntime.findMany({
          where: inArray(conversationRuntime.conversationId, conversationIds),
          columns: {
            id: true,
            conversationId: true,
            sandboxId: true,
            sandboxProvider: true,
            sessionId: true,
            status: true,
            activeGenerationId: true,
          },
        })
      : Promise.resolve([]),
  ]);

  return {
    generationRows,
    runtimeRows,
  };
}

export function buildCliLiveCleanupPlan(args: {
  generationRows: CleanupGenerationRow[];
  runtimeRows: CleanupRuntimeRow[];
  expectedProvider: SandboxProvider;
}): CliLiveCleanupPlan {
  const runtimeSandboxIds = args.runtimeRows
    .filter((row) => row.sandboxId)
    .map((row) => row.sandboxId as string);
  const generationSandboxIds = args.generationRows
    .filter((row) => row.sandboxId)
    .map((row) => row.sandboxId as string);

  const providerMismatches = [
    ...args.runtimeRows
      .filter(
        (row) =>
          row.sandboxId && row.sandboxProvider && row.sandboxProvider !== args.expectedProvider,
      )
      .map(
        (row) =>
          `runtime=${row.id} conversation=${row.conversationId} provider=${row.sandboxProvider} sandboxId=${row.sandboxId}`,
      ),
    ...args.generationRows
      .filter(
        (row) =>
          row.sandboxId && row.sandboxProvider && row.sandboxProvider !== args.expectedProvider,
      )
      .map(
        (row) =>
          `generation=${row.id} conversation=${row.conversationId} provider=${row.sandboxProvider} sandboxId=${row.sandboxId}`,
      ),
  ];

  return {
    sandboxIds: Array.from(new Set([...runtimeSandboxIds, ...generationSandboxIds])),
    runtimeIds: Array.from(new Set(args.runtimeRows.map((row) => row.id))),
    conversationIds: Array.from(
      new Set([
        ...args.runtimeRows.map((row) => row.conversationId),
        ...args.generationRows.map((row) => row.conversationId),
      ]),
    ),
    providerMismatches,
  };
}

function getDaytonaConfig(): {
  apiKey?: string;
  apiUrl?: string;
  target?: string;
} {
  return {
    ...(process.env.DAYTONA_API_KEY ? { apiKey: process.env.DAYTONA_API_KEY } : {}),
    ...((process.env.DAYTONA_API_URL ?? process.env.DAYTONA_SERVER_URL)
      ? { apiUrl: process.env.DAYTONA_API_URL ?? process.env.DAYTONA_SERVER_URL }
      : {}),
    ...(process.env.DAYTONA_TARGET ? { target: process.env.DAYTONA_TARGET } : {}),
  };
}

async function waitForDaytonaSandboxDeletion(
  daytona: Daytona,
  sandboxId: string,
  timeoutMs = DAYTONA_DELETE_WAIT_TIMEOUT_MS,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const poll = async (): Promise<void> => {
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for Daytona sandbox ${sandboxId} to stop.`);
    }

    try {
      const sandbox = (await daytona.get(sandboxId)) as DaytonaSandboxStatus;
      if ((sandbox.state ?? "").toLowerCase() !== "started") {
        return;
      }
    } catch {
      return;
    }

    await sleep(DAYTONA_DELETE_POLL_INTERVAL_MS);
    return poll();
  };

  return poll();
}

function isRetryableDaytonaDeleteError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const statusCode =
    "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : null;
  const message = error instanceof Error ? error.message : String(error);

  return statusCode === 409 || /state change in progress/i.test(message);
}

async function deleteDaytonaSandboxById(daytona: Daytona, sandboxId: string): Promise<void> {
  const deadline = Date.now() + DAYTONA_DELETE_WAIT_TIMEOUT_MS;

  const attemptDelete = async (): Promise<void> => {
    if (Date.now() >= deadline) {
      throw new Error(
        `Timed out deleting Daytona sandbox ${sandboxId} while it was changing state.`,
      );
    }

    try {
      const sandbox = (await daytona.get(sandboxId)) as DaytonaSandboxStatus;
      await sandbox.delete?.();
      await waitForDaytonaSandboxDeletion(
        daytona,
        sandboxId,
        Math.max(1_000, deadline - Date.now()),
      );
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/not found/i.test(message)) {
        return;
      }
      if (!isRetryableDaytonaDeleteError(error)) {
        throw error;
      }
      await sleep(DAYTONA_DELETE_POLL_INTERVAL_MS);
    }
    return attemptDelete();
  };

  return attemptDelete();
}

async function clearConversationRuntimeBindings(runtimeIds: string[]): Promise<void> {
  if (runtimeIds.length === 0) {
    return;
  }

  await db
    .update(conversationRuntime)
    .set({
      status: "dead",
      sandboxId: null,
      sessionId: null,
      activeGenerationId: null,
    })
    .where(inArray(conversationRuntime.id, runtimeIds));
}

async function assertNoRuntimeSandboxBindings(runtimeIds: string[]): Promise<void> {
  if (runtimeIds.length === 0) {
    return;
  }

  const runtimeRows = await db.query.conversationRuntime.findMany({
    where: inArray(conversationRuntime.id, runtimeIds),
    columns: {
      id: true,
      sandboxId: true,
      sessionId: true,
    },
  });

  const boundRuntimes = runtimeRows.filter((row) => row.sandboxId || row.sessionId);
  if (boundRuntimes.length === 0) {
    return;
  }

  const details = boundRuntimes
    .map(
      (row) =>
        `runtime=${row.id} sandboxId=${row.sandboxId ?? "null"} sessionId=${row.sessionId ?? "null"}`,
    )
    .join("\n");
  throw new Error(`CLI live cleanup left runtime bindings behind:\n${details}`);
}

export async function cleanupCliLiveSandboxes(args: {
  state: CliLiveCleanupState;
  expectedProvider: SandboxProvider;
}): Promise<void> {
  if (args.expectedProvider !== "daytona") {
    return;
  }

  const rows = await loadCleanupRows(args.state);
  const plan = buildCliLiveCleanupPlan({
    ...rows,
    expectedProvider: args.expectedProvider,
  });

  if (plan.providerMismatches.length > 0) {
    throw new Error(
      `CLI live cleanup provider mismatch. Expected ${args.expectedProvider}.\n${plan.providerMismatches.join("\n")}`,
    );
  }

  if (plan.sandboxIds.length === 0 && plan.runtimeIds.length === 0) {
    return;
  }

  const daytona = new Daytona(getDaytonaConfig());
  for (const sandboxId of plan.sandboxIds) {
    // eslint-disable-next-line no-await-in-loop -- cleanup must remain bounded and debuggable
    await deleteDaytonaSandboxById(daytona, sandboxId);
  }

  await clearConversationRuntimeBindings(plan.runtimeIds);
  await assertNoRuntimeSandboxBindings(plan.runtimeIds);
}

export async function assertNoStartedDaytonaSandboxesRemain(args: {
  state: CliLiveCleanupState;
  expectedProvider: SandboxProvider;
}): Promise<void> {
  if (args.expectedProvider !== "daytona") {
    return;
  }

  const rows = await loadCleanupRows(args.state);
  const startedRuntimes = rows.runtimeRows.filter(
    (row) =>
      row.sandboxProvider === args.expectedProvider && row.sandboxId && row.status === "active",
  );

  if (startedRuntimes.length === 0) {
    return;
  }

  const details = startedRuntimes
    .map((row) => `runtime=${row.id} conversation=${row.conversationId} sandboxId=${row.sandboxId}`)
    .join("\n");
  throw new Error(`CLI live test leaked active Daytona runtime(s):\n${details}`);
}
