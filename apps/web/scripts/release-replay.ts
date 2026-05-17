import { parse } from "dotenv";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type ReplayCase = {
  name: string;
  command: string[];
  env?: Record<string, string>;
};

type ReplayFile = {
  cases: ReplayCase[];
};

const repoRoot = resolve(import.meta.dir, "../../..");
const appRoot = resolve(import.meta.dir, "..");
const defaultReplayFile = resolve(appRoot, "tests/release-replay/conversations.json");

function fail(message: string): never {
  console.error(`[release-replay] ${message}`);
  process.exit(1);
}

function loadEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) {
    return {};
  }
  return parse(readFileSync(path, "utf8"));
}

function readReplayFile(): ReplayFile | null {
  const file = process.env.RELEASE_REPLAY_FILE?.trim() || defaultReplayFile;
  if (!existsSync(file)) {
    console.log(`[release-replay] no replay file found at ${file}; skipping replay gate`);
    return null;
  }

  const parsed = JSON.parse(readFileSync(file, "utf8")) as ReplayFile;
  if (!Array.isArray(parsed.cases)) {
    fail(`Replay file ${file} must contain a "cases" array`);
  }
  return parsed;
}

function validateCase(testCase: ReplayCase): void {
  if (!testCase.name?.trim()) {
    fail("Every replay case must have a non-empty name");
  }

  if (!Array.isArray(testCase.command) || testCase.command.length === 0) {
    fail(`Replay case "${testCase.name}" must have a non-empty command array`);
  }
}

async function runCase(testCase: ReplayCase, baseEnv: NodeJS.ProcessEnv): Promise<void> {
  validateCase(testCase);
  console.log(`[release-replay] running ${testCase.name}`);

  const [command, ...args] = testCase.command;
  const child = spawn(command, args, {
    cwd: repoRoot,
    env: {
      ...baseEnv,
      ...testCase.env,
    },
    stdio: "inherit",
  });

  const status = await new Promise<number | null>((resolveStatus, reject) => {
    child.once("error", reject);
    child.once("close", resolveStatus);
  }).catch((error) => {
    fail(
      `Replay case "${testCase.name}" failed to start: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  });

  if (status !== 0) {
    fail(`Replay case "${testCase.name}" exited with status ${status ?? 1}`);
  }
}

async function main(): Promise<void> {
  const replayFile = readReplayFile();
  if (!replayFile) {
    return;
  }

  const baseEnv: NodeJS.ProcessEnv = {
    ...loadEnvFile(resolve(repoRoot, ".env")),
    ...process.env,
    E2E_LIVE: "1",
    PLAYWRIGHT_SKIP_WEBSERVER: "1",
    PLAYWRIGHT_REUSE_SERVER: "1",
  };

  await replayFile.cases.reduce(
    (previous, testCase) => previous.then(() => runCase(testCase, baseEnv)),
    Promise.resolve(),
  );

  console.log(`[release-replay] completed ${replayFile.cases.length} replay case(s)`);
}

if (import.meta.main) {
  void main();
}
