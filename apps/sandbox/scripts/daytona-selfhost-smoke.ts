#!/usr/bin/env bun

import { Daytona } from "@daytonaio/sdk";
import { config as loadEnv } from "dotenv";
import path from "path";
import { createInterface } from "readline";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV_PATH = path.resolve(__dirname, "../../../docker/compose/daytona/.env");
const DEFAULT_API_URL = "http://localhost:3300/api";
const DEFAULT_TARGET = "us";
const WORKDIR = "/";
const EXEC_TIMEOUT_SECONDS = 60;
const CLEANUP_WAIT_TIMEOUT_MS = 30_000;
const CLEANUP_POLL_INTERVAL_MS = 1_000;

loadEnv({ path: ENV_PATH });

type DaytonaProcessResult = {
  exitCode?: number;
  result?: string;
  stdout?: string;
  stderr?: string;
  artifacts?: {
    stdout?: string;
  };
};

type DaytonaSandboxHandle = {
  id: string;
  name: string;
  delete: () => Promise<void>;
  process: {
    executeCommand: (
      command: string,
      cwd?: string,
      env?: Record<string, string>,
      timeout?: number,
    ) => Promise<DaytonaProcessResult>;
  };
  fs: {
    downloadFile: (remotePath: string, timeout?: number) => Promise<Buffer | string | Uint8Array>;
  };
};

type DaytonaSandboxStateSnapshot = {
  id: string;
  name: string;
  state?: string | null;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function normalizeOutput(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

function getDaytonaConfig(): {
  apiKey?: string;
  jwtToken?: string;
  organizationId?: string;
  apiUrl: string;
  target: string;
} {
  const apiKey = process.env.DAYTONA_API_KEY;
  const jwtToken = process.env.DAYTONA_JWT_TOKEN;
  const organizationId = process.env.DAYTONA_ORGANIZATION_ID;

  if (!apiKey && !(jwtToken && organizationId)) {
    throw new Error(
      `Missing Daytona auth in ${ENV_PATH}. Set DAYTONA_API_KEY, or set both DAYTONA_JWT_TOKEN and DAYTONA_ORGANIZATION_ID.`,
    );
  }

  return {
    ...(apiKey ? { apiKey } : {}),
    ...(jwtToken ? { jwtToken } : {}),
    ...(organizationId ? { organizationId } : {}),
    apiUrl: process.env.DAYTONA_API_URL ?? DEFAULT_API_URL,
    target: process.env.DAYTONA_TARGET ?? DEFAULT_TARGET,
  };
}

async function executeChecked(
  sandbox: DaytonaSandboxHandle,
  command: string,
): Promise<{ stdout: string; stderr: string }> {
  const result = await sandbox.process.executeCommand(command, WORKDIR, undefined, EXEC_TIMEOUT_SECONDS);
  const stdout = result.stdout ?? result.result ?? result.artifacts?.stdout ?? "";
  const stderr = result.stderr ?? "";

  if ((result.exitCode ?? 0) !== 0) {
    throw new Error(
      `Sandbox ${sandbox.name} command failed with exit code ${result.exitCode ?? 0}: ${stderr || stdout || command}`,
    );
  }

  return { stdout, stderr };
}

async function deleteSandbox(sandbox: DaytonaSandboxHandle): Promise<void> {
  await sandbox.delete();
}

async function listByRunLabel(daytona: Daytona, runId: string) {
  const result = await daytona.list({ "cmdclaw-run-id": runId }, 1, 100);
  return result.items ?? [];
}

function formatSandboxStates(sandboxes: DaytonaSandboxStateSnapshot[]): string {
  return sandboxes.map((sandbox) => `${sandbox.name}:${sandbox.state ?? "unknown"}`).join(", ");
}

async function logAndAssertSandboxStates(
  daytona: Daytona,
  runId: string,
  stage: string,
  sandboxIds?: string[],
) {
  const sandboxes = (await listByRunLabel(daytona, runId)) as DaytonaSandboxStateSnapshot[];
  const scopedSandboxes =
    sandboxIds && sandboxIds.length > 0
      ? sandboxes.filter((sandbox) => sandboxIds.includes(sandbox.id))
      : sandboxes;

  if (scopedSandboxes.length === 0) {
    console.log(`[daytona-selfhost] No sandboxes found while checking states after ${stage}.`);
    return;
  }

  console.log(
    `[daytona-selfhost] Sandbox states after ${stage}: ${formatSandboxStates(scopedSandboxes)}`,
  );

  const failedSandboxes = scopedSandboxes.filter(
    (sandbox) => (sandbox.state ?? "").toLowerCase() === "error",
  );
  assert(
    failedSandboxes.length === 0,
    `Sandbox entered error state after ${stage}: ${formatSandboxStates(failedSandboxes)}`,
  );
}

async function waitForUserCleanupConfirmation(
  runId: string,
  sandboxes: DaytonaSandboxStateSnapshot[],
) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.log("[daytona-selfhost] No TTY detected; cleaning up sandboxes automatically.");
    return;
  }

  console.log("[daytona-selfhost] Sandboxes are paused for inspection.");
  console.log(`[daytona-selfhost] Run id: ${runId}`);
  for (const sandbox of sandboxes) {
    console.log(`- ${sandbox.name}: ${sandbox.id} (${sandbox.state ?? "unknown"})`);
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    while (true) {
      const answer = await new Promise<string>((resolve) => {
        rl.question('[daytona-selfhost] Type "y" to delete the sandboxes and exit: ', resolve);
      });
      const normalized = answer.trim().toLowerCase();
      if (normalized === "y" || normalized === "yes") {
        return;
      }
    }
  } finally {
    rl.close();
  }
}

async function cleanupRunSandboxes(
  daytona: Daytona,
  sandboxes: DaytonaSandboxHandle[],
  runId: string,
): Promise<void> {
  if (sandboxes.length > 0) {
    console.log("[daytona-selfhost] Cleaning up created sandboxes...");
    const cleanupResults = await Promise.allSettled(sandboxes.map(deleteSandbox));
    const failed = cleanupResults.filter((result) => result.status === "rejected");
    if (failed.length > 0) {
      console.warn(`[daytona-selfhost] Cleanup failed for ${failed.length} created sandbox(es).`);
    }
  }

  const leftovers = await listByRunLabel(daytona, runId);
  if (leftovers.length === 0) {
    return;
  }

  console.log(
    `[daytona-selfhost] Retrying cleanup for ${leftovers.length} sandbox(es) discovered by run label...`,
  );
  const retryResults = await Promise.allSettled(
    leftovers.map(async (sandbox) => {
      const full = (await daytona.get(sandbox.id)) as DaytonaSandboxHandle;
      await full.delete();
    }),
  );
  const failed = retryResults.filter((result) => result.status === "rejected");
  if (failed.length > 0) {
    console.warn(`[daytona-selfhost] Retry cleanup failed for ${failed.length} sandbox(es).`);
  }
}

async function waitForCleanup(daytona: Daytona, runId: string) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < CLEANUP_WAIT_TIMEOUT_MS) {
    const leftovers = await listByRunLabel(daytona, runId);
    if (leftovers.length === 0) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, CLEANUP_POLL_INTERVAL_MS));
  }

  const leftovers = await listByRunLabel(daytona, runId);
  assert(
    leftovers.length === 0,
    `Found ${leftovers.length} sandbox(es) still present after cleanup for run ${runId}: ${leftovers
      .map((sandbox) => `${sandbox.name}:${sandbox.state ?? "unknown"}`)
      .join(", ")}`,
  );
}

async function main() {
  console.log(`[daytona-selfhost] Loading env from ${ENV_PATH}`);
  const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const labels = {
    "cmdclaw-experiment": "daytona-selfhost-smoke",
    "cmdclaw-run-id": runId,
  };

  const daytona = new Daytona(getDaytonaConfig());
  const sandboxes: DaytonaSandboxHandle[] = [];
  const summary: string[] = [];

  try {
    console.log("[daytona-selfhost] Creating two sandboxes using the deployment default snapshot...");
    const creationResults = await Promise.allSettled([
      daytona.create({
        name: `cmdclaw-daytona-smoke-a-${runId}`,
        labels,
      }),
      daytona.create({
        name: `cmdclaw-daytona-smoke-b-${runId}`,
        labels,
      }),
    ]);

    const creationFailures: string[] = [];
    for (const result of creationResults) {
      if (result.status === "fulfilled") {
        sandboxes.push(result.value as DaytonaSandboxHandle);
        continue;
      }
      creationFailures.push(
        result.reason instanceof Error ? result.reason.message : String(result.reason),
      );
    }

    if (creationFailures.length > 0) {
      throw new Error(`Failed to create all sandboxes: ${creationFailures.join(" | ")}`);
    }

    console.log("[daytona-selfhost] Created sandboxes:");
    for (const sandbox of sandboxes) {
      console.log(`- ${sandbox.name}: ${sandbox.id}`);
    }
    await logAndAssertSandboxStates(
      daytona,
      runId,
      "creation",
      sandboxes.map((sandbox) => sandbox.id),
    );

    const scriptCommand =
      "sh -lc 'echo \"#!/bin/sh\" > /tmp/daytona-selfhost-smoke.sh && " +
      "echo \"echo sandbox-script:\\$HOSTNAME\" >> /tmp/daytona-selfhost-smoke.sh && " +
      "chmod +x /tmp/daytona-selfhost-smoke.sh && " +
      "/tmp/daytona-selfhost-smoke.sh'";
    const networkCommand = "sh -lc 'curl -fsSI https://example.com | head -n 1'";

    const fileContent = `daytona-selfhost-smoke:${runId}`;
    const fileCommand = `sh -lc 'printf "%s" "${fileContent}" > /tmp/daytona-selfhost-smoke.txt && cat /tmp/daytona-selfhost-smoke.txt'`;

    const [scriptResult, networkResult, fileResult] = await Promise.all([
      executeChecked(sandboxes[0], scriptCommand),
      executeChecked(sandboxes[0], networkCommand),
      executeChecked(sandboxes[1], fileCommand),
    ]);

    const normalizedScriptOutput = normalizeOutput(scriptResult.stdout);
    assert(
      normalizedScriptOutput.includes("sandbox-script:"),
      `Unexpected script output from ${sandboxes[0].name}: ${normalizedScriptOutput || "<empty>"}`,
    );
    summary.push(`${sandboxes[0].name}: script execution OK`);

    const normalizedNetworkOutput = normalizeOutput(networkResult.stdout);
    assert(
      normalizedNetworkOutput.includes("HTTP/"),
      `Unexpected network output from ${sandboxes[0].name}: ${normalizedNetworkOutput || "<empty>"}`,
    );
    summary.push(`${sandboxes[0].name}: outbound internet access OK`);

    const normalizedFileOutput = normalizeOutput(fileResult.stdout);
    assert(
      normalizedFileOutput.includes(fileContent),
      `Unexpected file command output from ${sandboxes[1].name}: ${normalizedFileOutput || "<empty>"}`,
    );

    const downloaded = await sandboxes[1].fs.downloadFile("/tmp/daytona-selfhost-smoke.txt");
    const downloadedContent =
      typeof downloaded === "string" ? downloaded : Buffer.from(downloaded).toString("utf8");

    assert(
      downloadedContent === fileContent,
      `Unexpected downloaded file content from ${sandboxes[1].name}: ${downloadedContent || "<empty>"}`,
    );
    summary.push(`${sandboxes[1].name}: file write/read OK`);
    await logAndAssertSandboxStates(
      daytona,
      runId,
      "runtime checks",
      sandboxes.map((sandbox) => sandbox.id),
    );

    console.log("[daytona-selfhost] PASS");
    for (const line of summary) {
      console.log(`- ${line}`);
    }
  } finally {
    const sandboxesForCleanup = await listByRunLabel(daytona, runId);
    if (sandboxesForCleanup.length > 0) {
      await waitForUserCleanupConfirmation(runId, sandboxesForCleanup);
    }

    await cleanupRunSandboxes(daytona, sandboxes, runId);
    await waitForCleanup(daytona, runId);
  }
}

main().catch((error) => {
  console.error("[daytona-selfhost] FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
