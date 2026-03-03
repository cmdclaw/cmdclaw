import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getCliEnvForUser } from "../src/server/integrations/cli-env";
import { DEFAULT_SERVER_URL, createRpcClient, loadConfig } from "./lib/cli-shared";

type ToolSpec = {
  scriptPath: string;
  requiredEnv: string[];
};

type ParsedArgs = {
  serverUrl: string;
  toolName?: string;
  toolArgs: string[];
};

const TOOL_SPECS: Record<string, ToolSpec> = {
  linkedin: {
    scriptPath: resolve(
      fileURLToPath(new URL(".", import.meta.url)),
      "../src/sandbox-templates/common/skills/linkedin/src/linkedin.ts",
    ),
    requiredEnv: ["UNIPILE_API_KEY", "UNIPILE_DSN", "LINKEDIN_ACCOUNT_ID"],
  },
};

function printHelp(): void {
  console.log("\nUsage: bun run tool <tool-name> [--server <url>] [tool args]\n");
  console.log("Available tools:");
  for (const toolName of Object.keys(TOOL_SPECS)) {
    console.log(`  - ${toolName}`);
  }
  console.log("\nExamples:");
  console.log("  bun run tool linkedin --help");
  console.log("  bun run tool linkedin profile me");
  console.log('  bun run linkedin profile get "acme-user"\n');
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    serverUrl: process.env.CMDCLAW_SERVER_URL || DEFAULT_SERVER_URL,
    toolArgs: [],
  };

  let toolCaptured = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) {
      continue;
    }

    if ((arg === "--help" || arg === "-h") && !toolCaptured) {
      printHelp();
      process.exit(0);
    }

    if ((arg === "--server" || arg === "-s") && !toolCaptured) {
      parsed.serverUrl = argv[i + 1] || parsed.serverUrl;
      i += 1;
      continue;
    }

    if (!toolCaptured && !arg.startsWith("-")) {
      parsed.toolName = arg;
      toolCaptured = true;
      continue;
    }

    if (toolCaptured) {
      parsed.toolArgs.push(arg);
      continue;
    }

    console.error(`Unknown flag: ${arg}`);
    printHelp();
    process.exit(1);
  }

  return parsed;
}

async function resolveCliEnv(serverUrl: string): Promise<Record<string, string>> {
  const config = loadConfig(serverUrl);
  if (!config?.token) {
    throw new Error(
      `Missing CLI auth token for ${serverUrl}. Run: bun run chat -- --server ${serverUrl} --auth`,
    );
  }

  const client = createRpcClient(serverUrl, config.token);
  const me = await client.user.me();
  if (!me?.id) {
    throw new Error("Could not resolve authenticated user from CLI token.");
  }

  return getCliEnvForUser(me.id);
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  const toolName = parsed.toolName?.toLowerCase();

  if (!toolName) {
    printHelp();
    process.exit(1);
  }

  const spec = TOOL_SPECS[toolName];
  if (!spec) {
    console.error(`Unknown tool: ${toolName}`);
    printHelp();
    process.exit(1);
  }

  const cliEnv = await resolveCliEnv(parsed.serverUrl);

  const missingEnv = spec.requiredEnv.filter((key) => !cliEnv[key]);
  if (missingEnv.length > 0) {
    throw new Error(
      `${toolName} is not fully configured for this user. Missing: ${missingEnv.join(", ")}`,
    );
  }

  const child = spawn("bun", [spec.scriptPath, ...parsed.toolArgs], {
    stdio: "inherit",
    env: {
      ...process.env,
      ...cliEnv,
      CMDCLAW_SERVER_URL: parsed.serverUrl,
    },
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });

  child.on("error", (error) => {
    console.error(`Failed to start ${toolName}: ${error.message}`);
    process.exit(1);
  });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[tool] ${message}`);
  process.exit(1);
});
