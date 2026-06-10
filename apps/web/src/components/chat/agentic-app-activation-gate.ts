export type ActivationGateRejectionReason = "no_user_activation" | "rate_limited";

export type ActivationGateVerdict =
  | { allowed: true }
  | { allowed: false; reason: ActivationGateRejectionReason };

export type ActivationGate = {
  /** A real parent-visible user gesture over the panel (pointer/keyboard). */
  recordGesture(now: number): void;
  /**
   * Focus entered the iframe. Only arms engagement when a real gesture happened
   * within `gestureWindowMs` — programmatic focus (autofocus, scripted `.focus()`)
   * has no preceding gesture and therefore cannot arm the gate.
   */
  recordFocusEntry(now: number): void;
  /** Decide whether a prompt may be sent right now. Does NOT consume rate budget. */
  evaluate(now: number, focused: boolean): ActivationGateVerdict;
  /** Consume rate budget after a prompt was actually sent. */
  recordAccepted(now: number): void;
};

export type ActivationGateOptions = {
  gestureWindowMs?: number;
  engagementTtlMs?: number;
  minIntervalMs?: number;
  maxAccepted?: number;
  windowMs?: number;
};

// postMessage needs no user gesture, so rendering a hostile Agentic-App must not be
// equivalent to executing its prompt (ADR 0014). The parent cannot see clicks inside
// the sandboxed iframe; the only honest signals are (1) real pointer/keyboard gestures
// over the panel chrome and (2) focus entering the iframe. A genuine button click
// produces a gesture (mouse travels onto the panel) immediately followed by focus
// entry; autofocus or a background timer produces neither in sequence. Engagement is
// armed only by that gesture→focus pairing, expires after a bounded TTL so an
// abandoned app cannot keep sending, and the rate budget is consumed only after a send
// actually succeeds so app-layer refusals do not deplete the user's real budget.
export function createActivationGate(options?: ActivationGateOptions): ActivationGate {
  const gestureWindowMs = options?.gestureWindowMs ?? 5000;
  const engagementTtlMs = options?.engagementTtlMs ?? 60_000;
  const minIntervalMs = options?.minIntervalMs ?? 1000;
  const maxAccepted = options?.maxAccepted ?? 6;
  const windowMs = options?.windowMs ?? 60_000;

  let lastGestureAt: number | null = null;
  let engagedAt: number | null = null;
  let acceptedTimestamps: number[] = [];

  return {
    recordGesture(now) {
      lastGestureAt = now;
    },
    recordFocusEntry(now) {
      if (lastGestureAt !== null && now - lastGestureAt <= gestureWindowMs) {
        engagedAt = now;
      }
    },
    evaluate(now, focused) {
      if (!focused || engagedAt === null || now - engagedAt > engagementTtlMs) {
        return { allowed: false, reason: "no_user_activation" };
      }

      acceptedTimestamps = acceptedTimestamps.filter((timestamp) => now - timestamp < windowMs);
      const lastAccepted = acceptedTimestamps.at(-1);
      if (
        (lastAccepted !== undefined && now - lastAccepted < minIntervalMs) ||
        acceptedTimestamps.length >= maxAccepted
      ) {
        return { allowed: false, reason: "rate_limited" };
      }

      return { allowed: true };
    },
    recordAccepted(now) {
      acceptedTimestamps.push(now);
    },
  };
}
