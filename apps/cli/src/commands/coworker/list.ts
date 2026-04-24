import type { LocalContext } from "../../context";
import { formatDate, getCoworkerRunner, statusBadge } from "./shared";

type ListFlags = {
  server?: string;
  json?: boolean;
};

export default async function (this: LocalContext, flags: ListFlags): Promise<void> {
  const { runner } = await getCoworkerRunner({ server: flags.server });
  const coworkers = await runner.list();

  if (flags.json) {
    this.process.stdout.write(`${JSON.stringify(coworkers, null, 2)}\n`);
    return;
  }

  if (coworkers.length === 0) {
    this.process.stdout.write("No coworkers found.\n");
    return;
  }

  this.process.stdout.write(`Coworkers (${coworkers.length}):\n\n`);
  for (const coworker of coworkers) {
    this.process.stdout.write(`${coworker.name || "(unnamed)"}\n`);
    this.process.stdout.write(`  id: ${coworker.id}\n`);
    this.process.stdout.write(`  username: ${coworker.username ?? "-"}\n`);
    this.process.stdout.write(`  status: ${coworker.status}\n`);
    this.process.stdout.write(`  trigger: ${coworker.triggerType}\n`);
    this.process.stdout.write(`  last run: ${statusBadge(coworker.lastRunStatus)} @ ${formatDate(coworker.lastRunAt)}\n\n`);
  }
}
