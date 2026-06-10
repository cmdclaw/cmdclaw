import { describe, expect, it } from "vitest";
import { createActivationGate } from "./agentic-app-activation-gate";

// Helper: arm engagement the way a genuine click does — a real gesture immediately
// followed by focus entering the iframe.
function arm(gate: ReturnType<typeof createActivationGate>, now: number) {
  gate.recordGesture(now);
  gate.recordFocusEntry(now);
}

describe("createActivationGate", () => {
  it("rejects with no_user_activation before any engagement, even when focused", () => {
    const gate = createActivationGate();
    expect(gate.evaluate(1000, true)).toEqual({ allowed: false, reason: "no_user_activation" });
  });

  it("rejects focus entry that was not preceded by a real gesture (autofocus/script)", () => {
    const gate = createActivationGate();
    // No recordGesture — a programmatic focus cannot arm the gate.
    gate.recordFocusEntry(1000);
    expect(gate.evaluate(1000, true)).toEqual({ allowed: false, reason: "no_user_activation" });
  });

  it("rejects focus entry whose preceding gesture is older than the gesture window", () => {
    const gate = createActivationGate({ gestureWindowMs: 5000 });
    gate.recordGesture(0);
    gate.recordFocusEntry(6000); // gesture is stale
    expect(gate.evaluate(6000, true)).toEqual({ allowed: false, reason: "no_user_activation" });
  });

  it("allows a prompt after a gesture-armed focus entry while focused", () => {
    const gate = createActivationGate();
    arm(gate, 1000);
    expect(gate.evaluate(1000, true)).toEqual({ allowed: true });
  });

  it("rejects when engaged but the iframe is not focused at message time", () => {
    const gate = createActivationGate();
    arm(gate, 1000);
    expect(gate.evaluate(1000, false)).toEqual({ allowed: false, reason: "no_user_activation" });
  });

  it("lets engagement expire after the TTL so an abandoned app cannot keep sending", () => {
    const gate = createActivationGate({ engagementTtlMs: 60_000 });
    arm(gate, 0);
    expect(gate.evaluate(59_000, true)).toEqual({ allowed: true });
    expect(gate.evaluate(61_000, true)).toEqual({ allowed: false, reason: "no_user_activation" });
  });

  it("does not consume rate budget until a send is recorded as accepted", () => {
    const gate = createActivationGate({ minIntervalMs: 1000 });
    arm(gate, 0);
    // Evaluate twice without recording an accept — a rejected/failed send must not
    // deplete the budget.
    expect(gate.evaluate(1000, true)).toEqual({ allowed: true });
    expect(gate.evaluate(1100, true)).toEqual({ allowed: true });
    // Now record an accept; the next evaluate within the interval is rate-limited.
    gate.recordAccepted(1100);
    expect(gate.evaluate(1200, true)).toEqual({ allowed: false, reason: "rate_limited" });
    expect(gate.evaluate(2200, true)).toEqual({ allowed: true });
  });

  it("rejects beyond the windowed cap and recovers as the window slides", () => {
    const gate = createActivationGate({ minIntervalMs: 0, maxAccepted: 3, windowMs: 10_000 });
    arm(gate, 0);
    for (const at of [1000, 2000, 3000]) {
      expect(gate.evaluate(at, true)).toEqual({ allowed: true });
      gate.recordAccepted(at);
    }
    expect(gate.evaluate(4000, true)).toEqual({ allowed: false, reason: "rate_limited" });
    expect(gate.evaluate(11_500, true)).toEqual({ allowed: true });
  });
});
