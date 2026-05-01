import { type InferSchema, type ToolExtraArguments, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { getCurrentGalienUser } from "../lib/galien-client";
import { getManagedGalienToolCredentials } from "../lib/galien-auth";

export const schema = {};

export const metadata: ToolMetadata = {
  name: "get_my_profile",
  description:
    "Get the authenticated Galien user's profile from the login JWT. Use this for 'me', 'my Galien user', 'mon profil', or 'qui suis-je'. Does not require a userId.",
  annotations: {
    title: "Get My Profile",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getMyProfile(_params: InferSchema<typeof schema>, extra?: ToolExtraArguments) {
  const credentials = await getManagedGalienToolCredentials(extra);
  const currentUser = await getCurrentGalienUser(credentials);
  return toMcpToolResult({
    source: "galien-login-jwt",
    data: currentUser,
  });
}
