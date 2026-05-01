import type { ToolExtraArguments } from "xmcp";
import { getManagedGalienCredentials } from "../../../../shared/control-plane";
import type { GalienCredentials } from "./galien-client";

type ManagedGalienClaims = {
  userId: string;
  workspaceId: string;
  audience: string;
  internalKey?: string;
};

export async function getManagedGalienToolCredentials(
  extra?: ToolExtraArguments,
): Promise<GalienCredentials> {
  const claims = extra?.authInfo?.extra as ManagedGalienClaims | undefined;
  const isGalienAudience = claims?.audience === "galien" || claims?.internalKey === "galien";
  if (!claims?.userId || !claims.workspaceId || !isGalienAudience) {
    throw new Error("Managed Galien MCP authentication is required.");
  }

  const credential = await getManagedGalienCredentials({
    userId: claims.userId,
    workspaceId: claims.workspaceId,
  });

  return {
    username: credential.username,
    password: credential.password,
  };
}
