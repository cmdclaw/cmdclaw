import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { CmdclawApiClient } from "./types";

export function createRpcClient(serverUrl: string, token: string): CmdclawApiClient {
  const link = new RPCLink({
    url: `${serverUrl}/api/rpc`,
    headers: () => ({ Authorization: `Bearer ${token}` }),
  });

  return createORPCClient(link) as unknown as CmdclawApiClient;
}
