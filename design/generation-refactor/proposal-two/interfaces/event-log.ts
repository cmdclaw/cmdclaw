import type { GenerationEvent } from "./types";

/**
 * Owns product event publication and recovery.
 *
 * This module hides Redis stream envelopes, cursor replay, DB fallback,
 * duplicate subscription counters, terminal recovery events, and coworker run
 * event mirroring.
 */
export interface GenerationEventLog {
  publish(input: PublishGenerationEventInput): Promise<PublishedGenerationEvent>;
  publishTerminal(input: PublishTerminalGenerationEventInput): Promise<PublishedGenerationEvent>;
  subscribe(input: SubscribeGenerationEventsInput): AsyncIterable<GenerationStreamEnvelope>;
  replay(input: ReplayGenerationEventsInput): AsyncIterable<GenerationStreamEnvelope>;
  getCounters(): GenerationStreamCounters;
}

export type PublishGenerationEventInput = {
  generationId: string;
  conversationId: string;
  coworkerRunId?: string | null;
  event: GenerationEvent;
};

export type PublishTerminalGenerationEventInput = PublishGenerationEventInput & {
  status: "completed" | "cancelled" | "error";
};

export type PublishedGenerationEvent = {
  generationId: string;
  conversationId: string;
  sequence: number;
  cursor?: string;
};

export type SubscribeGenerationEventsInput = {
  generationId: string;
  userId: string;
  cursor?: string;
  maxWaitMs?: number;
};

export type ReplayGenerationEventsInput = {
  generationId: string;
  userId: string;
  cursor?: string;
};

export type GenerationStreamEnvelope = {
  generationId: string;
  conversationId: string;
  sequence: number;
  cursor?: string;
  event: GenerationEvent;
  createdAtMs: number;
};

export type GenerationStreamCounters = {
  opened: number;
  closed: number;
  timedOut: number;
  deduped: number;
  active: number;
};

