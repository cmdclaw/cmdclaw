import type { LocalContext } from "../../context";
import { formatDate, getCoworkerRunner, statusBadge } from "./shared";

type GetFlags = {
  server?: string;
  json?: boolean;
};

export default async function (
  this: LocalContext,
  flags: GetFlags,
  reference: string,
): Promise<void> {
  const { runner } = await getCoworkerRunner({ server: flags.server });
  const coworker = await runner.get(reference);

  if (flags.json) {
    this.process.stdout.write(`${JSON.stringify(coworker, null, 2)}\n`);
    return;
  }

  this.process.stdout.write(`${coworker.name || "(unnamed coworker)"}\n`);
  this.process.stdout.write(`id: ${coworker.id}\n`);
  this.process.stdout.write(`username: ${coworker.username ?? "-"}\n`);
  this.process.stdout.write(`status: ${coworker.status}\n`);
  this.process.stdout.write(`trigger: ${coworker.triggerType}\n`);
  this.process.stdout.write(`model: ${coworker.model}\n`);
  this.process.stdout.write(`auth source: ${coworker.authSource ?? "-"}\n`);
  this.process.stdout.write(`auto approve: ${coworker.autoApprove ? "yes" : "no"}\n`);
  this.process.stdout.write(`tool access: ${coworker.toolAccessMode}\n`);
  this.process.stdout.write(`integrations: ${coworker.allowedIntegrations.join(", ") || "-"}\n`);
  this.process.stdout.write(`updated: ${formatDate(coworker.updatedAt)}\n`);
  this.process.stdout.write(`prompt:\n${coworker.prompt}\n`);

  if (coworker.runs.length > 0) {
    this.process.stdout.write("\nRecent runs:\n");
    for (const run of coworker.runs) {
      this.process.stdout.write(
        `- ${statusBadge(run.status)} ${run.id} started ${formatDate(run.startedAt)}\n`,
      );
    }
  }
}
