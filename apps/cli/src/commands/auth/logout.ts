import { defaultProfileStore } from "@cmdclaw/client";
import type { LocalContext } from "../../context";
import { resolveServerUrl } from "../../lib/client";

type LogoutFlags = {
  server?: string;
};

export default async function (this: LocalContext, flags: LogoutFlags): Promise<void> {
  const serverUrl = resolveServerUrl(flags.server);
  defaultProfileStore.clear(serverUrl);
  this.process.stdout.write(`[auth] cleared saved token for ${serverUrl}\n`);
}
