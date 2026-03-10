import process from "node:process";

const targets = {
  prod: "DATABASE_URL_PROD",
  staging: "DATABASE_URL_STAGING",
} as const;

type TargetName = keyof typeof targets;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function getTargetName(value: string | undefined): TargetName {
  if (value === "prod" || value === "staging") {
    return value;
  }

  fail("Usage: bun scripts/db-push.ts <staging|prod>");
}

async function run(): Promise<void> {
  const targetName = getTargetName(process.argv[2]);
  const envVar = targets[targetName];
  const databaseUrl = process.env[envVar]?.trim();

  if (!databaseUrl) {
    fail(`Missing ${envVar} in the environment.`);
  }

  const proc = Bun.spawn({
    cmd: [process.execPath, "run", "--cwd", "../../packages/db", "db:push"],
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });

  const exitCode = await proc.exited;
  process.exit(exitCode);
}

void run();
