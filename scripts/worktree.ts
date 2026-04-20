import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import net from "node:net";

const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { Client } = require("pg") as typeof import("pg");
const dotenv = require("dotenv") as typeof import("dotenv");

type CommandName = "create" | "start" | "stop" | "destroy" | "dev" | "status" | "env";

type InstanceMetadata = {
  instanceId: string;
  repoRoot: string;
  instanceRoot: string;
  appPort: number;
  wsPort: number;
  appUrl: string;
  databaseName: string;
  databaseUrl: string;
  queueName: string;
  redisNamespace: string;
  createdAt: string;
  updatedAt: string;
};

type InstanceProcesses = Partial<Record<"web" | "worker" | "ws", number>>;

type DerivedEnv = Record<string, string>;

const DEFAULT_BASE_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/postgres";
const PROCESS_NAMES = ["web", "worker", "ws"] as const;
const DEV_START_TIMEOUT_MS = 120_000;

function printHelp(): void {
  console.log("Usage: bun run worktree <command>");
  console.log("");
  console.log("Commands:");
  console.log("  create   Create or update the isolated worktree instance");
  console.log("  start    Start web, worker, and ws in the background");
  console.log("  stop     Stop background processes for this worktree");
  console.log("  destroy  Stop processes, drop the worktree DB, and remove local state");
  console.log("  dev      Start web, worker, and ws in the foreground");
  console.log("  status   Show the current worktree instance state");
  console.log("  env      Print derived environment variables for this worktree");
}

function fail(message: string): never {
  console.error(`[worktree] ${message}`);
  process.exit(1);
}

function runCommand(command: string, args: string[], cwd: string): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    fail(
      `${command} ${args.join(" ")} failed: ${
        result.stderr?.trim() || result.stdout?.trim() || `exit ${result.status ?? 1}`
      }`,
    );
  }

  return result.stdout.trim();
}

function resolveRepoRoot(): string {
  return runCommand("git", ["rev-parse", "--show-toplevel"], process.cwd());
}

function resolveStateRoot(repoRoot: string): string {
  return join(repoRoot, ".worktrees");
}

function resolveSharedEnvFile(repoRoot: string): string {
  const explicit = process.env.CMDCLAW_ENV_FILE?.trim();
  if (explicit && existsSync(explicit)) {
    return explicit;
  }

  const directCandidate = join(repoRoot, ".env");
  if (existsSync(directCandidate)) {
    return directCandidate;
  }

  const worktreeList = runCommand("git", ["worktree", "list", "--porcelain"], repoRoot);
  const worktreePaths = worktreeList
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length));

  for (const worktreePath of worktreePaths) {
    const candidate = join(worktreePath, ".env");
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  fail(
    "Unable to find a shared .env file. Put one in the current worktree or another linked worktree.",
  );
}

function loadSharedEnv(repoRoot: string): string {
  const envFile = resolveSharedEnvFile(repoRoot);
  const parsed = dotenv.parse(readFileSync(envFile, "utf8"));

  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  return envFile;
}

function slugify(value: string, separator: "-" | "_" = "-"): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, separator)
    .replace(new RegExp(`\\${separator}+`, "g"), separator)
    .replace(new RegExp(`^\\${separator}|\\${separator}$`, "g"), "");

  return normalized || "main";
}

function buildInstanceId(repoRoot: string): string {
  const base = slugify(repoRoot.split("/").filter(Boolean).at(-1) ?? "cmdclaw");
  const hash = createHash("sha1").update(repoRoot).digest("hex").slice(0, 8);
  return `${base}-${hash}`;
}

function buildDatabaseName(instanceId: string): string {
  const prefix = "cmdclaw_";
  const suffix = slugify(instanceId, "_");
  const maxLength = 63;
  return `${prefix}${suffix}`.slice(0, maxLength);
}

function buildAppUrl(appPort: number): string {
  return `http://127.0.0.1:${appPort}`;
}

function buildQueueName(instanceId: string): string {
  return `cmdclaw-${slugify(instanceId)}`;
}

function buildRedisNamespace(instanceId: string): string {
  return `instance:${slugify(instanceId)}:`;
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function metadataPath(instanceRoot: string): string {
  return join(instanceRoot, "metadata.json");
}

function processPath(instanceRoot: string): string {
  return join(instanceRoot, "processes.json");
}

function logsDir(instanceRoot: string): string {
  return join(instanceRoot, "logs");
}

function runtimeDir(instanceRoot: string): string {
  return join(instanceRoot, "runtime");
}

function loadMetadata(instanceRoot: string): InstanceMetadata | null {
  const path = metadataPath(instanceRoot);
  if (!existsSync(path)) {
    return null;
  }

  return JSON.parse(readFileSync(path, "utf8")) as InstanceMetadata;
}

function saveMetadata(metadata: InstanceMetadata): void {
  ensureDir(metadata.instanceRoot);
  writeFileSync(metadataPath(metadata.instanceRoot), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
}

function loadProcesses(instanceRoot: string): InstanceProcesses {
  const path = processPath(instanceRoot);
  if (!existsSync(path)) {
    return {};
  }

  return JSON.parse(readFileSync(path, "utf8")) as InstanceProcesses;
}

function saveProcesses(instanceRoot: string, processes: InstanceProcesses): void {
  ensureDir(instanceRoot);
  writeFileSync(processPath(instanceRoot), `${JSON.stringify(processes, null, 2)}\n`, "utf8");
}

function removeProcessesFile(instanceRoot: string): void {
  const path = processPath(instanceRoot);
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port, "127.0.0.1");
  });
}

async function allocatePorts(instanceId: string): Promise<{ appPort: number; wsPort: number }> {
  const hashNumber = Number.parseInt(
    createHash("sha1").update(instanceId).digest("hex").slice(0, 6),
    16,
  );
  const baseOffset = hashNumber % 700;

  for (let offset = 0; offset < 700; offset += 1) {
    const appPort = 3200 + ((baseOffset + offset) % 700);
    const wsPort = 4200 + ((baseOffset + offset) % 700);

    if ((await isPortFree(appPort)) && (await isPortFree(wsPort))) {
      return { appPort, wsPort };
    }
  }

  fail("Unable to allocate free ports for this worktree instance");
}

function deriveDatabaseUrl(baseDatabaseUrl: string, databaseName: string): string {
  const url = new URL(baseDatabaseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function withAdminClient<T>(connectionString: string, fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function ensureDatabase(metadata: InstanceMetadata): Promise<void> {
  const adminUrl = process.env.DATABASE_URL ?? DEFAULT_BASE_DATABASE_URL;
  await withAdminClient(adminUrl, async (client) => {
    const existing = await client.query("select 1 from pg_database where datname = $1", [
      metadata.databaseName,
    ]);

    if (existing.rowCount === 0) {
      await client.query(`create database ${quoteIdentifier(metadata.databaseName)}`);
      console.log(`[worktree] created database ${metadata.databaseName}`);
    }
  });
}

async function dropDatabase(metadata: InstanceMetadata): Promise<void> {
  const adminUrl = process.env.DATABASE_URL ?? DEFAULT_BASE_DATABASE_URL;
  await withAdminClient(adminUrl, async (client) => {
    await client.query(
      `
        select pg_terminate_backend(pid)
        from pg_stat_activity
        where datname = $1
          and pid <> pg_backend_pid()
      `,
      [metadata.databaseName],
    );
    await client.query(`drop database if exists ${quoteIdentifier(metadata.databaseName)}`);
  });
  console.log(`[worktree] dropped database ${metadata.databaseName}`);
}

function buildDerivedEnv(metadata: InstanceMetadata): DerivedEnv {
  const instanceRuntimeDir = runtimeDir(metadata.instanceRoot);
  const instanceAppUrl = metadata.appUrl;

  return {
    PORT: String(metadata.appPort),
    WS_PORT: String(metadata.wsPort),
    APP_URL: instanceAppUrl,
    NEXT_PUBLIC_APP_URL: instanceAppUrl,
    CMDCLAW_SERVER_URL: instanceAppUrl,
    PLAYWRIGHT_PORT: String(metadata.appPort),
    PLAYWRIGHT_BASE_URL: instanceAppUrl,
    E2E_AUTH_STATE_PATH: join(instanceRuntimeDir, "playwright", "user.json"),
    DATABASE_URL: metadata.databaseUrl,
    BULLMQ_QUEUE_NAME: metadata.queueName,
    CMDCLAW_INSTANCE_ID: metadata.instanceId,
    CMDCLAW_INSTANCE_ROOT: metadata.instanceRoot,
    CMDCLAW_REDIS_NAMESPACE: metadata.redisNamespace,
  };
}

function writeDerivedEnvFile(metadata: InstanceMetadata): void {
  const env = buildDerivedEnv(metadata);
  const shellLines = Object.entries(env).map(([key, value]) => `${key}=${JSON.stringify(value)}`);
  writeFileSync(join(metadata.instanceRoot, "instance.env"), `${shellLines.join("\n")}\n`, "utf8");
}

function createMetadata(repoRoot: string, appPort: number, wsPort: number): InstanceMetadata {
  const instanceId = buildInstanceId(repoRoot);
  const instanceRoot = join(resolveStateRoot(repoRoot), instanceId);
  const databaseName = buildDatabaseName(instanceId);
  const databaseUrl = deriveDatabaseUrl(
    process.env.DATABASE_URL ?? DEFAULT_BASE_DATABASE_URL,
    databaseName,
  );
  const now = new Date().toISOString();

  return {
    instanceId,
    repoRoot,
    instanceRoot,
    appPort,
    wsPort,
    appUrl: buildAppUrl(appPort),
    databaseName,
    databaseUrl,
    queueName: buildQueueName(instanceId),
    redisNamespace: buildRedisNamespace(instanceId),
    createdAt: now,
    updatedAt: now,
  };
}

async function resolveMetadata(): Promise<InstanceMetadata> {
  const repoRoot = resolveRepoRoot();
  const stateRoot = resolveStateRoot(repoRoot);
  const instanceId = buildInstanceId(repoRoot);
  const instanceRoot = join(stateRoot, instanceId);
  const existing = loadMetadata(instanceRoot);

  if (existing) {
    const updated: InstanceMetadata = {
      ...existing,
      repoRoot,
      instanceRoot,
      updatedAt: new Date().toISOString(),
    };
    saveMetadata(updated);
    writeDerivedEnvFile(updated);
    return updated;
  }

  ensureDir(instanceRoot);
  ensureDir(logsDir(instanceRoot));
  ensureDir(runtimeDir(instanceRoot));

  const ports = await allocatePorts(instanceId);
  const metadata = createMetadata(repoRoot, ports.appPort, ports.wsPort);
  saveMetadata(metadata);
  writeDerivedEnvFile(metadata);
  return metadata;
}

function spawnWithEnv(command: string, args: string[], cwd: string, env: DerivedEnv, mode: "foreground" | "background", name: string, instanceRoot: string) {
  const processEnv = {
    ...process.env,
    ...env,
  };

  if (mode === "foreground") {
    return spawn(command, args, {
      cwd,
      env: processEnv,
      stdio: "inherit",
    });
  }

  ensureDir(logsDir(instanceRoot));
  const logPath = join(logsDir(instanceRoot), `${name}.log`);
  const fd = openSync(logPath, "a");

  return spawn(command, args, {
    cwd,
    env: processEnv,
    detached: true,
    stdio: ["ignore", fd, fd],
  });
}

async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Poll until ready.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  fail(`Timed out waiting for ${url}`);
}

async function runDbPush(metadata: InstanceMetadata): Promise<void> {
  const env = buildDerivedEnv(metadata);
  const result = spawnSync("bun", ["run", "--cwd", "packages/db", "db:push"], {
    cwd: metadata.repoRoot,
    env: {
      ...process.env,
      ...env,
    },
    stdio: "inherit",
  });

  if (result.status !== 0) {
    fail(`db:push failed for ${metadata.databaseName}`);
  }
}

async function createInstance(): Promise<InstanceMetadata> {
  const metadata = await resolveMetadata();
  ensureDir(logsDir(metadata.instanceRoot));
  ensureDir(runtimeDir(metadata.instanceRoot));
  await ensureDatabase(metadata);
  await runDbPush(metadata);
  saveMetadata({ ...metadata, updatedAt: new Date().toISOString() });
  writeDerivedEnvFile(metadata);
  console.log(`[worktree] instance ${metadata.instanceId}`);
  console.log(`[worktree] app ${metadata.appUrl}`);
  console.log(`[worktree] db ${metadata.databaseName}`);
  return metadata;
}

function isPidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killProcessGroup(pid: number): void {
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Process already gone.
    }
  }
}

function getProcessEntries(metadata: InstanceMetadata): Array<{ name: (typeof PROCESS_NAMES)[number]; pid: number }> {
  const stored = loadProcesses(metadata.instanceRoot);
  return PROCESS_NAMES.flatMap((name) => {
    const pid = stored[name];
    return typeof pid === "number" ? [{ name, pid }] : [];
  });
}

async function stopInstance(metadata: InstanceMetadata): Promise<void> {
  const entries = getProcessEntries(metadata);
  if (entries.length === 0) {
    console.log("[worktree] no running background processes");
    return;
  }

  for (const entry of entries) {
    if (isPidRunning(entry.pid)) {
      killProcessGroup(entry.pid);
    }
  }

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (entries.every((entry) => !isPidRunning(entry.pid))) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  removeProcessesFile(metadata.instanceRoot);
  console.log("[worktree] stopped background processes");
}

async function startInstance(): Promise<void> {
  const metadata = await createInstance();
  await stopInstance(metadata);

  const env = buildDerivedEnv(metadata);

  const web = spawnWithEnv(
    "bun",
    ["x", "next", "dev", "--port", String(metadata.appPort)],
    join(metadata.repoRoot, "apps/web"),
    env,
    "background",
    "web",
    metadata.instanceRoot,
  );
  web.unref();

  const worker = spawnWithEnv(
    "bun",
    ["--watch", "index.ts"],
    join(metadata.repoRoot, "apps/worker"),
    env,
    "background",
    "worker",
    metadata.instanceRoot,
  );
  worker.unref();

  const ws = spawnWithEnv(
    "bun",
    ["--watch", "index.ts"],
    join(metadata.repoRoot, "apps/ws"),
    env,
    "background",
    "ws",
    metadata.instanceRoot,
  );
  ws.unref();

  saveProcesses(metadata.instanceRoot, {
    web: web.pid,
    worker: worker.pid,
    ws: ws.pid,
  });

  await waitForHttp(metadata.appUrl, DEV_START_TIMEOUT_MS);
  console.log(`[worktree] started ${metadata.appUrl}`);
  console.log(`[worktree] logs ${logsDir(metadata.instanceRoot)}`);
}

async function devInstance(): Promise<void> {
  const metadata = await createInstance();
  const env = buildDerivedEnv(metadata);

  const children = [
    spawnWithEnv(
      "bun",
      ["x", "next", "dev", "--port", String(metadata.appPort)],
      join(metadata.repoRoot, "apps/web"),
      env,
      "foreground",
      "web",
      metadata.instanceRoot,
    ),
    spawnWithEnv(
      "bun",
      ["--watch", "index.ts"],
      join(metadata.repoRoot, "apps/worker"),
      env,
      "foreground",
      "worker",
      metadata.instanceRoot,
    ),
    spawnWithEnv(
      "bun",
      ["--watch", "index.ts"],
      join(metadata.repoRoot, "apps/ws"),
      env,
      "foreground",
      "ws",
      metadata.instanceRoot,
    ),
  ];

  const shutdown = () => {
    for (const child of children) {
      if (!child.killed) {
        child.kill("SIGTERM");
      }
    }
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  await waitForHttp(metadata.appUrl, DEV_START_TIMEOUT_MS);
  console.log(`[worktree] dev ready at ${metadata.appUrl}`);

  await Promise.race(
    children.map(
      (child) =>
        new Promise<void>((resolve, reject) => {
          child.once("exit", (code, signal) => {
            if (code === 0 || signal === "SIGTERM") {
              resolve();
              return;
            }
            reject(new Error(`process exited code=${code ?? "null"} signal=${signal ?? "null"}`));
          });
        }),
    ),
  );
}

async function destroyInstance(): Promise<void> {
  const metadata = await resolveMetadata();
  await stopInstance(metadata);
  await dropDatabase(metadata);
  rmSync(metadata.instanceRoot, { recursive: true, force: true });
  console.log("[worktree] removed local state");
}

async function showStatus(): Promise<void> {
  const metadata = await resolveMetadata();
  const entries = getProcessEntries(metadata);
  console.log(`[worktree] instance ${metadata.instanceId}`);
  console.log(`[worktree] app ${metadata.appUrl}`);
  console.log(`[worktree] db ${metadata.databaseName}`);
  console.log(`[worktree] root ${metadata.instanceRoot}`);

  if (entries.length === 0) {
    console.log("[worktree] processes none");
    return;
  }

  for (const entry of entries) {
    console.log(
      `[worktree] ${entry.name} pid=${entry.pid} running=${isPidRunning(entry.pid) ? "yes" : "no"}`,
    );
  }
}

async function showEnv(): Promise<void> {
  const metadata = await resolveMetadata();
  const env = buildDerivedEnv(metadata);
  for (const [key, value] of Object.entries(env)) {
    console.log(`${key}=${value}`);
  }
}

async function main(): Promise<void> {
  const repoRoot = resolveRepoRoot();
  ensureDir(resolveStateRoot(repoRoot));
  loadSharedEnv(repoRoot);

  const command = (process.argv[2] as CommandName | undefined) ?? "dev";

  switch (command) {
    case "create":
      await createInstance();
      return;
    case "start":
      await startInstance();
      return;
    case "stop": {
      const metadata = await resolveMetadata();
      await stopInstance(metadata);
      return;
    }
    case "destroy":
      await destroyInstance();
      return;
    case "dev":
      await devInstance();
      return;
    case "status":
      await showStatus();
      return;
    case "env":
      await showEnv();
      return;
    default:
      printHelp();
      fail(`Unknown command "${command}"`);
  }
}

await main();
