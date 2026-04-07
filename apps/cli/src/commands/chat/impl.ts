import type { ProviderAuthSource } from "@cmdclaw/core/lib/provider-auth-source";
import { resolveDefaultChatModel } from "@cmdclaw/core/lib/chat-model-defaults";
import { parseModelReference } from "@cmdclaw/core/lib/model-reference";
import { listOpencodeFreeModels } from "@cmdclaw/core/server/ai/opencode-models";
import {
  createRpcClient,
  defaultProfileStore,
  runChatSession,
  DEFAULT_SERVER_URL,
  type CmdclawApiClient,
} from "@cmdclaw/client";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import readline from "node:readline";
import type { LocalContext } from "../../context";
import {
  collectScriptedQuestionAnswers,
  parseQuestionApprovalInput,
  resolveQuestionSelection,
  type QuestionApprovalItem,
} from "../../lib/question-approval";
import {
  formatModelSelection,
  parseInteractiveModelCommand,
  resolveCliModelSelection,
} from "../../lib/chat-model-source";
import { resolveCliToolMetadata } from "../../lib/tool-metadata";
import { createAuthenticatedClient, resolveServerUrl } from "../../lib/client";
import { exportPerfettoTraceForCompletedRun } from "./perfetto-trace";

type ChatFlags = {
  server?: string;
  conversation?: string;
  message?: string;
  model?: string;
  authSource?: ProviderAuthSource;
  sandbox?: "e2b" | "daytona" | "docker";
  listModels?: boolean;
  autoApprove?: boolean;
  validate: boolean;
  questionAnswer?: readonly string[];
  file?: readonly string[];
  perfettoTrace?: boolean;
  token?: string;
};

type ChatState = {
  authSource?: ProviderAuthSource | null;
  connectedProviderIds?: string[];
  conversationId?: string;
  perfettoTrace: boolean;
  file: readonly string[];
  message?: string;
  model?: string;
  questionAnswer: readonly string[];
  sandbox?: "e2b" | "daytona" | "docker";
  server?: string;
  autoApprove?: boolean;
  validate: boolean;
};

const AUTH_INTEGRATION_TYPES = [
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
] as const;

type AuthIntegrationType = (typeof AUTH_INTEGRATION_TYPES)[number];

const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".json": "application/json",
  ".csv": "text/csv",
};

function isAuthIntegrationType(integration: string): integration is AuthIntegrationType {
  return (AUTH_INTEGRATION_TYPES as readonly string[]).includes(integration);
}

function createPrompt(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(rl: readline.Interface, query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, (answer) => resolve(answer));
  });
}

function openUrlInBrowser(url: string): boolean {
  try {
    const commandByPlatform: Record<string, { cmd: string; args: string[] }> = {
      darwin: { cmd: "open", args: [url] },
      linux: { cmd: "xdg-open", args: [url] },
      win32: { cmd: "cmd", args: ["/c", "start", "", url] },
    };
    const command = commandByPlatform[process.platform];
    if (!command) {
      return false;
    }
    const child = Bun.spawn([command.cmd, ...command.args], {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
      detached: true,
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

function normalizeText(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function fileToAttachment(filePath: string): {
  name: string;
  mimeType: string;
  dataUrl: string;
} {
  const resolved = resolve(filePath);
  if (!existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`);
  }
  const ext = extname(resolved).toLowerCase();
  const mimeType = MIME_MAP[ext] || "application/octet-stream";
  const data = readFileSync(resolved);
  const base64 = data.toString("base64");
  return {
    name: basename(resolved),
    mimeType,
    dataUrl: `data:${mimeType};base64,${base64}`,
  };
}

function createApprovalPrompt(rl: readline.Interface | null): {
  rl: readline.Interface;
  close: () => void;
} | null {
  if (rl && process.stdin.isTTY && process.stdout.isTTY) {
    return {
      rl,
      close: () => {},
    };
  }

  if (!process.stdout.isTTY) {
    return null;
  }

  try {
    const input = createReadStream("/dev/tty");
    const output = process.stdout;
    const ttyRl = readline.createInterface({ input, output });
    return {
      rl: ttyRl,
      close: () => {
        ttyRl.close();
        input.close();
      },
    };
  } catch {
    return null;
  }
}

async function collectQuestionApprovalAnswers(
  rl: readline.Interface,
  questions: QuestionApprovalItem[],
): Promise<string[][]> {
  const collected: string[][] = [];
  for (const question of questions) {
    process.stdout.write(`\n[question] ${question.header}\n`);
    process.stdout.write(`${question.question}\n`);
    question.options.forEach((option, optionIndex) => {
      const suffix = option.description ? ` - ${option.description}` : "";
      process.stdout.write(`  ${optionIndex + 1}. ${option.label}${suffix}\n`);
    });
    if (question.custom) {
      process.stdout.write("  t. Type your own answer\n");
    }
    const rawSelection = await ask(
      rl,
      question.options.length > 0 ? "Select an option (default 1): " : "Answer: ",
    );
    if (question.custom && rawSelection.trim().toLowerCase() === "t") {
      const typedAnswer = await ask(rl, "Type your answer: ");
      collected.push(resolveQuestionSelection(question, typedAnswer));
    } else {
      collected.push(resolveQuestionSelection(question, rawSelection));
    }
  }
  return collected;
}

async function printAuthenticatedUser(
  stdout: NodeJS.WriteStream,
  client: CmdclawApiClient,
): Promise<void> {
  try {
    const me = await client.user.me();
    stdout.write(`[auth] ${me.email} (${me.id})\n`);
  } catch (error) {
    stdout.write(
      `[auth] failed to resolve current user: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  }
}

async function hydrateProviderAvailability(client: CmdclawApiClient, state: ChatState) {
  const [authStatus, freeModels] = await Promise.all([
    client.providerAuth.status(),
    client.providerAuth.freeModels(),
  ]);

  state.connectedProviderIds = Object.keys(authStatus.connected ?? {});
  const sharedConnectedProviderIds = Object.keys(authStatus.shared ?? {});

  if (state.model?.trim()) {
    const resolvedSelection = resolveCliModelSelection({
      model: state.model.trim(),
      authSource: state.authSource,
      connectedProviderIds: state.connectedProviderIds,
      sharedConnectedProviderIds,
    });
    state.model = resolvedSelection.model;
    state.authSource = resolvedSelection.authSource;
  } else {
    const defaultModel = resolveDefaultChatModel({
      isOpenAIConnected:
        (state.connectedProviderIds ?? []).includes("openai") ||
        sharedConnectedProviderIds.includes("openai"),
      availableOpencodeFreeModelIDs: (freeModels.models ?? []).map((model) => model.id),
    });
    const resolvedSelection = resolveCliModelSelection({
      model: defaultModel,
      connectedProviderIds: state.connectedProviderIds,
      sharedConnectedProviderIds,
    });
    state.model = resolvedSelection.model;
    state.authSource = resolvedSelection.authSource;
  }

  return freeModels.models ?? [];
}

async function validatePersistedAssistantMessage(
  client: CmdclawApiClient,
  conversationId: string,
  messageId: string,
  expected: { content: string; parts: Array<{ type: string }> },
): Promise<void> {
  const conversation = await client.conversation.get({ id: conversationId });
  const savedMessage = conversation.messages.find((message) => message.id === messageId);

  if (!savedMessage) {
    throw new Error(
      `Validation failed: assistant message ${messageId} was not saved in conversation ${conversationId}`,
    );
  }

  const persistedParts = Array.isArray(savedMessage.contentParts) ? savedMessage.contentParts : [];
  if (expected.parts.length > 0 && persistedParts.length === 0) {
    throw new Error(
      "Validation failed: stream produced activity/text but saved message has no contentParts",
    );
  }

  const normalizedStream = normalizeText(expected.content);
  if (normalizedStream.length === 0) {
    return;
  }

  const normalizedPersisted = normalizeText(savedMessage.content ?? "");
  if (!normalizedPersisted.includes(normalizedStream)) {
    throw new Error(
      "Validation failed: streamed assistant text does not match saved message content",
    );
  }
}

async function runOneGeneration(
  stdout: NodeJS.WriteStream,
  client: CmdclawApiClient,
  rl: readline.Interface | null,
  state: ChatState,
  content: string,
  conversationId: string | undefined,
  attachments?: { name: string; mimeType: string; dataUrl: string }[],
): Promise<string | null> {
  const resolvedServerUrl = resolveServerUrl(state.server);
  const normalizedServerUrl = resolvedServerUrl.replace(/\/$/, "");

  const result = await runChatSession({
    client,
    input: {
      conversationId,
      content,
      model: state.model,
      authSource: state.authSource,
      sandboxProvider: state.sandbox,
      autoApprove: state.autoApprove,
      fileAttachments: attachments?.length ? attachments : undefined,
    },
    onText: (text) => {
      stdout.write(text);
    },
    onThinking: (thinking) => {
      stdout.write(`\n[thinking] ${thinking}\n`);
    },
    onToolUse: (toolUse) => {
      const metadata = resolveCliToolMetadata(toolUse);
      stdout.write(`\n[tool_use] ${toolUse.toolName}\n`);
      if (metadata.integration) {
        stdout.write(`[tool_integration] ${metadata.integration}\n`);
      }
      if (typeof metadata.isWrite === "boolean") {
        stdout.write(`[tool_is_write] ${metadata.isWrite}\n`);
      }
      stdout.write(`[tool_input] ${JSON.stringify(toolUse.toolInput)}\n`);
    },
    onToolResult: (toolName, resultValue) => {
      stdout.write(`\n[tool_result] ${toolName}\n`);
      stdout.write(`[tool_result_data] ${typeof resultValue === "string" ? resultValue : JSON.stringify(resultValue)}\n`);
    },
    onPendingApproval: async (approval, apiClient) => {
      stdout.write(`\n[approval_needed] ${approval.toolName}\n`);
      stdout.write(
        `[approval_input] ${JSON.stringify({
          integration: approval.integration,
          operation: approval.operation,
          command: approval.command,
          toolInput: approval.toolInput,
        })}\n`,
      );

      const questionItems = parseQuestionApprovalInput(approval.toolInput);
      if (questionItems) {
        if (state.questionAnswer.length > 0) {
          const questionAnswers = collectScriptedQuestionAnswers(questionItems, [...state.questionAnswer]);
          await apiClient.generation.submitApproval({
            generationId: approval.generationId,
            toolUseId: approval.toolUseId,
            decision: "approve",
            questionAnswers,
          });
          return "handled";
        }

        const approvalPrompt = createApprovalPrompt(rl);
        if (!approvalPrompt) {
          stdout.write(
            ` -> no interactive prompt available, leaving question interrupt pending (${approval.toolUseId})\n`,
          );
          return "deferred";
        }

        try {
          const questionAnswers = await collectQuestionApprovalAnswers(
            approvalPrompt.rl,
            questionItems,
          );
          await apiClient.generation.submitApproval({
            generationId: approval.generationId,
            toolUseId: approval.toolUseId,
            decision: "approve",
            questionAnswers,
          });
          return "handled";
        } finally {
          approvalPrompt.close();
        }
      }

      if (state.autoApprove) {
        await apiClient.generation.submitApproval({
          generationId: approval.generationId,
          toolUseId: approval.toolUseId,
          decision: "approve",
        });
        return "handled";
      }

      const approvalPrompt = createApprovalPrompt(rl);
      if (!approvalPrompt) {
        stdout.write(
          ` -> no interactive prompt available, leaving interrupt pending (${approval.toolUseId})\n`,
        );
        return "deferred";
      }

      try {
        const decision = (await ask(approvalPrompt.rl, "Approve? (y/n) ")).trim().toLowerCase();
        await apiClient.generation.submitApproval({
          generationId: approval.generationId,
          toolUseId: approval.toolUseId,
          decision: decision === "y" || decision === "yes" ? "approve" : "deny",
        });
        return "handled";
      } finally {
        approvalPrompt.close();
      }
    },
    onAuthNeeded: async (auth, apiClient) => {
      stdout.write(`\n[auth_needed] ${auth.integrations.join(", ")}\n`);
      const authPrompt = createApprovalPrompt(rl);

      for (const integration of auth.integrations) {
        if (!isAuthIntegrationType(integration)) {
          stdout.write(`[auth_error] Unsupported integration for CLI auth flow: ${integration}\n`);
          return "deferred";
        }

        const redirectUrl = `${normalizedServerUrl}/chat/${auth.conversationId}?auth_complete=${integration}&generation_id=${auth.generationId}`;
        const { authUrl } = await apiClient.integration.getAuthUrl({
          type: integration,
          redirectUrl,
        });
        stdout.write(`[auth_url] ${integration}: ${authUrl}\n`);
        const opened = openUrlInBrowser(authUrl);
        stdout.write(
          opened
            ? "[auth_action] Browser opened. Complete auth in the browser.\n"
            : "[auth_action] Open the URL above and complete auth.\n",
        );

        if (!authPrompt) {
          stdout.write(
            "[auth_action] Non-interactive mode: cannot submit auth result automatically.\n",
          );
          return "deferred";
        }

        const confirmation = (
          await ask(authPrompt.rl, "auth> press Enter when done (or type 'cancel'): ")
        )
          .trim()
          .toLowerCase();
        const allow = confirmation !== "cancel" && confirmation !== "n" && confirmation !== "no";
        await apiClient.generation.submitAuthResult({
          generationId: auth.generationId,
          integration,
          success: allow,
        });
      }

      authPrompt?.close();
      return "handled";
    },
  });

  switch (result.status) {
    case "completed":
      stdout.write("\n");
      if (state.validate) {
        await validatePersistedAssistantMessage(client, result.conversationId, result.messageId, {
          content: result.assistant.content,
          parts: result.assistant.parts.map((part) => ({ type: part.type })),
        });
      }
      if (state.perfettoTrace) {
        const traceResult = exportPerfettoTraceForCompletedRun({
          cwd: process.cwd(),
          conversationId: result.conversationId,
          generationId: result.generationId,
          artifacts: result.artifacts,
        });
        if (traceResult.status === "written") {
          stdout.write(`[perfetto_trace] ${traceResult.path}\n`);
        } else {
          stdout.write("[warning] Perfetto trace export skipped: phase timestamps unavailable.\n");
        }
      }
      stdout.write(`[conversation] ${result.conversationId}\n`);
      return result.conversationId;
    case "needs_auth":
      stdout.write(`[conversation] ${result.conversationId}\n`);
      return result.conversationId;
    case "needs_approval":
      stdout.write(`[conversation] ${result.conversationId}\n`);
      return result.conversationId;
    case "cancelled":
      stdout.write("\n[cancelled]\n");
      return result.conversationId;
    case "failed":
      stdout.write(`\n[error] ${result.error.message}\n`);
      return null;
  }
}

async function runChatLoop(
  stdout: NodeJS.WriteStream,
  client: CmdclawApiClient,
  rl: readline.Interface,
  state: ChatState,
): Promise<void> {
  let conversationId = state.conversationId;
  let pendingFiles = [...state.file];
  state.file = [];

  while (true) {
    const rawInput = await ask(rl, conversationId ? "followup> " : "chat> ");
    const input = rawInput.trim();
    if (!input) {
      stdout.write("Bye.\n");
      return;
    }

    if (input.startsWith("/file ")) {
      pendingFiles.push(input.slice(6).trim());
      stdout.write(`Attached: ${basename(input.slice(6).trim())}\n`);
      continue;
    }

    if (input === "/model") {
      stdout.write(
        `Current model: ${formatModelSelection({
          model: state.model ?? "auto",
          authSource: state.authSource,
        })}\n`,
      );
      continue;
    }

    if (input.startsWith("/model ")) {
      const parsed = parseInteractiveModelCommand(input.slice(7).trim());
      parseModelReference(parsed.model);
      const resolvedSelection = resolveCliModelSelection({
        model: parsed.model,
        authSource: parsed.authSource,
        connectedProviderIds: state.connectedProviderIds,
      });
      state.model = resolvedSelection.model;
      state.authSource = resolvedSelection.authSource;
      stdout.write(`Switched model to: ${formatModelSelection(resolvedSelection)}\n`);
      continue;
    }

    if (input === "/models") {
      await printAvailableModels(stdout, state);
      continue;
    }

    const attachments = pendingFiles.map((file) => fileToAttachment(file));
    pendingFiles = [];

    const nextConversationId = await runOneGeneration(
      stdout,
      client,
      rl,
      state,
      input,
      conversationId,
      attachments.length ? attachments : undefined,
    );
    if (!nextConversationId) {
      return;
    }
    conversationId = nextConversationId;
  }
}

async function printAvailableModels(
  stdout: NodeJS.WriteStream,
  state: Pick<ChatState, "connectedProviderIds">,
): Promise<void> {
  const freeModels = await listOpencodeFreeModels();
  const userOpenAIAvailable = (state.connectedProviderIds ?? []).includes("openai");

  stdout.write("CmdClaw Models:\n");
  stdout.write("- Claude Sonnet 4.6 (anthropic/claude-sonnet-4-6) [source=shared]\n");
  stdout.write("- GPT-5.4 (openai/gpt-5.4) [source=shared]\n");
  stdout.write("- GPT-5.4 Mini (openai/gpt-5.4-mini) [source=shared]\n");
  stdout.write("\nYour AI Accounts:\n");
  if (userOpenAIAvailable) {
    stdout.write("- GPT-5.4 (openai/gpt-5.4) [source=user]\n");
    stdout.write("- GPT-5.4 Mini (openai/gpt-5.4-mini) [source=user]\n");
  } else {
    stdout.write("- ChatGPT not connected [source=user]\n");
  }
  if (freeModels.length > 0) {
    stdout.write(`\nFree OpenCode Models (${freeModels.length}):\n`);
    for (const model of freeModels) {
      stdout.write(`- ${model.name} (${model.id})\n`);
    }
  }
}

function attachSigintHandler(rl: readline.Interface): void {
  rl.on("SIGINT", () => {
    console.log("\nBye.");
    rl.close();
    process.exit(0);
  });
}

export default async function (this: LocalContext, flags: ChatFlags): Promise<void> {
  const serverUrl = resolveServerUrl(flags.server);
  if (flags.token) {
    defaultProfileStore.save({
      serverUrl,
      token: flags.token,
    });
  }

  const { client } = createAuthenticatedClient({
    serverUrl,
    token: flags.token,
  });

  const state: ChatState = {
    server: serverUrl,
    conversationId: flags.conversation,
    message: flags.message,
    model: flags.model,
    authSource: flags.authSource,
    sandbox: flags.sandbox,
    autoApprove: flags.autoApprove,
    validate: flags.validate,
    file: flags.file ?? [],
    perfettoTrace: flags.perfettoTrace ?? false,
    questionAnswer: flags.questionAnswer ?? [],
  };

  await hydrateProviderAvailability(client, state);
  this.process.stdout.write(
    `[model] ${formatModelSelection({ model: state.model ?? "auto", authSource: state.authSource })}\n`,
  );
  await printAuthenticatedUser(this.process.stdout, client);

  if (flags.listModels) {
    await printAvailableModels(this.process.stdout, state);
    return;
  }

  if (state.message) {
    const rl = process.stdin.isTTY && process.stdout.isTTY ? createPrompt() : null;
    if (rl) {
      attachSigintHandler(rl);
    }
    const attachments = state.file.map((file) => fileToAttachment(file));
    const conversationId = await runOneGeneration(
      this.process.stdout,
      client,
      rl,
      state,
      state.message,
      state.conversationId,
      attachments.length ? attachments : undefined,
    );
    if (conversationId && rl) {
      state.conversationId = conversationId;
      state.message = undefined;
      state.file = [];
      await runChatLoop(this.process.stdout, client, rl, state);
      rl.close();
    }
    return;
  }

  const rl = createPrompt();
  attachSigintHandler(rl);
  await runChatLoop(this.process.stdout, client, rl, state);
  rl.close();
}
