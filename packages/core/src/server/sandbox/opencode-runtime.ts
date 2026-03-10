import type { OpencodeClient } from "@opencode-ai/sdk/v2/client";
import { env } from "../../env";
import type { SandboxAgentRuntime, SandboxSessionBridge } from "./runtime/types";
import {
  createSandboxRuntimeClientByRuntime,
  createSandboxSessionBridgeByRuntime,
} from "./runtime/factory";
import { createSandboxOpencodeClient } from "./runtime/runtime-client/opencode";

export const OPENCODE_PORT = 4096;
export const SANDBOX_AGENT_PORT = 2468;

function joinUrlPath(baseUrl: string, path: string): string {
  const parsed = new URL(baseUrl);
  const normalizedBase = parsed.pathname.endsWith("/")
    ? parsed.pathname.slice(0, -1)
    : parsed.pathname;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  parsed.pathname = `${normalizedBase}${normalizedPath}`;
  return parsed.toString();
}

export function getSandboxAgentRuntime(): SandboxAgentRuntime {
  return env.SANDBOX_AGENT_RUNTIME;
}

export function getSandboxServerStartCommand(sandboxId: string): string {
  const runtime = getSandboxAgentRuntime();
  const serverCommand =
    runtime === "agentsdk"
      ? `sandbox-agent server --no-token --host 0.0.0.0 --port ${SANDBOX_AGENT_PORT}`
      : `opencode serve --port ${OPENCODE_PORT} --hostname 0.0.0.0`;
  return `export SANDBOX_ID=${sandboxId} && cd /app && ${serverCommand}`;
}

export function getSandboxServerBackgroundStartCommand(sandboxId: string): string {
  const runtime = getSandboxAgentRuntime();
  if (runtime === "agentsdk") {
    return `export SANDBOX_ID=${sandboxId} && cd /app && nohup sandbox-agent server --no-token --host 0.0.0.0 --port ${SANDBOX_AGENT_PORT} >/tmp/opencode.log 2>&1 &`;
  }

  return `export SANDBOX_ID=${sandboxId} && cd /app && nohup opencode serve --port ${OPENCODE_PORT} --hostname 0.0.0.0 >/tmp/opencode.log 2>&1 &`;
}

export function getSandboxServerPort(): number {
  return getSandboxAgentRuntime() === "agentsdk" ? SANDBOX_AGENT_PORT : OPENCODE_PORT;
}

export function getSandboxReadinessUrl(serverUrl: string): string {
  const runtime = getSandboxAgentRuntime();
  if (runtime === "agentsdk") {
    return joinUrlPath(serverUrl, "/v1/health");
  }
  // /health becomes ready earlier than /doc for OpenCode and reduces cold-start wait time.
  return joinUrlPath(serverUrl, "/health");
}

export function getOpencodeClientBaseUrl(serverUrl: string): string {
  const runtime = getSandboxAgentRuntime();
  if (runtime === "agentsdk") {
    return joinUrlPath(serverUrl, "/opencode");
  }
  return serverUrl;
}

export { createSandboxOpencodeClient };

export async function createSandboxRuntimeClient(options: {
  serverUrl: string;
  fetch?: typeof fetch;
}): Promise<OpencodeClient> {
  const sandboxAgentBaseUrl = options.serverUrl;
  const opencodeBaseUrl = getOpencodeClientBaseUrl(options.serverUrl);
  return createSandboxRuntimeClientByRuntime({
    runtime: getSandboxAgentRuntime(),
    options: {
      ...options,
      sandboxAgentBaseUrl,
      opencodeBaseUrl,
    },
  });
}

export async function createSandboxSessionBridge(options: {
  serverUrl: string;
  fetch?: typeof fetch;
}): Promise<SandboxSessionBridge> {
  const sandboxAgentBaseUrl = options.serverUrl;
  const opencodeBaseUrl = getOpencodeClientBaseUrl(options.serverUrl);
  return createSandboxSessionBridgeByRuntime({
    runtime: getSandboxAgentRuntime(),
    options: {
      ...options,
      sandboxAgentBaseUrl,
      opencodeBaseUrl,
    },
  });
}

export type { SandboxSessionBridge };
