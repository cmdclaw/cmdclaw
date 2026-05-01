import { type InferSchema, type ToolExtraArguments, type ToolMetadata } from "xmcp";
import { toMcpToolResult } from "../../../../shared/tool-result";
import { requestCurrentGalienUserGet } from "../lib/tool-helpers";

export const schema = {};

export const metadata: ToolMetadata = {
  name: "get_my_activity",
  description:
    "Get the authenticated Galien user's activity. Use this for 'my activity', 'mon activité', or current-user Galien activity. The userId is read from the login JWT.",
  annotations: {
    title: "Get My Activity",
    readOnlyHint: true,
    idempotentHint: true,
  },
};

export default async function getMyActivity(params: InferSchema<typeof schema>, extra?: ToolExtraArguments) {
  const result = await requestCurrentGalienUserGet("/api/v1/users/{userId}/activity", params, extra);
  return toMcpToolResult(result);
}
