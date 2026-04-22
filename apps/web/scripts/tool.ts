import { getCliEnvForUser } from "@cmdclaw/core/server/integrations/cli-env";
import { SANDBOX_SKILLS_ROOT } from "@cmdclaw/sandbox/paths";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
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

const SKILLS_ROOT = SANDBOX_SKILLS_ROOT;

const TOOL_ENV_REQUIREMENTS: Record<string, string[]> = {
  airtable: ["AIRTABLE_ACCESS_TOKEN"],
  discord: ["DISCORD_BOT_TOKEN"],
  dynamics: ["DYNAMICS_ACCESS_TOKEN", "DYNAMICS_INSTANCE_URL"],
  github: ["GITHUB_ACCESS_TOKEN"],
  "google-calendar": ["GOOGLE_CALENDAR_ACCESS_TOKEN"],
  "google-docs": ["GOOGLE_DOCS_ACCESS_TOKEN"],
  "google-drive": ["GOOGLE_DRIVE_ACCESS_TOKEN"],
  "google-gmail": ["GMAIL_ACCESS_TOKEN"],
  "google-sheets": ["GOOGLE_SHEETS_ACCESS_TOKEN"],
  hubspot: ["HUBSPOT_ACCESS_TOKEN"],
  linkedin: ["UNIPILE_API_KEY", "UNIPILE_DSN", "LINKEDIN_ACCOUNT_ID"],
  notion: ["NOTION_ACCESS_TOKEN"],
  "outlook-calendar": ["OUTLOOK_CALENDAR_ACCESS_TOKEN"],
  "outlook-mail": ["OUTLOOK_ACCESS_TOKEN"],
  reddit: ["REDDIT_ACCESS_TOKEN"],
  salesforce: ["SALESFORCE_ACCESS_TOKEN", "SALESFORCE_INSTANCE_URL"],
  slack: ["SLACK_ACCESS_TOKEN"],
  twitter: ["TWITTER_ACCESS_TOKEN"],
};

const TOOL_SPECS = Object.fromEntries(
  Object.entries(TOOL_ENV_REQUIREMENTS).map(([toolName, requiredEnv]) => [
    toolName,
    {
      scriptPath: resolve(SKILLS_ROOT, toolName, "src", `${toolName}.ts`),
      requiredEnv,
    } satisfies ToolSpec,
  ]),
) satisfies Record<string, ToolSpec>;

function isHelpRequest(args: string[]): boolean {
  return args.includes("--help") || args.includes("-h");
}

function printHelp(): void {
  console.log("\nUsage: bun run tool <tool-name> [--server <url>] [tool args]\n");
  console.log("Available tools:");
  for (const toolName of Object.keys(TOOL_SPECS)) {
    console.log(`  - ${toolName}`);
  }
  console.log("\nExamples:");
  console.log("  bun run tool google-gmail --help");
  console.log('  bun run tool google-gmail search -q "is:unread" -l 5');
  console.log('  bun run tool linkedin profile get "acme-user"\n');
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
      `Missing CLI auth token for ${serverUrl}. Run: bun run cmdclaw -- auth login --server ${serverUrl}`,
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

  const toolHelpRequested = isHelpRequest(parsed.toolArgs);
  let cliEnv: Record<string, string> = {};

  if (!toolHelpRequested) {
    cliEnv = await resolveCliEnv(parsed.serverUrl);

    const missingEnv = spec.requiredEnv.filter((key) => !cliEnv[key]);
    if (missingEnv.length > 0) {
      throw new Error(
        `${toolName} is not fully configured for this user. Missing: ${missingEnv.join(", ")}`,
      );
    }
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
