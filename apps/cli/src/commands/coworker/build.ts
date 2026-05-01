import { DEFAULT_CONNECTED_CHATGPT_MODEL } from "@cmdclaw/core/lib/chat-model-defaults";
import { COWORKER_AVAILABLE_INTEGRATION_TYPES } from "@cmdclaw/core/lib/coworker-tool-policy";
import type { LocalContext } from "../../context";
import chatCommand from "../chat/impl";
import { getCoworkerRunner, splitCsv } from "./shared";

type BuildFlags = {
  server?: string;
  name?: string;
  message?: string;
  trigger?: string;
  model?: string;
  authSource?: "user" | "shared";
  integrations?: string;
  autoApprove?: boolean;
  open?: boolean;
  file?: readonly string[];
  validate: boolean;
  sandbox?: "e2b" | "daytona" | "docker";
};

export default async function (this: LocalContext, flags: BuildFlags): Promise<void> {
  const { client, runner } = await getCoworkerRunner({ server: flags.server });
  const model = flags.model ?? DEFAULT_CONNECTED_CHATGPT_MODEL;
  const allowedIntegrations = flags.integrations
    ? splitCsv(flags.integrations)
    : COWORKER_AVAILABLE_INTEGRATION_TYPES;

  const created = await runner.create({
    name: flags.name ?? "",
    triggerType: flags.trigger ?? "manual",
    prompt: "",
    model,
    authSource: flags.authSource ?? "shared",
    autoApprove: true,
    toolAccessMode: "all",
    allowedIntegrations,
  });

  const { conversationId } = await client.coworker.getOrCreateBuilderConversation({
    id: created.id,
  });

  this.process.stdout.write("Created builder coworker:\n");
  this.process.stdout.write(`  id: ${created.id}\n`);
  this.process.stdout.write(`  name: ${created.name || "(unnamed)"}\n`);
  this.process.stdout.write(`  username: ${created.username ?? "-"}\n`);
  this.process.stdout.write(`  builder conversation id: ${conversationId}\n\n`);

  await chatCommand.call(this, {
    server: flags.server,
    conversation: conversationId,
    message: flags.message,
    model,
    authSource: flags.authSource ?? "shared",
    sandbox: flags.sandbox,
    autoApprove: flags.autoApprove ?? true,
    open: flags.open ?? false,
    chaosApproval: "ask",
    validate: flags.validate,
    file: flags.file ?? [],
    questionAnswer: [],
    perfettoTrace: false,
    timing: false,
  });
}
