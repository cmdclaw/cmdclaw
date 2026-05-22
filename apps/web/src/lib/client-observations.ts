"use client";

import type { ClientObservationPayload } from "@cmdclaw/core/lib/client-observation";

function getBrowserState(): Pick<ClientObservationPayload, "pageVisibility" | "online"> {
  if (typeof document === "undefined" || typeof navigator === "undefined") {
    return { pageVisibility: "unknown", online: undefined };
  }

  const visibility = document.visibilityState;
  return {
    pageVisibility:
      visibility === "visible" || visibility === "hidden" || visibility === "prerender"
        ? visibility
        : "unknown",
    online: navigator.onLine,
  };
}

export function reportClientObservation(
  observation: Omit<ClientObservationPayload, "eventId" | "occurredAt"> &
    Partial<Pick<ClientObservationPayload, "eventId" | "occurredAt">>,
): void {
  if (typeof window === "undefined") {
    return;
  }

  const payload: ClientObservationPayload = {
    ...getBrowserState(),
    ...observation,
    eventId: observation.eventId ?? crypto.randomUUID(),
    occurredAt: observation.occurredAt ?? new Date().toISOString(),
  };

  const body = JSON.stringify({ observations: [payload] });
  const url = "/api/observability/client-observations";
  if (navigator.sendBeacon) {
    const sent = navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
    if (sent) {
      return;
    }
  }

  void fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // Client observations are best-effort and must never affect chat streaming.
  });
}
