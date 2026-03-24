import type { RouterClient } from "@orpc/server";
import { buildCoworkerPatchApplyEnvelope } from "@cmdclaw/core/lib/coworker-runtime-cli";
import { coworkerBuilderPatchSchema } from "@cmdclaw/core/server/services/coworker-builder-service";
import type { AppRouter } from "@/server/orpc";
import { formatPersistedChatTranscript } from "../src/components/chat/chat-transcript";
import { DEFAULT_SERVER_URL, createRpcClient, loadConfig } from "./lib/cli-shared";

type ParsedArgs = {
  serverUrl?: string;
  command?: string;
  positionals: string[];
  message?: string;
  list?: boolean;
  json?: boolean;
  format?: "text" | "markdown" | "json";
  // Generic command flags
  payload?: string;
  watch: boolean;
  watchIntervalSeconds: number;
  limit?: number;
  // Create flags
  name?: string;
  triggerType?: string;
  prompt?: string;
  promptDo?: string;
  promptDont?: string;
  integrations?: string[];
  customIntegrations?: string[];
  autoApprove?: boolean;
  scheduleType?: string;
  scheduleInterval?: number;
  scheduleTime?: string;
  scheduleDays?: number[];
  scheduleDayOfMonth?: number;
  model?: string;
  baseUpdatedAt?: string;
  patch?: string;
};

type CoworkerIntegrationType =
  | "google_gmail"
  | "google_calendar"
  | "google_docs"
  | "google_sheets"
  | "google_drive"
  | "notion"
  | "linear"
  | "github"
  | "airtable"
  | "slack"
  | "hubspot"
  | "linkedin"
  | "salesforce"
  | "dynamics"
  | "reddit"
  | "twitter";

const integrationTypes = new Set<CoworkerIntegrationType>([
  "google_gmail",
  "google_calendar",
  "google_docs",
  "google_sheets",
  "google_drive",
  "notion",
  "linear",
  "github",
  "airtable",
  "slack",
  "hubspot",
  "linkedin",
  "salesforce",
  "dynamics",
  "reddit",
  "twitter",
]);

type CoworkerSchedule =
  | { type: "interval"; intervalMinutes: number }
  | { type: "daily"; time: string; timezone?: string }
  | { type: "weekly"; time: string; daysOfWeek: number[]; timezone?: string }
  | { type: "monthly"; time: string; dayOfMonth: number; timezone?: string };

const TERMINAL_STATUSES = new Set(["completed", "cancelled", "error", "success", "failed"]);
const DEFAULT_COWORKER_BUILDER_MODEL = "anthropic/claude-sonnet-4-6";

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    positionals: [],
    watch: false,
    watchIntervalSeconds: 2,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    switch (arg) {
      case "--server":
      case "-s":
        args.serverUrl = argv[i + 1];
        i += 1;
        break;
      case "--payload":
      case "-P":
        args.payload = argv[i + 1];
        i += 1;
        break;
      case "--watch":
        args.watch = true;
        break;
      case "--watch-interval": {
        const parsed = Number(argv[i + 1]);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          throw new Error("--watch-interval must be a positive number of seconds");
        }
        args.watchIntervalSeconds = parsed;
        i += 1;
        break;
      }
      case "--limit": {
        const parsed = Number(argv[i + 1]);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          throw new Error("--limit must be a positive integer");
        }
        args.limit = parsed;
        i += 1;
        break;
      }
      case "--name":
      case "-n":
        args.name = argv[i + 1];
        i += 1;
        break;
      case "--trigger":
      case "-t":
        args.triggerType = argv[i + 1];
        i += 1;
        break;
      case "--prompt":
      case "-p":
        args.prompt = argv[i + 1];
        i += 1;
        break;
      case "--prompt-do":
        args.promptDo = argv[i + 1];
        i += 1;
        break;
      case "--prompt-dont":
        args.promptDont = argv[i + 1];
        i += 1;
        break;
      case "--integrations":
      case "-i":
        args.integrations = splitCsv(argv[i + 1]);
        i += 1;
        break;
      case "--custom-integrations":
        args.customIntegrations = splitCsv(argv[i + 1]);
        i += 1;
        break;
      case "--auto-approve":
        args.autoApprove = true;
        break;
      case "--no-auto-approve":
        args.autoApprove = false;
        break;
      case "--schedule-type":
        args.scheduleType = argv[i + 1];
        i += 1;
        break;
      case "--schedule-interval":
        args.scheduleInterval = Number(argv[i + 1]);
        i += 1;
        break;
      case "--schedule-time":
        args.scheduleTime = argv[i + 1];
        i += 1;
        break;
      case "--schedule-days":
        args.scheduleDays = splitCsv(argv[i + 1]).map(Number);
        i += 1;
        break;
      case "--schedule-day-of-month":
        args.scheduleDayOfMonth = Number(argv[i + 1]);
        i += 1;
        break;
      case "--message":
      case "-m":
      case "--goal":
      case "--instruction":
        args.message = argv[i + 1];
        i += 1;
        break;
      case "--format": {
        const format = argv[i + 1];
        if (format !== "text" && format !== "markdown" && format !== "json") {
          throw new Error("--format must be one of: text, markdown, json");
        }
        args.format = format;
        i += 1;
        break;
      }
      case "--model":
      case "-M":
        args.model = argv[i + 1];
        i += 1;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
      case "--json":
        args.json = true;
        break;
      case "--list":
        args.list = true;
        break;
      case "--base-updated-at":
        args.baseUpdatedAt = argv[i + 1];
        i += 1;
        break;
      case "--patch":
        args.patch = argv[i + 1];
        i += 1;
        break;
      default:
        if (arg?.startsWith("-")) {
          throw new Error(`Unknown flag: ${arg}`);
        }

        if (!args.command) {
          args.command = arg;
        } else {
          args.positionals.push(arg);
        }
    }
  }

  return args;
}

function splitCsv(input: string | undefined): string[] {
  if (!input) {
    return [];
  }
  return input
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) {
    return "-";
  }
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString();
}

function statusBadge(status: string): string {
  const badges: Record<string, string> = {
    on: "[ON]",
    off: "[OFF]",
    running: "[RUNNING]",
    completed: "[DONE]",
    success: "[DONE]",
    failed: "[FAILED]",
    error: "[ERROR]",
    cancelled: "[CANCELLED]",
    awaiting_approval: "[AWAITING APPROVAL]",
    awaiting_auth: "[AWAITING AUTH]",
  };
  return badges[status] ?? `[${status.toUpperCase()}]`;
}

function isCoworkerIntegrationType(value: string): value is CoworkerIntegrationType {
  return integrationTypes.has(value as CoworkerIntegrationType);
}

function parsePayload(payload: string | undefined): unknown {
  if (!payload) {
    return {};
  }

  try {
    return JSON.parse(payload);
  } catch {
    throw new Error("Invalid JSON for --payload");
  }
}

function buildSchedule(args: ParsedArgs): CoworkerSchedule | undefined {
  if (!args.scheduleType) {
    return undefined;
  }

  switch (args.scheduleType) {
    case "interval": {
      const intervalMinutes = args.scheduleInterval ?? 60;
      if (!Number.isInteger(intervalMinutes) || intervalMinutes <= 0) {
        throw new Error("--schedule-interval must be a positive integer (minutes)");
      }
      return { type: "interval", intervalMinutes };
    }
    case "daily":
      return { type: "daily", time: args.scheduleTime ?? "09:00" };
    case "weekly": {
      const days = args.scheduleDays ?? [1];
      if (!days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)) {
        throw new Error("--schedule-days must be comma-separated integers between 0 and 6");
      }
      return { type: "weekly", time: args.scheduleTime ?? "09:00", daysOfWeek: days };
    }
    case "monthly": {
      const dayOfMonth = args.scheduleDayOfMonth ?? 1;
      if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
        throw new Error("--schedule-day-of-month must be an integer between 1 and 31");
      }
      return {
        type: "monthly",
        time: args.scheduleTime ?? "09:00",
        dayOfMonth,
      };
    }
    default:
      throw new Error("--schedule-type must be one of: interval, daily, weekly, monthly");
  }
}

function printHelp(): void {
  console.log("\nUsage: bun run coworker --message <text> [options]");
  console.log("   or: bun run coworker [options] <command>\n");
  console.log("Options:");
  console.log("  -s, --server <url>                Server URL (default http://localhost:3000)");
  console.log(
    "  -m, --message <text>              Build/update a coworker from one message (default mode)",
  );
  console.log("  --list                            List coworkers (shortcut)");
  console.log("  --json                            Emit JSON for supported commands");
  console.log("  -M, --model <provider/model>      Optional model override for builder agent");
  console.log("  -h, --help                        Show help");
  console.log("\nCommands:");
  console.log("  list                              List coworkers");
  console.log("  create                            Create coworker (flags below)");
  console.log("  patch <coworker-id>               Apply a coworker patch");
  console.log("  show <coworker-id>                Show full coworker details");
  console.log("  run <coworker-id>                 Trigger a coworker run");
  console.log("  logs <run-id>                     Show run events and transcript");
  console.log("  approve <run-id> <tool-use-id> <approve|deny>  Submit pending approval");
  console.log(
    "  builder <coworker-id>               Run coworker builder agent on an existing coworker",
  );
  console.log(
    "  close-loop                          Create a draft coworker and let builder agent configure it",
  );
  console.log("  close-loop-example                  Example: hourly post in #bap-experiments");
  console.log("\nAliases:");
  console.log("  trigger <coworker-id>             Alias of run");
  console.log("  show-run <run-id>                 Alias of logs");
  console.log("  runs <coworker-id>                List recent runs for a coworker");
  console.log("\nRun flags:");
  console.log("  -P, --payload <json>              JSON payload for run/trigger");
  console.log("  --watch                           Poll until run reaches terminal status");
  console.log("  --watch-interval <seconds>        Polling interval for --watch (default 2)");
  console.log("\nLogs/Runs flags:");
  console.log(
    "  --limit <n>                       Limit run list size for runs command (default 20)",
  );
  console.log("  --watch                           Poll run logs until terminal status");
  console.log("\nShow flags:");
  console.log("  --format <text|markdown|json>     Output format for show (default text)");
  console.log("\nCreate flags:");
  console.log("  -n, --name <name>                 Coworker name (required)");
  console.log("  -t, --trigger <type>              Trigger type (required)");
  console.log("  -p, --prompt <instructions>       Agent instructions (required)");
  console.log("  --prompt-do <text>                Optional DO guidance");
  console.log("  --prompt-dont <text>              Optional DON'T guidance");
  console.log("  -i, --integrations <csv>          Allowed integrations");
  console.log("  --custom-integrations <csv>       Allowed custom integration names");
  console.log("  --auto-approve                    Enable auto-approval");
  console.log("  --no-auto-approve                 Disable auto-approval");
  console.log("  --schedule-type <type>            interval | daily | weekly | monthly");
  console.log("  --schedule-interval <minutes>     Used by interval schedules");
  console.log("  --schedule-time <HH:MM>           Used by daily/weekly/monthly schedules");
  console.log("  --schedule-days <0,1,..6>         Used by weekly schedules");
  console.log("  --schedule-day-of-month <1-31>    Used by monthly schedules\n");
  console.log("Builder flags:");
  console.log("  --message <text>                  Natural-language coworker objective");
  console.log("  -M, --model <provider/model>      Optional generation model override");
  console.log("\nPatch flags:");
  console.log("  --base-updated-at <iso>           Required optimistic concurrency timestamp");
  console.log("  --patch <json>                    JSON patch payload");
  console.log("\nExample:");
  console.log('  bun run coworker --message "send message in #bap-experiments every hour"\n');
}

type CoworkerDetails = {
  id: string;
  name: string;
  description: string | null;
  username: string | null;
  status: string;
  autoApprove: boolean;
  triggerType: string;
  prompt: string;
  promptDo: string | null;
  promptDont: string | null;
  toolAccessMode: string;
  allowedIntegrations: string[];
  allowedCustomIntegrations: string[];
  allowedSkillSlugs: string[];
  schedule: unknown;
  createdAt: Date | string;
  updatedAt: Date | string;
  runs: Array<{
    id: string;
    status: string;
    startedAt: Date | string;
    finishedAt: Date | string | null;
    errorMessage: string | null;
  }>;
};

function printCoworkerSummary(coworker: {
  id: string;
  name: string;
  description: string | null;
  username: string | null;
  status: string;
  triggerType: string;
  schedule?: unknown;
  lastRunStatus?: string | null;
  lastRunAt?: Date | string | null;
}): void {
  const displayName = coworker.name.trim() || "(unnamed)";
  const lastRun = coworker.lastRunStatus
    ? ` | last run: ${statusBadge(coworker.lastRunStatus)} ${formatDate(coworker.lastRunAt)}`
    : "";

  console.log(`${statusBadge(coworker.status)} ${displayName}`);
  console.log(`  id: ${coworker.id}`);
  console.log(`  username: ${coworker.username ? `@${coworker.username}` : "-"}`);
  console.log(`  description: ${coworker.description ?? "-"}`);
  console.log(`  trigger: ${coworker.triggerType}${lastRun}`);
  if (coworker.schedule) {
    console.log(`  schedule: ${JSON.stringify(coworker.schedule)}`);
  }
  console.log("");
}

function formatCoworkerDetailsMarkdown(details: CoworkerDetails): string {
  const lines = [
    `# ${details.name.trim() || "Unnamed Coworker"}`,
    "",
    `- ID: \`${details.id}\``,
    `- Status: ${details.status}`,
    `- Username: ${details.username ? `@${details.username}` : "-"}`,
    `- Description: ${details.description ?? "-"}`,
    `- Trigger: ${details.triggerType}`,
    `- Tool Access Mode: ${details.toolAccessMode}`,
    `- Auto Approve: ${details.autoApprove ? "yes" : "no"}`,
    `- Created: ${formatDate(details.createdAt)}`,
    `- Updated: ${formatDate(details.updatedAt)}`,
    `- Allowed Integrations: ${details.allowedIntegrations.join(", ") || "-"}`,
    `- Custom Integrations: ${details.allowedCustomIntegrations.join(", ") || "-"}`,
    `- Allowed Skills: ${details.allowedSkillSlugs.join(", ") || "-"}`,
    "",
    "## Prompt",
    "",
    details.prompt || "(empty)",
  ];

  if (details.promptDo) {
    lines.push("", "## Prompt Do", "", details.promptDo);
  }
  if (details.promptDont) {
    lines.push("", "## Prompt Don't", "", details.promptDont);
  }
  if (details.schedule) {
    lines.push("", "## Schedule", "", "```json", JSON.stringify(details.schedule, null, 2), "```");
  }
  if (details.runs.length > 0) {
    lines.push("", "## Recent Runs", "");
    for (const run of details.runs) {
      lines.push(
        `- \`${run.id}\` ${statusBadge(run.status)} started ${formatDate(run.startedAt)}${run.finishedAt ? `, finished ${formatDate(run.finishedAt)}` : ""}${run.errorMessage ? `, error: ${run.errorMessage}` : ""}`,
      );
    }
  }

  return lines.join("\n");
}

function printCoworkerDetails(
  details: CoworkerDetails,
  format: ParsedArgs["format"] = "text",
): void {
  if (format === "json") {
    console.log(JSON.stringify(details, null, 2));
    return;
  }

  if (format === "markdown") {
    console.log(formatCoworkerDetailsMarkdown(details));
    return;
  }

  console.log(`${statusBadge(details.status)} ${details.name.trim() || "(unnamed)"}`);
  console.log(`  id: ${details.id}`);
  console.log(`  username: ${details.username ? `@${details.username}` : "-"}`);
  console.log(`  description: ${details.description ?? "-"}`);
  console.log(`  trigger: ${details.triggerType}`);
  console.log(`  tool access: ${details.toolAccessMode}`);
  console.log(`  auto approve: ${details.autoApprove ? "yes" : "no"}`);
  console.log(`  created: ${formatDate(details.createdAt)}`);
  console.log(`  updated: ${formatDate(details.updatedAt)}`);
  console.log(`  allowed integrations: ${details.allowedIntegrations.join(", ") || "-"}`);
  console.log(`  custom integrations: ${details.allowedCustomIntegrations.join(", ") || "-"}`);
  console.log(`  allowed skills: ${details.allowedSkillSlugs.join(", ") || "-"}`);
  console.log(`  prompt: ${details.prompt || "(empty)"}`);
  if (details.promptDo) {
    console.log(`  prompt do: ${details.promptDo}`);
  }
  if (details.promptDont) {
    console.log(`  prompt don't: ${details.promptDont}`);
  }
  if (details.schedule) {
    console.log(`  schedule: ${JSON.stringify(details.schedule)}`);
  }
  if (details.runs.length > 0) {
    console.log("  recent runs:");
    for (const run of details.runs) {
      const finishedAt = run.finishedAt ? ` | finished ${formatDate(run.finishedAt)}` : "";
      const errorMessage = run.errorMessage ? ` | error: ${run.errorMessage}` : "";
      console.log(
        `    - ${statusBadge(run.status)} ${run.id} | started ${formatDate(run.startedAt)}${finishedAt}${errorMessage}`,
      );
    }
  }
}

async function listCoworkers(client: RouterClient<AppRouter>, args?: ParsedArgs): Promise<void> {
  const coworkers = await client.coworker.list();

  if (args?.json) {
    console.log(JSON.stringify(coworkers, null, 2));
    return;
  }

  if (coworkers.length === 0) {
    console.log("No coworkers found.");
    return;
  }

  console.log(`Coworkers (${coworkers.length}):\n`);
  for (const wf of coworkers) {
    printCoworkerSummary(wf);
  }
}

async function showCoworker(client: RouterClient<AppRouter>, args: ParsedArgs): Promise<void> {
  const coworkerId = args.positionals[0];
  if (!coworkerId) {
    throw new Error("Usage: bun run coworker show <coworker-id> [--format text|markdown|json]");
  }

  const coworker = await client.coworker.get({ id: coworkerId });
  printCoworkerDetails(coworker, args.format);
}

function parsePatchInput(rawPatch: string | undefined) {
  if (!rawPatch?.trim()) {
    throw new Error("patch requires --patch");
  }

  let parsedUnknown: unknown;
  try {
    parsedUnknown = JSON.parse(rawPatch);
  } catch {
    throw new Error("Invalid JSON for --patch");
  }

  return coworkerBuilderPatchSchema.parse(parsedUnknown);
}

async function patchCoworker(client: RouterClient<AppRouter>, args: ParsedArgs): Promise<void> {
  const coworkerId = args.positionals[0];
  if (!coworkerId) {
    throw new Error(
      "Usage: bun run coworker patch <coworker-id> --base-updated-at <iso> --patch <json> [--json]",
    );
  }
  if (!args.baseUpdatedAt?.trim()) {
    throw new Error("patch requires --base-updated-at");
  }

  const result = await client.coworker.patch({
    coworkerId,
    baseUpdatedAt: args.baseUpdatedAt.trim(),
    patch: parsePatchInput(args.patch),
  });

  const envelope = buildCoworkerPatchApplyEnvelope({
    coworkerId,
    result,
  });

  if (args.json) {
    console.log(JSON.stringify(envelope, null, 2));
    return;
  }

  console.log(envelope.message);
  if (envelope.status === "applied" || envelope.status === "conflict") {
    console.log("");
    printCoworkerDetails({
      ...(await client.coworker.get({ id: coworkerId })),
    });
    return;
  }

  if (envelope.details.length > 0) {
    console.log(envelope.details.join("\n"));
  }
}

async function createCoworker(client: RouterClient<AppRouter>, args: ParsedArgs): Promise<void> {
  if (!args.name || !args.triggerType || !args.prompt) {
    throw new Error("create requires --name, --trigger, and --prompt");
  }

  const rawIntegrations = args.integrations ?? [];
  const allowedIntegrations = rawIntegrations.filter(isCoworkerIntegrationType);
  const invalidIntegrations = rawIntegrations.filter((item) => !isCoworkerIntegrationType(item));

  if (invalidIntegrations.length > 0) {
    console.log(`Ignoring unknown integrations: ${invalidIntegrations.join(", ")}`);
  }

  const created = await client.coworker.create({
    name: args.name,
    triggerType: args.triggerType,
    prompt: args.prompt,
    promptDo: args.promptDo,
    promptDont: args.promptDont,
    autoApprove: args.autoApprove,
    allowedIntegrations,
    allowedCustomIntegrations: args.customIntegrations ?? [],
    schedule: buildSchedule(args),
  });

  console.log("Created coworker:");
  printCoworkerSummary({
    id: created.id,
    name: created.name,
    description: created.description,
    username: created.username,
    status: created.status,
    triggerType: args.triggerType,
    schedule: buildSchedule(args),
    lastRunStatus: null,
    lastRunAt: null,
  });
}

async function runCoworker(client: RouterClient<AppRouter>, args: ParsedArgs): Promise<void> {
  const coworkerId = args.positionals[0];
  if (!coworkerId) {
    throw new Error("Usage: bun run coworker run <coworker-id> [--payload <json>] [--watch]");
  }

  const payload = parsePayload(args.payload);
  const result = await client.coworker.trigger({ id: coworkerId, payload });

  console.log(`Triggered coworker ${result.coworkerId}`);
  console.log(`  run id: ${result.runId}`);
  console.log(`  generation id: ${result.generationId}`);
  console.log(`  conversation id: ${result.conversationId}`);

  if (args.watch) {
    console.log("\nWatching logs... (Ctrl+C to stop)\n");
    await printRunLogs(client, result.runId, true, args.watchIntervalSeconds);
  }
}

async function listRuns(client: RouterClient<AppRouter>, args: ParsedArgs): Promise<void> {
  const coworkerId = args.positionals[0];
  if (!coworkerId) {
    throw new Error("Usage: bun run coworker runs <coworker-id> [--limit <n>]");
  }

  const runs = await client.coworker.listRuns({
    coworkerId,
    limit: args.limit ?? 20,
  });

  if (runs.length === 0) {
    console.log(`No runs found for coworker ${coworkerId}.`);
    return;
  }

  console.log(`Runs for ${coworkerId} (${runs.length}):\n`);
  for (const run of runs) {
    console.log(`${statusBadge(run.status)} ${run.id}`);
    console.log(`  started: ${formatDate(run.startedAt)}`);
    if (run.finishedAt) {
      console.log(`  finished: ${formatDate(run.finishedAt)}`);
    }
    if (run.errorMessage) {
      console.log(`  error: ${run.errorMessage}`);
    }
    console.log("");
  }
}

async function printRunLogs(
  client: RouterClient<AppRouter>,
  runId: string,
  watch: boolean,
  watchIntervalSeconds: number,
): Promise<void> {
  const seenEventIds = new Set<string>();
  let lastTranscript = "";
  let previousStatus = "";

  while (true) {
    // eslint-disable-next-line no-await-in-loop -- polling loop needs sequential fetches
    const run = await client.coworker.getRun({ id: runId });

    if (run.status !== previousStatus) {
      console.log(`Run ${run.id} ${statusBadge(run.status)}`);
      console.log(`  coworker: ${run.coworkerId}`);
      console.log(`  started: ${formatDate(run.startedAt)}`);
      if (run.finishedAt) {
        console.log(`  finished: ${formatDate(run.finishedAt)}`);
      }
      if (run.errorMessage) {
        console.log(`  error: ${run.errorMessage}`);
      }
      previousStatus = run.status;
      console.log("");
    }

    const unseenEvents = run.events.filter((event) => !seenEventIds.has(event.id));
    if (unseenEvents.length > 0) {
      console.log(`Events (${unseenEvents.length} new):`);
      for (const event of unseenEvents) {
        seenEventIds.add(event.id);
        console.log(`- ${formatDate(event.createdAt)} [${event.type}]`);
        console.log(`  ${JSON.stringify(event.payload, null, 2).replace(/\n/g, "\n  ")}`);
      }
      console.log("");
    }

    if (run.conversationId) {
      try {
        // eslint-disable-next-line no-await-in-loop -- polling loop needs sequential fetches
        const conversation = await client.conversation.get({ id: run.conversationId });
        const transcript = formatConversationTranscript(conversation.messages);

        if (transcript && transcript !== lastTranscript) {
          const transcriptLabel = lastTranscript ? "Updated transcript:" : "Transcript:";
          console.log(transcriptLabel);
          console.log(transcript);
          console.log("");
          lastTranscript = transcript;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Failed to load conversation transcript: ${message}`);
      }
    }

    if (!watch || TERMINAL_STATUSES.has(run.status)) {
      return;
    }

    // eslint-disable-next-line no-await-in-loop -- polling loop waits between sequential fetches
    await sleep(watchIntervalSeconds * 1000);
  }
}

function formatConversationTranscript(
  messages: Array<{
    id: string;
    role: string;
    content: string;
    contentParts: unknown[] | null;
    attachments: Array<{ filename: string; mimeType: string }>;
    sandboxFiles: Array<{ path: string; filename: string; mimeType: string; fileId: string }>;
  }>,
): string {
  const transcriptMessages = messages.map((message) => ({
    ...message,
    contentParts: message.contentParts ?? undefined,
  })) as Parameters<typeof formatPersistedChatTranscript>[0];

  return formatPersistedChatTranscript(transcriptMessages);
}

async function logsCoworkerRun(client: RouterClient<AppRouter>, args: ParsedArgs): Promise<void> {
  const runId = args.positionals[0];
  if (!runId) {
    throw new Error("Usage: bun run coworker logs <run-id> [--watch]");
  }

  await printRunLogs(client, runId, args.watch, args.watchIntervalSeconds);
}

async function approveCoworkerRun(
  client: RouterClient<AppRouter>,
  args: ParsedArgs,
): Promise<void> {
  const runId = args.positionals[0];
  const toolUseId = args.positionals[1];
  const decisionRaw = args.positionals[2];

  if (!runId || !toolUseId || !decisionRaw) {
    throw new Error("Usage: bun run coworker approve <run-id> <tool-use-id> <approve|deny>");
  }

  if (decisionRaw !== "approve" && decisionRaw !== "deny") {
    throw new Error("Decision must be 'approve' or 'deny'");
  }
  const decision: "approve" | "deny" = decisionRaw;

  const run = await client.coworker.getRun({ id: runId });
  if (!run.generationId) {
    throw new Error(`Run ${runId} has no active generation for approval.`);
  }

  const result = await client.generation.submitApproval({
    generationId: run.generationId,
    toolUseId,
    decision,
  });

  if (!result.success) {
    throw new Error("Approval was not applied. Request may be stale or already resolved.");
  }

  console.log(`Submitted ${decision} for ${toolUseId} on run ${runId}.`);
}

async function streamGenerationUntilTerminal(
  client: RouterClient<AppRouter>,
  generationId: string,
): Promise<"done" | "error" | "cancelled"> {
  const iterator = await client.generation.subscribeGeneration({ generationId });
  let printedText = false;

  for await (const event of iterator) {
    switch (event.type) {
      case "text":
        process.stdout.write(event.content);
        printedText = true;
        break;
      case "system":
        if (printedText) {
          process.stdout.write("\n");
          printedText = false;
        }
        console.log(`[system] ${event.content}`);
        break;
      case "error":
        if (printedText) {
          process.stdout.write("\n");
        }
        console.error(`Builder generation error: ${event.message}`);
        return "error";
      case "cancelled":
        if (printedText) {
          process.stdout.write("\n");
        }
        console.log("Builder generation cancelled.");
        return "cancelled";
      case "done":
        if (printedText) {
          process.stdout.write("\n");
        }
        return "done";
      default:
        break;
    }
  }

  if (printedText) {
    process.stdout.write("\n");
  }
  return "done";
}

async function startBuilderAgent(
  client: RouterClient<AppRouter>,
  params: {
    coworkerId: string;
    goal: string;
    model?: string;
  },
): Promise<void> {
  const { coworkerId, goal, model } = params;
  const resolvedModel = model?.trim() || DEFAULT_COWORKER_BUILDER_MODEL;
  const { conversationId } = await client.coworker.getOrCreateBuilderConversation({
    id: coworkerId,
  });
  const started = await client.generation.startGeneration({
    conversationId,
    content: goal,
    model: resolvedModel,
    autoApprove: true,
  });

  console.log(`Builder started for coworker ${coworkerId}`);
  console.log(`  conversation id: ${started.conversationId}`);
  console.log(`  generation id: ${started.generationId}`);
  console.log(`  model: ${resolvedModel}`);
  console.log("\nBuilder output:\n");
  await streamGenerationUntilTerminal(client, started.generationId);

  const updated = await client.coworker.get({ id: coworkerId });
  console.log("\nCoworker after builder run:");
  printCoworkerDetails(updated);
}

function getCloseLoopExampleGoal(): string {
  return [
    "Create a coworker that sends a message in Slack channel #bap-experiments every hour.",
    "Use schedule trigger with hourly cadence.",
    "Keep integrations minimal and include slack.",
    "Set coworker prompt so it posts a concise experiment update message.",
  ].join(" ");
}

async function runBuilderCommand(client: RouterClient<AppRouter>, args: ParsedArgs): Promise<void> {
  const coworkerId = args.positionals[0];
  if (!coworkerId) {
    throw new Error("Usage: bun run coworker builder <coworker-id> --message <text>");
  }
  if (!args.message?.trim()) {
    throw new Error("builder requires --message");
  }

  await startBuilderAgent(client, {
    coworkerId,
    goal: args.message.trim(),
    model: args.model,
  });
}

async function runCloseLoopCommand(
  client: RouterClient<AppRouter>,
  args: ParsedArgs,
  options?: { useExampleGoal?: boolean },
): Promise<void> {
  const rawIntegrations = args.integrations ?? [];
  const allowedIntegrations =
    rawIntegrations.length > 0
      ? rawIntegrations.filter(isCoworkerIntegrationType)
      : (["slack"] as CoworkerIntegrationType[]);

  const invalidIntegrations = rawIntegrations.filter((item) => !isCoworkerIntegrationType(item));
  if (invalidIntegrations.length > 0) {
    console.log(`Ignoring unknown integrations: ${invalidIntegrations.join(", ")}`);
  }

  const draftName = args.name?.trim() || "Close Loop Draft";
  const created = await client.coworker.create({
    name: draftName,
    triggerType: "manual",
    prompt: "",
    autoApprove: true,
    allowedIntegrations,
    allowedCustomIntegrations: args.customIntegrations ?? [],
    schedule: null,
  });

  const goal =
    options?.useExampleGoal === true
      ? getCloseLoopExampleGoal()
      : (args.message?.trim() ?? getCloseLoopExampleGoal());

  console.log(`Created draft coworker ${created.name}`);
  console.log(`  id: ${created.id}`);
  console.log(`  goal: ${goal}`);
  console.log("");

  await startBuilderAgent(client, {
    coworkerId: created.id,
    goal,
    model: args.model,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  let parsed: ParsedArgs;

  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    printHelp();
    process.exit(1);
  }

  const serverUrl = parsed.serverUrl || process.env.CMDCLAW_SERVER_URL || DEFAULT_SERVER_URL;
  const config = loadConfig(serverUrl);
  if (!config?.token) {
    console.error(
      `Not authenticated for ${serverUrl}. Run 'bun run chat -- --server ${serverUrl} --auth' first.`,
    );
    process.exit(1);
  }
  const client = createRpcClient(serverUrl, config.token);

  try {
    if (!parsed.command && parsed.list) {
      await listCoworkers(client, parsed);
      return;
    }
    if (!parsed.command && parsed.message?.trim()) {
      await runCloseLoopCommand(client, parsed);
      return;
    }
    if (!parsed.command) {
      printHelp();
      process.exit(1);
    }

    switch (parsed.command) {
      case "list":
      case "ls":
        await listCoworkers(client, parsed);
        break;
      case "patch":
        await patchCoworker(client, parsed);
        break;
      case "create":
      case "new":
        await createCoworker(client, parsed);
        break;
      case "show":
      case "get":
      case "inspect":
        await showCoworker(client, parsed);
        break;
      case "run":
      case "trigger":
      case "fire":
        await runCoworker(client, parsed);
        break;
      case "logs":
      case "show-run":
        await logsCoworkerRun(client, parsed);
        break;
      case "approve":
        await approveCoworkerRun(client, parsed);
        break;
      case "runs":
        await listRuns(client, parsed);
        break;
      case "builder":
        await runBuilderCommand(client, parsed);
        break;
      case "close-loop":
        await runCloseLoopCommand(client, parsed);
        break;
      case "close-loop-example":
        await runCloseLoopCommand(client, parsed, { useExampleGoal: true });
        break;
      default:
        throw new Error(`Unknown command: ${parsed.command}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

void main();
