import type { LocalContext } from "../../context";
import { authStatus } from "../../lib/auth";

type StatusFlags = {
  server?: string;
};

export default async function (this: LocalContext, flags: StatusFlags): Promise<void> {
  const status = await authStatus(flags.server);

  this.process.stdout.write(`[server] ${status.serverUrl}\n`);
  this.process.stdout.write(`[config] ${status.configPath}\n`);

  if (!status.profile?.token) {
    this.process.stdout.write("[auth] not authenticated\n");
    return;
  }

  this.process.stdout.write("[auth] token present\n");
  if (status.user) {
    this.process.stdout.write(`[user] ${status.user.email} (${status.user.id})\n`);
  } else {
    this.process.stdout.write("[user] saved token could not be verified\n");
  }
}
