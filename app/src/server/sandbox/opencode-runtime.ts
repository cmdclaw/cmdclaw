import type { OpencodeClient } from "@opencode-ai/sdk/v2/client";
import { env } from "@/env";
import type { SandboxAgentRuntime, SandboxSessionBridge } from "./runtime/types";
import {
  createSandboxRuntimeClientByRuntime,
  createSandboxSessionBridgeByRuntime,
} from "./runtime/factory";
import { createSandboxOpencodeClient } from "./runtime/runtime-client/opencode";

export const OPENCODE_PORT = 4096;

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
      ? `sandbox-agent server --no-token --host 0.0.0.0 --port ${OPENCODE_PORT}`
      : `opencode serve --port ${OPENCODE_PORT} --hostname 0.0.0.0`;
  return `export SANDBOX_ID=${sandboxId} && cd /app && ${serverCommand}`;
}

export function getSandboxServerBackgroundStartCommand(sandboxId: string): string {
  const runtime = getSandboxAgentRuntime();
  if (runtime === "agentsdk") {
    return `export SANDBOX_ID=${sandboxId} && cd /app && nohup sandbox-agent server --no-token --host 0.0.0.0 --port ${OPENCODE_PORT} >/tmp/opencode.log 2>&1 &`;
  }

  return `export SANDBOX_ID=${sandboxId} && cd /app && nohup opencode serve --port ${OPENCODE_PORT} --hostname 0.0.0.0 >/tmp/opencode.log 2>&1 &`;
}

export function getSandboxReadinessUrl(serverUrl: string): string {
  const runtime = getSandboxAgentRuntime();
  if (runtime === "agentsdk") {
    return joinUrlPath(serverUrl, "/v1/health");
  }
  return joinUrlPath(serverUrl, "/doc");
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
  return createSandboxRuntimeClientByRuntime({
    runtime: getSandboxAgentRuntime(),
    options: {
      ...options,
      opencodeBaseUrl: getOpencodeClientBaseUrl(options.serverUrl),
    },
  });
}

export async function createSandboxSessionBridge(options: {
  serverUrl: string;
  fetch?: typeof fetch;
}): Promise<SandboxSessionBridge> {
  return createSandboxSessionBridgeByRuntime({
    runtime: getSandboxAgentRuntime(),
    options: {
      ...options,
      opencodeBaseUrl: getOpencodeClientBaseUrl(options.serverUrl),
    },
  });
}

export type { SandboxSessionBridge };
