import { type InferSchema, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { getCurrentGalienUser } from "../lib/galien-client";

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

export default async function getMyProfile(_params: InferSchema<typeof schema>) {
  const currentUser = await getCurrentGalienUser();
  return toMcpToolResult({
    source: "galien-login-jwt",
    data: currentUser,
  });
}
