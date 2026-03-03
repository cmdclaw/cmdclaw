import { type Event as OpencodeEvent, type OpencodeClient } from "@opencode-ai/sdk/v2/client";
import { SandboxAgent } from "sandbox-agent";
import type { SandboxRuntimeAdapterOptions, SandboxRuntimeClientImplementation } from "../types";
import { createSandboxAgentSessionWithFallback } from "../agent-sdk/session-helpers";
import { createSandboxOpencodeClient } from "./opencode";

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

function resolveModelRef(model: unknown): { providerID: string; modelID: string } | null {
  if (!model || typeof model !== "object") {
    return null;
  }
  const parsed = model as Record<string, unknown>;
  const provider = parsed.providerID;
  const modelId = parsed.modelID;
  if (typeof provider === "string" && typeof modelId === "string") {
    return { providerID: provider, modelID: modelId };
  }
  return null;
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

function pickContentText(value: unknown): string | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const chunks = value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return "";
      }
      const part = item as Record<string, unknown>;
      if (typeof part.text === "string") {
        return part.text;
      }
      const inner = part.content;
      if (inner && typeof inner === "object") {
        const innerPart = inner as Record<string, unknown>;
        if (typeof innerPart.text === "string") {
          return innerPart.text;
        }
      }
      return "";
    })
    .filter(Boolean);
  return chunks.length > 0 ? chunks.join("") : null;
}

function extractPromptResponseText(response: unknown): string | null {
  if (!response || typeof response !== "object") {
    return null;
  }
  const record = response as Record<string, unknown>;

  if (typeof record.text === "string" && record.text.trim()) {
    return record.text;
  }
  if (typeof record.output_text === "string" && record.output_text.trim()) {
    return record.output_text;
  }
  if (typeof record.message === "string" && record.message.trim()) {
    return record.message;
  }

  return pickContentText(record.content) ?? pickContentText(record.output) ?? null;
}

function extractAssistantTextFromSessionMessages(payload: unknown): string | null {
  if (!Array.isArray(payload)) {
    return null;
  }

  for (let i = payload.length - 1; i >= 0; i -= 1) {
    const item = payload[i];
    if (!item || typeof item !== "object") {
      continue;
    }
    const info = (item as Record<string, unknown>).info as Record<string, unknown> | undefined;
    const role = info?.role;
    if (role !== "assistant") {
      continue;
    }

    const parts = (item as Record<string, unknown>).parts;
    if (!Array.isArray(parts)) {
      continue;
    }
    const text = parts
      .map((part) => {
        if (!part || typeof part !== "object") {
          return "";
        }
        const entry = part as Record<string, unknown>;
        if (entry.type === "text" && typeof entry.text === "string") {
          return entry.text;
        }
        return "";
      })
      .filter(Boolean)
      .join("");

    if (text.trim()) {
      return text;
    }
  }

  return null;
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
  const fallbackClient = createSandboxOpencodeClient({
    baseUrl: options.opencodeBaseUrl,
    fetch: options.fetch,
  });
  const bus = createAsyncEventBus();
  const sessionStates = new Map<string, SessionState>();
  const sessionHandles = new Map<string, Awaited<ReturnType<SandboxAgent["createSession"]>>>();
  const canonicalSessionIdByAlias = new Map<string, string>();
  const remoteSessionIdByCanonical = new Map<string, string>();
  const localSessionIdByCanonical = new Map<string, string>();
  const lastSeenEventIndexBySession = new Map<string, number>();
  const attachedSessionListeners = new Map<string, () => void>();
  let serverConnectedEmitted = false;

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
            method?: string;
            params?: {
              sessionId?: string;
              update?: Record<string, unknown>;
            };
          };
          if (payload?.method !== "session/update") {
            return;
          }
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
              Math.max(event.eventIndex, lastSeenEventIndexBySession.get(canonicalSessionId) ?? 0),
            );
          }
        })
      : sandboxAgent.onSessionEvent(localSessionId, (event) => {
          const payload = event.payload as {
            method?: string;
            params?: {
              sessionId?: string;
              update?: Record<string, unknown>;
            };
          };
          if (payload?.method !== "session/update") {
            return;
          }
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
              Math.max(event.eventIndex, lastSeenEventIndexBySession.get(canonicalSessionId) ?? 0),
            );
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
        system,
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

          // If no streamed updates were observed, synthesize a final text update when possible.
          if (!foundAgentUpdates && !noReply) {
            console.info(
              `[SandboxRuntime] No assistant updates detected for session=${canonicalSessionId}`,
            );
            const fallbackSessionId =
              remoteSessionIdByCanonical.get(canonicalSessionId) ?? canonicalSessionId;
            const modelRef = resolveModelRef(model);
            const shouldPassFallbackModel =
              modelRef && !`${modelRef.providerID}/${modelRef.modelID}`.startsWith("openai/");
            try {
              await (
                fallbackClient.session.prompt as (
                  input: Record<string, unknown>,
                ) => Promise<unknown>
              )({
                sessionID: fallbackSessionId,
                parts,
                ...(system ? { system } : {}),
                ...(shouldPassFallbackModel ? { model: modelRef } : {}),
              });
            } catch (error) {
              console.warn(
                `[SandboxRuntime] Fallback /opencode prompt failed session=${canonicalSessionId} remote=${fallbackSessionId}: ${String(error)}`,
              );
            }

            let fallbackText = extractPromptResponseText(response);
            if (!fallbackText) {
              try {
                const messagesResult = await fallbackClient.session.messages({
                  sessionID: fallbackSessionId,
                  limit: 20,
                });
                if (!messagesResult.error) {
                  const count = Array.isArray(messagesResult.data) ? messagesResult.data.length : 0;
                  console.info(
                    `[SandboxRuntime] Fallback messages fetched session=${canonicalSessionId} remote=${fallbackSessionId} count=${count}`,
                  );
                  fallbackText = extractAssistantTextFromSessionMessages(messagesResult.data);
                } else {
                  console.warn(
                    `[SandboxRuntime] Fallback /opencode messages returned error session=${canonicalSessionId} remote=${fallbackSessionId}: ${JSON.stringify(messagesResult.error)}`,
                  );
                }
              } catch (error) {
                console.warn(
                  `[SandboxRuntime] Fallback /opencode messages failed session=${canonicalSessionId} remote=${fallbackSessionId}: ${String(error)}`,
                );
              }
            }
            if (fallbackText) {
              console.info(
                `[SandboxRuntime] Emitting synthetic assistant text session=${canonicalSessionId} chars=${fallbackText.length}`,
              );
              const state = ensureSessionState(canonicalSessionId);
              emitAssistantMessageHeader(canonicalSessionId, state);
              state.text = fallbackText;
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
            }
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
    auth: fallbackClient.auth,
    permission: fallbackClient.permission,
    question: fallbackClient.question,
  } as unknown as OpencodeClient;

  return runtimeClient;
}
export const sandboxAgentRuntimeClientImplementation: SandboxRuntimeClientImplementation = {
  createRuntimeClient: async (options) => {
    console.info("[SandboxRuntime] Using sandbox-agent runtime client");
    return createSandboxAgentRuntimeClient(options);
  },
};
