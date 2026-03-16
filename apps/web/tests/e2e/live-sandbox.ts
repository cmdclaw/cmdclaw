import { db } from "@cmdclaw/db/client";
import { generation } from "@cmdclaw/db/schema";
import { inArray } from "drizzle-orm";

export type SandboxProvider = "e2b" | "daytona" | "docker";

type SandboxGenerationRow = {
  id: string;
  conversationId: string;
  sandboxId: string | null;
  sandboxProvider: string | null;
};

const DEFAULT_SANDBOX_PROVIDER: SandboxProvider = "docker";
const SANDBOX_POLL_INTERVAL_MS = 1_000;
const SANDBOX_WAIT_TIMEOUT_MS = Number(process.env.E2E_SANDBOX_WAIT_TIMEOUT_MS ?? "15000");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function uniqueIds(ids: Iterable<string> | undefined): string[] {
  return Array.from(new Set(Array.from(ids ?? []).filter((value) => value.trim().length > 0)));
}

export function resolveLiveSandboxProvider(): SandboxProvider {
  const configured = (
    process.env.E2E_SANDBOX_PROVIDER ??
    process.env.E2E_LIVE_SANDBOX_PROVIDER ??
    DEFAULT_SANDBOX_PROVIDER
  ).trim();

  if (configured === "e2b" || configured === "daytona" || configured === "docker") {
    return configured;
  }

  throw new Error(
    `Unsupported live sandbox provider "${configured}". Use one of: e2b, daytona, docker.`,
  );
}

export const liveSandboxProvider = resolveLiveSandboxProvider();

async function loadSandboxRows(args: {
  generationIds?: Iterable<string>;
  conversationIds?: Iterable<string>;
}): Promise<SandboxGenerationRow[]> {
  const generationIds = uniqueIds(args.generationIds);
  const conversationIds = uniqueIds(args.conversationIds);

  if (generationIds.length === 0 && conversationIds.length === 0) {
    return [];
  }

  const [rowsByGeneration, rowsByConversation] = await Promise.all([
    generationIds.length > 0
      ? db.query.generation.findMany({
          where: inArray(generation.id, generationIds),
          columns: {
            id: true,
            conversationId: true,
            sandboxId: true,
            sandboxProvider: true,
          },
        })
      : Promise.resolve([]),
    conversationIds.length > 0
      ? db.query.generation.findMany({
          where: inArray(generation.conversationId, conversationIds),
          columns: {
            id: true,
            conversationId: true,
            sandboxId: true,
            sandboxProvider: true,
          },
        })
      : Promise.resolve([]),
  ]);

  return Array.from(
    new Map(
      [...rowsByGeneration, ...rowsByConversation].map((row) => [
        row.id,
        {
          id: row.id,
          conversationId: row.conversationId,
          sandboxId: row.sandboxId ?? null,
          sandboxProvider: row.sandboxProvider ?? null,
        },
      ]),
    ).values(),
  );
}

export async function waitForSandboxRows(args: {
  generationIds?: Iterable<string>;
  conversationIds?: Iterable<string>;
  timeoutMs?: number;
}): Promise<SandboxGenerationRow[]> {
  const deadline = Date.now() + (args.timeoutMs ?? SANDBOX_WAIT_TIMEOUT_MS);
  const poll = async (): Promise<SandboxGenerationRow[]> => {
    const rows = await loadSandboxRows(args);
    if (rows.length > 0 && rows.every((row) => row.sandboxProvider)) {
      return rows;
    }

    if (Date.now() >= deadline) {
      return rows;
    }

    await sleep(SANDBOX_POLL_INTERVAL_MS);
    return poll();
  };

  return poll();
}

export async function assertSandboxRowsUseProvider(args: {
  generationIds?: Iterable<string>;
  conversationIds?: Iterable<string>;
  expectedProvider?: SandboxProvider;
  timeoutMs?: number;
}): Promise<SandboxGenerationRow[]> {
  const expectedProvider = args.expectedProvider ?? liveSandboxProvider;
  const rows = await waitForSandboxRows(args);

  if (rows.length === 0) {
    throw new Error(
      `No generation rows found for sandbox verification (expected provider=${expectedProvider}).`,
    );
  }

  const mismatches = rows.filter((row) => row.sandboxProvider !== expectedProvider);
  if (mismatches.length > 0) {
    const details = mismatches
      .map(
        (row) =>
          `generation=${row.id} conversation=${row.conversationId} provider=${row.sandboxProvider ?? "null"} sandboxId=${row.sandboxId ?? "null"}`,
      )
      .join("\n");
    throw new Error(
      `Sandbox verification failed. Expected provider=${expectedProvider}.\n${details}`,
    );
  }

  return rows;
}
