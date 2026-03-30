"use client";

import { Shield } from "lucide-react";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export type RemoteRunSourceDetails = {
  targetEnv: string | null;
  remoteUserId: string | null;
  remoteUserEmail: string | null;
};

export function extractRemoteRunSourceDetails(run: {
  events?: Array<{ type?: string; payload?: unknown }>;
  debugInfo?: unknown;
}): RemoteRunSourceDetails | null {
  const eventPayloads = Array.isArray(run.events)
    ? run.events
        .toReversed()
        .filter(
          (event): event is { type: string; payload?: unknown } =>
            event?.type === "remote_integration_source",
        )
        .map((event) => event.payload)
    : [];

  for (const payload of eventPayloads) {
    if (!isRecord(payload)) {
      continue;
    }

    return {
      targetEnv: typeof payload.targetEnv === "string" ? payload.targetEnv : null,
      remoteUserId: typeof payload.remoteUserId === "string" ? payload.remoteUserId : null,
      remoteUserEmail: typeof payload.remoteUserEmail === "string" ? payload.remoteUserEmail : null,
    };
  }

  if (!isRecord(run.debugInfo) || !isRecord(run.debugInfo.remoteRun)) {
    return null;
  }

  return {
    targetEnv:
      typeof run.debugInfo.remoteRun.targetEnv === "string"
        ? run.debugInfo.remoteRun.targetEnv
        : null,
    remoteUserId:
      typeof run.debugInfo.remoteRun.remoteUserId === "string"
        ? run.debugInfo.remoteRun.remoteUserId
        : null,
    remoteUserEmail:
      typeof run.debugInfo.remoteRun.remoteUserEmail === "string"
        ? run.debugInfo.remoteRun.remoteUserEmail
        : null,
  };
}

function formatRemoteTargetEnvLabel(targetEnv: string | null): string {
  if (targetEnv === "prod") {
    return "Production";
  }
  if (targetEnv === "staging") {
    return "Staging";
  }
  return targetEnv ?? "Unknown";
}

export function RemoteRunSourceBanner({ source }: { source: RemoteRunSourceDetails | null }) {
  if (!source) {
    return null;
  }

  return (
    <div className="border-border/30 bg-muted/20 border-b px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="bg-background text-muted-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border">
          <Shield className="h-4 w-4" />
        </div>
        <div className="min-w-0 space-y-1">
          <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
            Remote integration source
          </p>
          <p className="text-sm font-medium">
            Environment: {formatRemoteTargetEnvLabel(source.targetEnv)}
          </p>
          <p className="text-muted-foreground truncate text-xs">
            User: {source.remoteUserEmail ?? source.remoteUserId ?? "Unknown user"}
          </p>
        </div>
      </div>
    </div>
  );
}
