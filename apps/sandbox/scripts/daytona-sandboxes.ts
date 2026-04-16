#!/usr/bin/env bun

import { Daytona } from "@daytonaio/sdk";
import * as dotenvConfig from "dotenv/config";

void dotenvConfig;

const PAGE_SIZE = 100;

type DaytonaClientConfig = {
  apiKey?: string;
  jwtToken?: string;
  organizationId?: string;
  apiUrl?: string;
  target?: string;
};

type DaytonaListResult = Awaited<ReturnType<Daytona["list"]>>;
type DaytonaSandboxRecord = NonNullable<DaytonaListResult["items"]>[number];

function getDaytonaConfig(): DaytonaClientConfig {
  const apiKey = process.env.DAYTONA_API_KEY;
  const jwtToken = process.env.DAYTONA_JWT_TOKEN;
  const organizationId = process.env.DAYTONA_ORGANIZATION_ID;
  const apiUrl = process.env.DAYTONA_API_URL ?? process.env.DAYTONA_SERVER_URL;
  const target = process.env.DAYTONA_TARGET;

  if (!apiKey && !(jwtToken && organizationId)) {
    throw new Error(
      "Missing Daytona auth. Set DAYTONA_API_KEY, or set both DAYTONA_JWT_TOKEN and DAYTONA_ORGANIZATION_ID.",
    );
  }

  return {
    ...(apiKey ? { apiKey } : {}),
    ...(jwtToken ? { jwtToken } : {}),
    ...(organizationId ? { organizationId } : {}),
    ...(apiUrl ? { apiUrl } : {}),
    ...(target ? { target } : {}),
  };
}

async function fetchSandboxes(
  daytona: Daytona,
  page = 1,
  acc: DaytonaSandboxRecord[] = [],
): Promise<DaytonaSandboxRecord[]> {
  const result = await daytona.list(undefined, page, PAGE_SIZE);
  const items = result.items ?? [];
  const next = [...acc, ...items];

  if (!result.totalPages || page >= result.totalPages) {
    return next;
  }

  return fetchSandboxes(daytona, page + 1, next);
}

function formatSandbox(sandbox: DaytonaSandboxRecord): string {
  const state = sandbox.state ?? "<unknown-state>";
  const snapshot = sandbox.snapshot ?? "<unknown-snapshot>";
  const target = sandbox.target ?? "<unknown-target>";
  const createdAt = sandbox.createdAt ?? "<unknown-created-at>";
  return `${sandbox.id} (${sandbox.name}) state: ${state}, snapshot: ${snapshot}, target: ${target}, createdAt: ${createdAt}`;
}

async function listCommand(daytona: Daytona): Promise<void> {
  const sandboxes = await fetchSandboxes(daytona);

  console.log(`Found ${sandboxes.length} Daytona sandbox(es).`);
  for (const sandbox of sandboxes) {
    console.log(`- ${formatSandbox(sandbox)}`);
  }
}

async function killSandboxById(daytona: Daytona, sandboxId: string): Promise<void> {
  const sandbox = await daytona.get(sandboxId);
  await sandbox.delete();
}

async function killCommand(daytona: Daytona, sandboxId: string | undefined): Promise<void> {
  if (!sandboxId) {
    throw new Error(
      "Sandbox id is required. Usage: bun scripts/daytona-sandboxes.ts kill <sandbox-id>",
    );
  }

  await killSandboxById(daytona, sandboxId);
  console.log(`Killed ${sandboxId}`);
}

async function killAllCommand(daytona: Daytona): Promise<void> {
  const sandboxes = await fetchSandboxes(daytona);

  if (sandboxes.length === 0) {
    console.log("No Daytona sandboxes to kill.");
    return;
  }

  const results = await Promise.all(
    sandboxes.map(async (sandbox) => {
      try {
        await killSandboxById(daytona, sandbox.id);
        console.log(`Killed ${sandbox.id} (${sandbox.name})`);
        return { killed: 1, failed: 0 };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Failed to kill ${sandbox.id} (${sandbox.name}): ${message}`);
        return { killed: 0, failed: 1 };
      }
    }),
  );

  const killed = results.reduce((acc, result) => acc + result.killed, 0);
  const failed = results.reduce((acc, result) => acc + result.failed, 0);

  console.log(`Done. Killed: ${killed}, Failed: ${failed}`);
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "list";
  const sandboxId = process.argv[3];
  const daytona = new Daytona(getDaytonaConfig());

  switch (command) {
    case "list":
      await listCommand(daytona);
      break;
    case "kill":
      await killCommand(daytona, sandboxId);
      break;
    case "kill-all":
      await killAllCommand(daytona);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error("Usage: bun scripts/daytona-sandboxes.ts [list|kill <sandbox-id>|kill-all]");
      process.exit(1);
  }
}

await main();
