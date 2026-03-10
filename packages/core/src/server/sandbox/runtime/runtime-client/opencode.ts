import {
  createOpencodeClient as createOpencodeV2Client,
  type OpencodeClient,
} from "@opencode-ai/sdk/v2/client";
import type { SandboxRuntimeAdapterOptions, SandboxRuntimeClientImplementation } from "../types";

export function createSandboxOpencodeClient(options: {
  baseUrl: string;
  fetch?: typeof fetch;
}): OpencodeClient {
  return createOpencodeV2Client(options);
}

export const opencodeRuntimeClientImplementation: SandboxRuntimeClientImplementation = {
  createRuntimeClient: async (options: SandboxRuntimeAdapterOptions) => {
    console.info("[SandboxRuntime] Using opencode runtime client");
    return createSandboxOpencodeClient({
      baseUrl: options.opencodeBaseUrl,
      fetch: options.fetch,
    });
  },
};
