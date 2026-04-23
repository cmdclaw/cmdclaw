import type { LocalContext } from "../../context";
import { formatConversationTranscript, getCoworkerRunner, parsePayload } from "./shared";

type RunFlags = {
  server?: string;
  payload?: string;
  jsonCoworker?: string;
  watch?: boolean;
  watchInterval?: number;
  json?: boolean;
};

export type ImportedCoworkerRunResult = {
  importedCoworker: {
    id: string;
    name: string;
    description: string | null;
    username: string | null;
    status: string;
  };
  triggeredRun: {
    coworkerId: string;
    runId: string;
    generationId: string;
    conversationId: string;
  };
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function printRunLogs(
  stdout: NodeJS.WriteStream,
  runner: ReturnType<typeof getCoworkerRunner>["runner"],
  client: ReturnType<typeof getCoworkerRunner>["client"],
  runId: string,
  watch: boolean,
  watchIntervalSeconds: number,
): Promise<void> {
  const seenEventIds = new Set<string>();
  let lastTranscript = "";
  let previousStatus = "";

  while (true) {
    const run = await runner.logs(runId);

    if (run.status !== previousStatus) {
      stdout.write(`Run ${run.id} ${run.status}\n`);
      stdout.write(`  coworker: ${run.coworkerId}\n`);
      stdout.write(`  started: ${new Date(run.startedAt).toLocaleString()}\n`);
      if (run.finishedAt) {
        stdout.write(`  finished: ${new Date(run.finishedAt).toLocaleString()}\n`);
      }
      if (run.errorMessage) {
        stdout.write(`  error: ${run.errorMessage}\n`);
      }
      stdout.write("\n");
      previousStatus = run.status;
    }

    const unseenEvents = run.events.filter((event) => !seenEventIds.has(event.id));
    if (unseenEvents.length > 0) {
      stdout.write(`Events (${unseenEvents.length} new):\n`);
      for (const event of unseenEvents) {
        seenEventIds.add(event.id);
        stdout.write(`- ${new Date(event.createdAt).toLocaleString()} [${event.type}]\n`);
        stdout.write(`  ${JSON.stringify(event.payload, null, 2).replace(/\n/g, "\n  ")}\n`);
      }
      stdout.write("\n");
    }

    if (run.conversationId) {
      const conversation = await client.conversation.get({ id: run.conversationId });
      const transcript = formatConversationTranscript(conversation.messages);
      if (transcript && transcript !== lastTranscript) {
        stdout.write(lastTranscript ? "Updated transcript:\n" : "Transcript:\n");
        stdout.write(`${transcript}\n\n`);
        lastTranscript = transcript;
      }
    }

    if (!watch || ["completed", "cancelled", "error", "success", "failed"].includes(run.status)) {
      return;
    }

    await sleep(watchIntervalSeconds * 1000);
  }
}

export async function runCoworkerFromDefinition(params: {
  runner: ReturnType<typeof getCoworkerRunner>["runner"];
  reference?: string;
  payload?: unknown;
  jsonCoworker?: string;
}): Promise<
  | {
      importedCoworker: null;
      triggeredRun: {
        coworkerId: string;
        runId: string;
        generationId: string;
        conversationId: string;
      };
    }
  | ImportedCoworkerRunResult
> {
  const definitionJson = params.jsonCoworker?.trim();

  if (definitionJson) {
    if (params.reference?.trim()) {
      throw new Error("Cannot combine a coworker reference with --json-coworker.");
    }

    const importedCoworker = await params.runner.importDefinition(definitionJson);
    await params.runner.update({ id: importedCoworker.id, status: "on" });
    const triggeredRun = await params.runner.run(importedCoworker.id, params.payload);

    return {
      importedCoworker,
      triggeredRun,
    };
  }

  const reference = params.reference?.trim();
  if (!reference) {
    throw new Error("Coworker reference is required unless --json-coworker is provided.");
  }

  return {
    importedCoworker: null,
    triggeredRun: await params.runner.run(reference, params.payload),
  };
}

export default async function (
  this: LocalContext,
  flags: RunFlags,
  reference?: string,
): Promise<void> {
  const { runner, client } = getCoworkerRunner({ server: flags.server });
  const result = await runCoworkerFromDefinition({
    runner,
    reference,
    payload: parsePayload(flags.payload),
    jsonCoworker: flags.jsonCoworker,
  });

  if (flags.json) {
    this.process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (result.importedCoworker) {
    this.process.stdout.write(`Imported coworker ${result.importedCoworker.id}\n`);
    this.process.stdout.write(`  name: ${result.importedCoworker.name || "(unnamed)"}\n`);
    this.process.stdout.write(`  username: ${result.importedCoworker.username ?? "-"}\n`);
    this.process.stdout.write("\n");
  }

  this.process.stdout.write(`Triggered coworker ${result.triggeredRun.coworkerId}\n`);
  this.process.stdout.write(`  run id: ${result.triggeredRun.runId}\n`);
  this.process.stdout.write(`  generation id: ${result.triggeredRun.generationId}\n`);
  this.process.stdout.write(`  conversation id: ${result.triggeredRun.conversationId}\n`);

  if (flags.watch) {
    this.process.stdout.write("\nWatching logs... (Ctrl+C to stop)\n\n");
    await printRunLogs(
      this.process.stdout,
      runner,
      client,
      result.triggeredRun.runId,
      true,
      flags.watchInterval ?? 2,
    );
  }
}
