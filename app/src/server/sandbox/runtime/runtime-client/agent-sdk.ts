import { type Event as OpencodeEvent, type OpencodeClient } from "@opencode-ai/sdk/v2/client";
import { SandboxAgent } from "sandbox-agent";
import type { SandboxRuntimeAdapterOptions, SandboxRuntimeClientImplementation } from "../types";
import { createSandboxAgentSessionWithFallback } from "../agent-sdk/session-helpers";

const SANDBOX_AGENT_PROMPT_TIMEOUT_MS = 180_000;

type OpenCodePromptPart = {
  type: "text" | "file";
  text?: string;
  filename?: string;
  mime?: string;
  url?: string;
};

type SessionState = {
  assistantMessageId: string;
  emittedMessageHeader: boolean;
  textPartId: string;
  reasoningPartId: string;
  text: string;
  reasoning: string;
};

type SessionUpdatePayload = {
  sessionUpdate?: string;
  content?: { text?: string; type?: string };
  toolCallId?: string;
  title?: string;
  status?: string;
  rawInput?: unknown;
  rawOutput?: unknown;
};

type PermissionOptionPayload = {
  optionId?: string;
  kind?: string;
  name?: string;
};

type SessionPermissionRequestPayload = {
  sessionId?: string;
  toolCall?: {
    toolCallId?: string;
    title?: string;
    rawInput?: Record<string, unknown>;
  };
  options?: PermissionOptionPayload[];
};

function extractSessionUpdatePayload(payload: unknown): SessionUpdatePayload | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const parsed = payload as Record<string, unknown>;
  const params = parsed.params;
  if (params && typeof params === "object") {
    const paramsRecord = params as Record<string, unknown>;
    const nestedUpdate = paramsRecord.update;
    if (nestedUpdate && typeof nestedUpdate === "object") {
      return nestedUpdate as SessionUpdatePayload;
    }
    if (typeof paramsRecord.sessionUpdate === "string") {
      return paramsRecord as unknown as SessionUpdatePayload;
    }
  }
  const directUpdate = parsed.update;
  if (directUpdate && typeof directUpdate === "object") {
    return directUpdate as SessionUpdatePayload;
  }
  if (typeof parsed.sessionUpdate === "string") {
    return parsed as unknown as SessionUpdatePayload;
  }
  return undefined;
}

function extractPermissionRequestPayload(
  payload: unknown,
): SessionPermissionRequestPayload | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const parsed = payload as Record<string, unknown>;
  const params = parsed.params;
  if (!params || typeof params !== "object") {
    return undefined;
  }
  return params as SessionPermissionRequestPayload;
}

function resolveModelId(model: unknown): string | null {
  if (!model || typeof model !== "object") {
    return null;
  }
  const parsed = model as Record<string, unknown>;
  const provider = parsed.providerID;
  const modelId = parsed.modelID;
  if (typeof provider === "string" && typeof modelId === "string") {
    return `${provider}/${modelId}`;
  }
  if (typeof modelId === "string") {
    return modelId;
  }
  return null;
}

function selectPermissionOptionId(input: {
  reply: "always" | "reject";
  optionIds: string[];
}): string | null {
  const normalized = new Set(input.optionIds.map((option) => option.toLowerCase()));
  if (input.reply === "always") {
    if (normalized.has("allow_always")) {
      return "allow_always";
    }
    if (normalized.has("allow")) {
      return "allow";
    }
    if (normalized.has("allow_once")) {
      return "allow_once";
    }
    return null;
  }
  if (normalized.has("reject")) {
    return "reject";
  }
  if (normalized.has("reject_once")) {
    return "reject_once";
  }
  if (normalized.has("reject_always")) {
    return "reject_always";
  }
  return null;
}

function toPermissionRequestId(sessionId: string, requestId: number | string): string {
  return `perm:${sessionId}:${String(requestId)}`;
}

function isAssistantFacingUpdate(update: SessionUpdatePayload | undefined): boolean {
  const kind = update?.sessionUpdate;
  return (
    kind === "agent_message_chunk" ||
    kind === "agent_thought_chunk" ||
    kind === "tool_call" ||
    kind === "tool_call_update"
  );
}

function createAsyncEventBus() {
  const subscribers = new Set<{
    signal?: AbortSignal;
    push: (event: OpencodeEvent) => void;
    close: () => void;
  }>();

  const emit = (event: OpencodeEvent) => {
    for (const sub of subscribers) {
      if (sub.signal?.aborted) {
        sub.close();
        subscribers.delete(sub);
        continue;
      }
      sub.push(event);
    }
  };

  const subscribe = (signal?: AbortSignal) => {
    const queue: OpencodeEvent[] = [];
    let resolver:
      | ((
          value:
            | IteratorResult<OpencodeEvent, undefined>
            | PromiseLike<IteratorResult<OpencodeEvent, undefined>>,
        ) => void)
      | undefined;
    let closed = false;

    const push = (event: OpencodeEvent) => {
      if (closed) {
        return;
      }
      if (resolver) {
        const nextResolve = resolver;
        resolver = undefined;
        nextResolve({ done: false, value: event });
        return;
      }
      queue.push(event);
    };

    const close = () => {
      if (closed) {
        return;
      }
      closed = true;
      if (resolver) {
        const nextResolve = resolver;
        resolver = undefined;
        nextResolve({ done: true, value: undefined });
      }
    };

    if (signal) {
      signal.addEventListener("abort", close, { once: true });
    }

    const iterator: AsyncIterable<OpencodeEvent> = {
      [Symbol.asyncIterator]() {
        return {
          next() {
            if (queue.length > 0) {
              const event = queue.shift();
              return Promise.resolve({ done: false, value: event! });
            }
            if (closed || signal?.aborted) {
              return Promise.resolve({ done: true, value: undefined });
            }
            return new Promise<IteratorResult<OpencodeEvent, undefined>>((resolve) => {
              resolver = resolve;
            });
          },
        };
      },
    };

    subscribers.add({ signal, push, close });
    return iterator;
  };

  return { emit, subscribe };
}

function normalizeToolStateStatus(status: string): "pending" | "running" | "completed" | "error" {
  if (status === "completed") {
    return "completed";
  }
  if (status === "error" || status === "failed") {
    return "error";
  }
  if (status === "in_progress" || status === "running") {
    return "running";
  }
  return "pending";
}

function toPromptText(parts: OpenCodePromptPart[]): string {
  return parts
    .map((part) => {
      if (part.type === "text") {
        return part.text ?? "";
      }
      return `[Attached file: ${part.filename ?? "file"}${part.mime ? ` (${part.mime})` : ""}]`;
    })
    .filter(Boolean)
    .join("\n\n");
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function createSandboxAgentRuntimeClient(
  options: SandboxRuntimeAdapterOptions,
): Promise<OpencodeClient> {
  const sandboxAgent = await SandboxAgent.connect({
    baseUrl: options.serverUrl,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  const bus = createAsyncEventBus();
  const sessionStates = new Map<string, SessionState>();
  const sessionHandles = new Map<string, Awaited<ReturnType<SandboxAgent["createSession"]>>>();
  const canonicalSessionIdByAlias = new Map<string, string>();
  const remoteSessionIdByCanonical = new Map<string, string>();
  const localSessionIdByCanonical = new Map<string, string>();
  const lastSeenEventIndexBySession = new Map<string, number>();
  const attachedSessionListeners = new Map<string, () => void>();
  const pendingPermissionRequests = new Map<
    string,
    {
      agent: string;
      requestId: number | string;
      optionIds: string[];
    }
  >();
  const acpServerIdByAgent = new Map<string, string>();
  let serverConnectedEmitted = false;
  const fetcher = options.fetch ?? fetch;

  async function postAcpResult(input: {
    agent: string;
    serverId: string;
    requestId: number | string;
    result: Record<string, unknown>;
  }): Promise<void> {
    const url = new URL(
      `${options.serverUrl.replace(/\/+$/, "")}/v1/acp/${encodeURIComponent(input.serverId)}`,
    );
    url.searchParams.set("agent", input.agent);
    console.info(
      `[SandboxRuntime] Posting ACP response serverId=${input.serverId} agent=${input.agent} requestId=${String(input.requestId)} url=${url.toString()}`,
    );
    const response = await fetcher(url.toString(), {
      method: "POST",
      headers: new Headers({ "content-type": "application/json" }),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: input.requestId,
        result: input.result,
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Failed posting ACP response status=${response.status} serverId=${input.serverId} body=${body.slice(0, 300)}`,
      );
    }
  }

  async function resolveAcpServerId(agent: string): Promise<string> {
    const cached = acpServerIdByAgent.get(agent);
    if (cached) {
      return cached;
    }
    const listed = await sandboxAgent.listAcpServers();
    const matched = listed.servers.find((server) => server.agent === agent);
    if (!matched) {
      throw new Error(`No ACP server found for agent=${agent}`);
    }
    acpServerIdByAgent.set(agent, matched.serverId);
    return matched.serverId;
  }

  const resolveCanonicalSessionId = (sessionId: string): string =>
    canonicalSessionIdByAlias.get(sessionId) ?? sessionId;

  const rememberSessionAliases = (canonicalSessionId: string, aliases: string[]) => {
    for (const alias of aliases) {
      if (!alias) {
        continue;
      }
      canonicalSessionIdByAlias.set(alias, canonicalSessionId);
    }
  };

  const ensureSessionState = (sessionId: string): SessionState => {
    const existing = sessionStates.get(sessionId);
    if (existing) {
      return existing;
    }
    const created: SessionState = {
      assistantMessageId: `assistant-${sessionId}`,
      emittedMessageHeader: false,
      textPartId: `text-${sessionId}`,
      reasoningPartId: `reasoning-${sessionId}`,
      text: "",
      reasoning: "",
    };
    sessionStates.set(sessionId, created);
    return created;
  };

  const emitAssistantMessageHeader = (sessionId: string, state: SessionState) => {
    if (state.emittedMessageHeader) {
      return;
    }
    state.emittedMessageHeader = true;
    bus.emit({
      type: "message.updated",
      properties: {
        info: {
          id: state.assistantMessageId,
          role: "assistant",
        },
      },
    } as OpencodeEvent);
  };

  const applySessionUpdate = (sessionId: string, update: SessionUpdatePayload | undefined) => {
    if (!update) {
      return;
    }

    const state = ensureSessionState(sessionId);

    if (update.sessionUpdate === "agent_message_chunk") {
      emitAssistantMessageHeader(sessionId, state);
      const chunk = update.content?.text ?? "";
      if (!chunk) {
        return;
      }
      state.text += chunk;
      bus.emit({
        type: "message.part.updated",
        properties: {
          part: {
            type: "text",
            id: state.textPartId,
            messageID: state.assistantMessageId,
            text: state.text,
          },
        },
      } as OpencodeEvent);
      return;
    }

    if (update.sessionUpdate === "agent_thought_chunk") {
      emitAssistantMessageHeader(sessionId, state);
      const chunk = update.content?.text ?? "";
      state.reasoning += chunk;
      bus.emit({
        type: "message.part.updated",
        properties: {
          part: {
            type: "reasoning",
            id: state.reasoningPartId,
            messageID: state.assistantMessageId,
            text: state.reasoning,
          },
        },
      } as OpencodeEvent);
      return;
    }

    if (update.sessionUpdate === "tool_call" || update.sessionUpdate === "tool_call_update") {
      emitAssistantMessageHeader(sessionId, state);
      const toolCallId = update.toolCallId ?? `tool-${Date.now()}`;
      const toolName = update.title || "tool";
      const status = normalizeToolStateStatus(update.status ?? "pending");
      const rawInput =
        update.rawInput && typeof update.rawInput === "object"
          ? (update.rawInput as Record<string, unknown>)
          : {};
      const toolState =
        status === "pending"
          ? { status: "pending" as const }
          : status === "running"
            ? { status: "running" as const, input: rawInput }
            : status === "completed"
              ? {
                  status: "completed" as const,
                  input: rawInput,
                  output:
                    update.rawOutput && typeof update.rawOutput === "object"
                      ? (update.rawOutput as Record<string, unknown>)
                      : update.rawOutput,
                }
              : {
                  status: "error" as const,
                  input: rawInput,
                  error:
                    update.rawOutput && typeof update.rawOutput === "object"
                      ? (update.rawOutput as Record<string, unknown>)
                      : update.rawOutput,
                };

      bus.emit({
        type: "message.part.updated",
        properties: {
          part: {
            type: "tool",
            id: `tool-part-${toolCallId}`,
            messageID: state.assistantMessageId,
            callID: toolCallId,
            tool: toolName,
            state: toolState,
          },
        },
      } as OpencodeEvent);
    }
  };

  const applyPermissionRequest = (input: {
    agent: string;
    canonicalSessionId: string;
    requestId: number | string;
    payload: SessionPermissionRequestPayload | undefined;
  }) => {
    if (!input.payload) {
      return;
    }
    const requestId = toPermissionRequestId(input.canonicalSessionId, input.requestId);
    const optionIds = Array.isArray(input.payload.options)
      ? input.payload.options
          .map((option) => (typeof option.optionId === "string" ? option.optionId : ""))
          .filter(Boolean)
      : [];
    pendingPermissionRequests.set(requestId, {
      agent: input.agent,
      requestId: input.requestId,
      optionIds,
    });

    const rawInput = input.payload.toolCall?.rawInput;
    const command = rawInput && typeof rawInput.command === "string" ? rawInput.command : undefined;
    bus.emit({
      type: "permission.asked",
      properties: {
        id: requestId,
        permission: input.payload.toolCall?.title || "tool_call",
        ...(command ? { patterns: [command] } : {}),
      },
    } as OpencodeEvent);
  };

  const ensureSessionListener = (sessionId: string) => {
    const canonicalSessionId = resolveCanonicalSessionId(sessionId);
    const localSessionId = localSessionIdByCanonical.get(canonicalSessionId) ?? canonicalSessionId;
    if (attachedSessionListeners.has(canonicalSessionId)) {
      return;
    }
    const existingHandle = sessionHandles.get(canonicalSessionId);
    const unsubscribe = existingHandle
      ? existingHandle.onEvent((event) => {
          const payload = event.payload as {
            id?: number | string;
            method?: string;
            params?: unknown;
          };
          if (payload?.method === "session/update") {
            const update = extractSessionUpdatePayload(payload);
            if (!update) {
              console.warn(
                `[SandboxRuntime] session/update missing payload canonical=${canonicalSessionId}`,
              );
              return;
            }
            applySessionUpdate(canonicalSessionId, update);
            if (typeof event.eventIndex === "number") {
              lastSeenEventIndexBySession.set(
                canonicalSessionId,
                Math.max(
                  event.eventIndex,
                  lastSeenEventIndexBySession.get(canonicalSessionId) ?? 0,
                ),
              );
            }
            return;
          }
          if (payload?.method === "session/request_permission") {
            if (typeof payload.id !== "number" && typeof payload.id !== "string") {
              return;
            }
            applyPermissionRequest({
              agent: existingHandle.agent,
              canonicalSessionId,
              requestId: payload.id,
              payload: extractPermissionRequestPayload(payload),
            });
            if (typeof event.eventIndex === "number") {
              lastSeenEventIndexBySession.set(
                canonicalSessionId,
                Math.max(
                  event.eventIndex,
                  lastSeenEventIndexBySession.get(canonicalSessionId) ?? 0,
                ),
              );
            }
            return;
          }
        })
      : sandboxAgent.onSessionEvent(localSessionId, (event) => {
          const payload = event.payload as {
            id?: number | string;
            method?: string;
            params?: unknown;
          };
          if (payload?.method === "session/update") {
            const update = extractSessionUpdatePayload(payload);
            if (!update) {
              console.warn(
                `[SandboxRuntime] onSessionEvent session/update missing payload canonical=${canonicalSessionId} local=${localSessionId}`,
              );
              return;
            }
            applySessionUpdate(canonicalSessionId, update);
            if (typeof event.eventIndex === "number") {
              lastSeenEventIndexBySession.set(
                canonicalSessionId,
                Math.max(
                  event.eventIndex,
                  lastSeenEventIndexBySession.get(canonicalSessionId) ?? 0,
                ),
              );
            }
            return;
          }
          if (payload?.method === "session/request_permission") {
            if (typeof payload.id !== "number" && typeof payload.id !== "string") {
              return;
            }
            const knownHandle = sessionHandles.get(canonicalSessionId);
            if (!knownHandle) {
              return;
            }
            applyPermissionRequest({
              agent: knownHandle.agent,
              canonicalSessionId,
              requestId: payload.id,
              payload: extractPermissionRequestPayload(payload),
            });
            if (typeof event.eventIndex === "number") {
              lastSeenEventIndexBySession.set(
                canonicalSessionId,
                Math.max(
                  event.eventIndex,
                  lastSeenEventIndexBySession.get(canonicalSessionId) ?? 0,
                ),
              );
            }
            return;
          }
        });
    attachedSessionListeners.set(canonicalSessionId, unsubscribe);
    console.info(
      `[SandboxRuntime] Listener attached canonical=${canonicalSessionId} local=${localSessionId}`,
    );
  };

  const runtimeClient = {
    event: {
      subscribe: async (
        _params?: Record<string, unknown>,
        optionsArg?: { signal?: AbortSignal },
      ) => ({
        stream: bus.subscribe(optionsArg?.signal),
      }),
    },
    session: {
      get: async ({ sessionID }: { sessionID: string }) => {
        const canonicalSessionId = resolveCanonicalSessionId(sessionID);
        const found = await sandboxAgent.getSession(canonicalSessionId);
        if (!found) {
          return {
            data: null,
            error: { message: "Session not found", code: "session_not_found" },
          };
        }
        const resolvedCanonical = found.agentSessionId || found.id || canonicalSessionId;
        rememberSessionAliases(resolvedCanonical, [
          sessionID,
          canonicalSessionId,
          found.id,
          found.agentSessionId,
        ]);
        localSessionIdByCanonical.set(resolvedCanonical, found.id);
        if (found.agentSessionId) {
          remoteSessionIdByCanonical.set(resolvedCanonical, found.agentSessionId);
        }
        return {
          data: {
            id: resolvedCanonical,
            title: `session-${resolvedCanonical}`,
          },
          error: null,
        };
      },
      create: async ({ title }: { title?: string }) => {
        const localSessionId = `local-${crypto.randomUUID()}`;
        const created = await createSandboxAgentSessionWithFallback({
          client: sandboxAgent,
          id: localSessionId,
          sessionInit: {
            cwd: "/app",
            mcpServers: [],
          },
        });
        const canonicalSessionId = created.agentSessionId || created.id;
        rememberSessionAliases(canonicalSessionId, [created.id, created.agentSessionId]);
        localSessionIdByCanonical.set(canonicalSessionId, created.id);
        sessionHandles.set(canonicalSessionId, created);
        sessionHandles.set(created.id, created);
        if (created.agentSessionId) {
          remoteSessionIdByCanonical.set(canonicalSessionId, created.agentSessionId);
        }
        ensureSessionListener(canonicalSessionId);
        console.info(
          `[SandboxRuntime] Created session canonical=${canonicalSessionId} local=${created.id} remote=${created.agentSessionId ?? "n/a"}`,
        );
        bus.emit({
          type: "session.updated",
          properties: {
            info: {
              id: canonicalSessionId,
            },
          },
        } as OpencodeEvent);
        return {
          data: {
            id: canonicalSessionId,
            title: title || `session-${localSessionId}`,
          },
          error: null,
        };
      },
      abort: async ({ sessionID }: { sessionID: string }) => {
        const canonicalSessionId = resolveCanonicalSessionId(sessionID);
        const localSessionId =
          localSessionIdByCanonical.get(canonicalSessionId) ?? canonicalSessionId;
        await sandboxAgent.sendSessionMethod(localSessionId, "session/cancel", {});
        return { data: null, error: null };
      },
      prompt: async ({
        sessionID,
        parts,
        system: _system,
        model,
        noReply,
      }: {
        sessionID: string;
        parts: OpenCodePromptPart[];
        system?: string;
        noReply?: boolean;
        model?: unknown;
      }) => {
        const canonicalSessionId = resolveCanonicalSessionId(sessionID);
        const localSessionId =
          localSessionIdByCanonical.get(canonicalSessionId) ?? canonicalSessionId;
        ensureSessionListener(canonicalSessionId);
        if (!serverConnectedEmitted) {
          serverConnectedEmitted = true;
          bus.emit({ type: "server.connected", properties: {} } as OpencodeEvent);
        }
        const promptText = toPromptText(parts);
        const composedPrompt = noReply
          ? `${promptText}\n\nDo not provide a reply.`
          : [promptText].filter(Boolean).join("\n\n");
        console.info(
          `[SandboxRuntime] Prompting session=${canonicalSessionId} noReply=${Boolean(noReply)} chars=${composedPrompt.length}`,
        );
        try {
          let handle = sessionHandles.get(canonicalSessionId);
          if (!handle) {
            const existing = await sandboxAgent.getSession(canonicalSessionId);
            if (!existing) {
              throw new Error(`Session not found: ${canonicalSessionId}`);
            }
            handle = existing;
            const resolvedCanonical = existing.agentSessionId || existing.id || canonicalSessionId;
            rememberSessionAliases(resolvedCanonical, [
              sessionID,
              canonicalSessionId,
              existing.id,
              existing.agentSessionId,
            ]);
            localSessionIdByCanonical.set(resolvedCanonical, existing.id);
            sessionHandles.set(resolvedCanonical, handle);
            if (existing.agentSessionId) {
              remoteSessionIdByCanonical.set(resolvedCanonical, existing.agentSessionId);
            }
            ensureSessionListener(resolvedCanonical);
          }
          const handleAgentId =
            typeof (handle as { agent?: unknown }).agent === "string"
              ? ((handle as { agent: string }).agent as string)
              : "";
          const requestedModelId = resolveModelId(model);
          if (
            requestedModelId &&
            handleAgentId === "opencode" &&
            !requestedModelId.startsWith("openai/")
          ) {
            try {
              await handle.send("session/set_model", { modelId: requestedModelId });
            } catch (error) {
              console.warn(
                `[SandboxRuntime] Failed to set model session=${canonicalSessionId} model=${requestedModelId}: ${String(error)}`,
              );
            }
          }
          const promptCall = noReply
            ? handle.send(
                "session/prompt",
                { prompt: [{ type: "text", text: composedPrompt }] },
                { notification: true },
              )
            : handle.prompt([{ type: "text", text: composedPrompt }]);
          const response = await withTimeout(
            promptCall,
            SANDBOX_AGENT_PROMPT_TIMEOUT_MS,
            `Sandbox agent prompt timed out after ${Math.round(SANDBOX_AGENT_PROMPT_TIMEOUT_MS / 1000)}s`,
          );
          // Drain newly persisted SDK events before signaling idle.
          const startedDrainAt = Date.now();
          const drainUntilMs = startedDrainAt + 1200;
          let foundAgentUpdates = false;
          let updateEventsSeen = 0;
          let assistantUpdatesSeen = 0;
          let cursor: string | undefined;
          const initialLastSeen = lastSeenEventIndexBySession.get(canonicalSessionId) ?? 0;

          do {
            // eslint-disable-next-line no-await-in-loop -- intentional event-page drain
            const page = await sandboxAgent.getEvents({
              sessionId: localSessionId,
              limit: 500,
              ...(cursor ? { cursor } : {}),
            });
            for (const event of page.items) {
              if (event.eventIndex <= initialLastSeen) {
                continue;
              }
              const payload = event.payload as {
                method?: string;
                params?: unknown;
              };
              if (payload.method === "session/update") {
                updateEventsSeen += 1;
                const update = extractSessionUpdatePayload(payload);
                if (!update) {
                  continue;
                }
                if (isAssistantFacingUpdate(update)) {
                  assistantUpdatesSeen += 1;
                  foundAgentUpdates = true;
                }
                applySessionUpdate(canonicalSessionId, update);
              } else if (payload.method === "session/request_permission") {
                const requestId = (event.payload as { id?: unknown }).id;
                if (typeof requestId === "number" || typeof requestId === "string") {
                  applyPermissionRequest({
                    agent: handle.agent,
                    canonicalSessionId,
                    requestId,
                    payload: extractPermissionRequestPayload(event.payload),
                  });
                }
              }
              lastSeenEventIndexBySession.set(
                canonicalSessionId,
                Math.max(
                  event.eventIndex,
                  lastSeenEventIndexBySession.get(canonicalSessionId) ?? 0,
                ),
              );
            }
            cursor = page.nextCursor;
          } while (cursor);
          console.info(
            `[SandboxRuntime] Replay scan session=${canonicalSessionId} local=${localSessionId} updates=${updateEventsSeen} assistantUpdates=${assistantUpdatesSeen} found=${foundAgentUpdates}`,
          );

          if (!foundAgentUpdates && !noReply) {
            console.warn(
              `[SandboxRuntime] No assistant updates detected for session=${canonicalSessionId}; direct SDK response may have no stream-compatible updates.`,
            );
          }

          // Small grace window for delayed onSessionEvent callbacks.
          while (Date.now() < drainUntilMs) {
            // eslint-disable-next-line no-await-in-loop -- intentional grace polling
            await new Promise((resolve) => setTimeout(resolve, 120));
          }
          console.info(
            `[SandboxRuntime] Prompt completed session=${canonicalSessionId} hasResponse=${Boolean(response)}`,
          );
          if (!foundAgentUpdates && !noReply && response && typeof response === "object") {
            const responseRecord = response as Record<string, unknown>;
            const responseKeys = Object.keys(responseRecord).slice(0, 8).join(",");
            console.info(
              `[SandboxRuntime] No streamed updates; prompt response keys session=${canonicalSessionId} keys=${responseKeys}`,
            );
          }
          bus.emit({ type: "session.idle", properties: {} } as OpencodeEvent);
          return {
            data: noReply ? null : response,
            error: null,
          };
        } catch (error) {
          bus.emit({
            type: "session.error",
            properties: { error: { message: String(error) } },
          } as unknown as OpencodeEvent);
          throw error;
        }
      },
    },
    auth: {
      set: async (_input: Record<string, unknown>) => {
        console.warn("[SandboxRuntime] auth.set is not implemented for agentsdk runtime");
        return { data: null, error: null };
      },
    },
    permission: {
      reply: async (input: Record<string, unknown>) => {
        const requestID = typeof input.requestID === "string" ? input.requestID : null;
        const reply =
          input.reply === "always" || input.reply === "reject"
            ? (input.reply as "always" | "reject")
            : null;
        if (!requestID || !reply) {
          throw new Error("Invalid permission.reply payload for agentsdk runtime");
        }
        const pending = pendingPermissionRequests.get(requestID);
        if (!pending) {
          throw new Error(`Unknown permission request id: ${requestID}`);
        }
        const selectedOptionId = selectPermissionOptionId({
          reply,
          optionIds: pending.optionIds,
        });
        if (!selectedOptionId) {
          throw new Error(
            `No compatible permission option found for request=${requestID} reply=${reply} options=${pending.optionIds.join(",")}`,
          );
        }
        const serverId = await resolveAcpServerId(pending.agent);
        await postAcpResult({
          agent: pending.agent,
          serverId,
          requestId: pending.requestId,
          result: {
            outcome: {
              outcome: "selected",
              optionId: selectedOptionId,
            },
          },
        });
        pendingPermissionRequests.delete(requestID);
        return { data: null, error: null };
      },
    },
    question: {
      reply: async (_input: Record<string, unknown>) => {
        console.warn("[SandboxRuntime] question.reply is not implemented for agentsdk runtime");
        return { data: null, error: null };
      },
      reject: async (_input: Record<string, unknown>) => {
        console.warn("[SandboxRuntime] question.reject is not implemented for agentsdk runtime");
        return { data: null, error: null };
      },
    },
  } as unknown as OpencodeClient;

  return runtimeClient;
}
export const sandboxAgentRuntimeClientImplementation: SandboxRuntimeClientImplementation = {
  createRuntimeClient: async (options) => {
    console.info("[SandboxRuntime] Using sandbox-agent runtime client");
    return createSandboxAgentRuntimeClient(options);
  },
};
