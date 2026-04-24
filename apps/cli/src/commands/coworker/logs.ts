import type { LocalContext } from "../../context";
import { formatConversationTranscript, getCoworkerRunner } from "./shared";

type LogsFlags = {
  server?: string;
  watch?: boolean;
  watchInterval?: number;
  json?: boolean;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default async function (
  this: LocalContext,
  flags: LogsFlags,
  runId: string,
): Promise<void> {
  const { runner, client } = await getCoworkerRunner({ server: flags.server });
  const seenEventIds = new Set<string>();
  let lastTranscript = "";
  let previousStatus = "";

  while (true) {
    const run = await runner.logs(runId);

    if (flags.json) {
      this.process.stdout.write(`${JSON.stringify(run, null, 2)}\n`);
      return;
    }

    if (run.status !== previousStatus) {
      this.process.stdout.write(`Run ${run.id} ${run.status}\n`);
      this.process.stdout.write(`  coworker: ${run.coworkerId}\n`);
      this.process.stdout.write(`  started: ${new Date(run.startedAt).toLocaleString()}\n`);
      if (run.finishedAt) {
        this.process.stdout.write(`  finished: ${new Date(run.finishedAt).toLocaleString()}\n`);
      }
      if (run.errorMessage) {
        this.process.stdout.write(`  error: ${run.errorMessage}\n`);
      }
      this.process.stdout.write("\n");
      previousStatus = run.status;
    }

    const unseenEvents = run.events.filter((event) => !seenEventIds.has(event.id));
    if (unseenEvents.length > 0) {
      this.process.stdout.write(`Events (${unseenEvents.length} new):\n`);
      for (const event of unseenEvents) {
        seenEventIds.add(event.id);
        this.process.stdout.write(`- ${new Date(event.createdAt).toLocaleString()} [${event.type}]\n`);
        this.process.stdout.write(`  ${JSON.stringify(event.payload, null, 2).replace(/\n/g, "\n  ")}\n`);
      }
      this.process.stdout.write("\n");
    }

    if (run.conversationId) {
      const conversation = await client.conversation.get({ id: run.conversationId });
      const transcript = formatConversationTranscript(conversation.messages);
      if (transcript && transcript !== lastTranscript) {
        this.process.stdout.write(lastTranscript ? "Updated transcript:\n" : "Transcript:\n");
        this.process.stdout.write(`${transcript}\n\n`);
        lastTranscript = transcript;
      }
    }

    if (!flags.watch || ["completed", "cancelled", "error", "success", "failed"].includes(run.status)) {
      return;
    }

    await sleep((flags.watchInterval ?? 2) * 1000);
  }
}
