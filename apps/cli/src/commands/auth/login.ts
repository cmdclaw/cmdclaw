import type { LocalContext } from "../../context";
import { login } from "../../lib/auth";

type LoginFlags = {
  server?: string;
  token?: string;
};

export default async function (this: LocalContext, flags: LoginFlags): Promise<void> {
  const profile = await login(flags.server, flags.token);
  this.process.stdout.write(`[auth] authenticated for ${profile.serverUrl}\n`);
}
