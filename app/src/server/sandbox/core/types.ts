export type SandboxProviderId = "e2b" | "daytona" | "byoc";

export type RuntimeHarnessId = "opencode" | "agent-sdk";

export type RuntimeProtocolVersion = "opencode-v2" | "sandbox-agent-v1";

export interface RuntimeSelection {
  sandboxProvider: SandboxProviderId;
  runtimeHarness: RuntimeHarnessId;
  runtimeProtocolVersion: RuntimeProtocolVersion;
}

export interface SandboxExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface SandboxHandle {
  provider: SandboxProviderId;
  sandboxId: string;
  exec(
    command: string,
    opts?: {
      timeoutMs?: number;
      env?: Record<string, string>;
      background?: boolean;
      onStderr?: (chunk: string) => void;
    },
  ): Promise<SandboxExecResult>;
  writeFile(path: string, content: string | ArrayBuffer): Promise<void>;
  readFile(path: string): Promise<string>;
  ensureDir(path: string): Promise<void>;
}

export type RuntimePromptPart =
  | { type: "text"; text: string }
  | { type: "file"; filename?: string; mime: string; url: string };

export type RuntimeToolState =
  | { status: "pending" }
  | { status: "running"; input?: Record<string, unknown> }
  | { status: "completed"; input?: Record<string, unknown>; output?: unknown }
  | { status: "error"; input?: Record<string, unknown>; error?: unknown };

export type RuntimePart =
  | {
      type: "text";
      id: string;
      messageID?: string;
      text: string;
    }
  | {
      type: "reasoning";
      id: string;
      messageID?: string;
      text: string;
    }
  | {
      type: "tool";
      id: string;
      messageID?: string;
      callID: string;
      tool: string;
      state: RuntimeToolState;
    };

export type RuntimePermissionRequest = {
  id: string;
  permission?: string;
  patterns?: string[];
};

export type RuntimeQuestionRequest = {
  id: string;
  question: string;
  options?: Array<{
    label: string;
    value: string;
  }>;
  allowMultiple?: boolean;
};

export type RuntimeEvent =
  | { type: "server.connected"; properties: Record<string, unknown> }
  | { type: "session.idle"; properties: Record<string, unknown> }
  | { type: "session.status"; properties: { status?: string } & Record<string, unknown> }
  | { type: "session.error"; properties: { error?: unknown } & Record<string, unknown> }
  | {
      type: "session.updated";
      properties: { info: { id: string } & Record<string, unknown> } & Record<string, unknown>;
    }
  | {
      type: "message.updated";
      properties: {
        info: {
          id?: string;
          role?: string;
        };
      } & Record<string, unknown>;
    }
  | {
      type: "message.part.updated";
      properties: {
        part: RuntimePart;
      };
    }
  | {
      type: "permission.asked";
      properties: RuntimePermissionRequest;
    }
  | {
      type: "question.asked";
      properties: RuntimeQuestionRequest;
    };

export interface RuntimeHarnessClient {
  subscribe(
    params?: Record<string, unknown>,
    options?: { signal?: AbortSignal },
  ): Promise<{ stream: AsyncIterable<RuntimeEvent> }>;
  prompt(input: {
    sessionID: string;
    parts: RuntimePromptPart[];
    system?: string;
    model?: unknown;
    noReply?: boolean;
  }): Promise<{ data: unknown; error: unknown }>;
  abort(input: { sessionID: string }): Promise<{ data: unknown; error: unknown }>;
  messages(input: {
    sessionID: string;
    limit?: number;
  }): Promise<{ data: unknown; error: unknown }>;
  getSession(input: { sessionID: string }): Promise<{ data: unknown; error: unknown }>;
  createSession(input: {
    title?: string;
  }): Promise<{ data: { id: string; title?: string } | null; error: unknown }>;
  replyPermission(input: { requestID: string; reply: "always" | "reject" }): Promise<void>;
  replyQuestion(input: { requestID: string; answers: string[][] }): Promise<void>;
  rejectQuestion(input: { requestID: string }): Promise<void>;
}

export type SessionInitStage =
  | "sandbox_checking_cache"
  | "sandbox_reused"
  | "sandbox_creating"
  | "sandbox_created"
  | "opencode_starting"
  | "opencode_waiting_ready"
  | "opencode_ready"
  | "session_reused"
  | "session_creating"
  | "session_created"
  | "session_replay_started"
  | "session_replay_completed"
  | "session_init_completed";

export type SessionLifecycleCallback = (
  stage: SessionInitStage,
  details?: Record<string, unknown>,
) => void;

export interface ConversationRuntimeContext {
  conversationId: string;
  generationId?: string;
  userId?: string;
  anthropicApiKey: string;
  integrationEnvs?: Record<string, string>;
}

export interface ConversationRuntimeOptions {
  title?: string;
  replayHistory?: boolean;
  onLifecycle?: SessionLifecycleCallback;
  telemetry?: Record<string, unknown>;
}

export interface ConversationRuntimeSession {
  id: string;
}

export interface ConversationRuntimeResult {
  sandbox: SandboxHandle;
  harnessClient: RuntimeHarnessClient;
  session: ConversationRuntimeSession;
  metadata: RuntimeSelection;
}
