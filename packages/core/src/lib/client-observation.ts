import { z } from "zod";

export const CLIENT_OBSERVATION_TYPES = [
  "generation.stream.opened",
  "generation.stream.closed",
  "generation.stream.error",
  "generation.stream.reconnected",
  "generation.stream.first_event",
  "generation.stream.done",
  "generation.visible_error",
] as const;

export const clientObservationSchema = z.object({
  eventId: z.string().min(8).max(128),
  eventType: z.enum(CLIENT_OBSERVATION_TYPES),
  occurredAt: z.string().datetime().optional(),
  generationId: z.string().min(1).max(128).optional(),
  conversationId: z.string().min(1).max(128).optional(),
  traceId: z.string().min(8).max(128).optional(),
  streamAttempt: z.number().int().min(0).max(100).optional(),
  elapsedMs: z.number().min(0).max(24 * 60 * 60 * 1000).optional(),
  visibleErrorCode: z.string().min(1).max(128).optional(),
  closeReason: z.enum(["done", "cancelled", "aborted", "error", "unknown"]).optional(),
  pageVisibility: z.enum(["visible", "hidden", "prerender", "unknown"]).optional(),
  online: z.boolean().optional(),
});

export type ClientObservationPayload = z.infer<typeof clientObservationSchema>;
