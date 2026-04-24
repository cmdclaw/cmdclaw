import type { LocalContext } from "../../context";
import { login } from "../../lib/auth";

type LoginFlags = {
  server?: string;
  token?: string;
  open?: boolean;
};

export default async function (this: LocalContext, flags: LoginFlags): Promise<void> {
  const profile = await login(flags.server, flags.token, { open: flags.open ?? false });
  this.process.stdout.write(`[auth] authenticated for ${profile.serverUrl}\n`);
}
