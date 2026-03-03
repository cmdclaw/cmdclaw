import type { OpencodeClient } from "@opencode-ai/sdk/v2/client";

export type SandboxAgentRuntime = "opencode" | "agentsdk";

export interface SandboxSessionBridge {
  hasSession(sessionId: string): Promise<boolean>;
  createSession(input: { title?: string }): Promise<string>;
}

export interface SandboxRuntimeAdapterOptions {
  serverUrl: string;
  opencodeBaseUrl: string;
  fetch?: typeof fetch;
}

export interface SandboxRuntimeClientImplementation {
  createRuntimeClient(options: SandboxRuntimeAdapterOptions): Promise<OpencodeClient>;
}

export interface SandboxSessionBridgeImplementation {
  createSessionBridge(options: SandboxRuntimeAdapterOptions): Promise<SandboxSessionBridge>;
}
