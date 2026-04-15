"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ExternalLink,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAdminListSandboxes, useAdminKillSandbox } from "@/orpc/hooks";

function formatRelativeTime(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) {
    return "just now";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }
  return date.toLocaleString();
}

function formatUptime(startedAt: Date | string) {
  const start = startedAt instanceof Date ? startedAt : new Date(startedAt);
  const diffMs = Date.now() - start.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours > 0) {
    return `${hours}h ${remainingMinutes}m`;
  }
  return `${minutes}m`;
}

function truncateId(id: string) {
  return id.length > 12 ? `${id.slice(0, 12)}...` : id;
}

function getEnvBaseUrl(env: string | null): string {
  switch (env) {
    case "prod":
      return "https://cmdclaw.ai";
    case "staging":
      return "https://staging.cmdclaw.ai";
    default:
      return "";
  }
}

const ENV_COLORS: Record<string, string> = {
  dev: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  staging: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  prod: "bg-red-500/10 text-red-700 dark:text-red-400",
};

function EnvironmentBadge({ env }: { env: string | null }) {
  if (!env) {
    return <span className="text-muted-foreground">--</span>;
  }
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
        ENV_COLORS[env] ?? "bg-gray-500/10 text-gray-700 dark:text-gray-400",
      )}
    >
      {env}
    </span>
  );
}

function KillButton({
  sandboxId,
  isKilling,
  onKill,
}: {
  sandboxId: string;
  isKilling: boolean;
  onKill: (id: string) => void;
}) {
  const handleClick = useCallback(() => onKill(sandboxId), [sandboxId, onKill]);
  return (
    <Button variant="ghost" size="sm" onClick={handleClick} disabled={isKilling}>
      {isKilling ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Trash2 className="h-4 w-4 text-red-500" />
      )}
    </Button>
  );
}

type SandboxRow = {
  sandboxId: string;
  templateId: string;
  state: "running" | "paused";
  startedAt: Date | string;
  endAt: Date | string;
  cpuCount: number;
  memoryMB: number;
  metadata: Record<string, string>;
  environment: string | null;
  conversationId: string | null;
  conversationTitle: string | null;
  conversationType: string | null;
  model: string | null;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  coworkerName: string | null;
  coworkerUsername: string | null;
  coworkerTriggerType: string | null;
  coworkerId: string | null;
};

type SortKey = "sandboxId" | "environment" | "state" | "startedAt" | "userEmail" | "details";
type SortDir = "asc" | "desc";

function getDetailsText(row: SandboxRow): string {
  if (row.conversationType === "coworker") {
    return row.coworkerUsername ?? row.coworkerName ?? "coworker";
  }
  if (row.conversationType === "chat") {
    return row.conversationTitle ?? "chat";
  }
  return row.conversationType ?? "";
}

function getSortValue(row: SandboxRow, key: SortKey): string | number {
  switch (key) {
    case "sandboxId":
      return row.sandboxId;
    case "environment":
      return row.environment ?? "";
    case "state":
      return row.state;
    case "startedAt":
      return new Date(row.startedAt).getTime();
    case "userEmail":
      return row.userEmail ?? "";
    case "details":
      return getDetailsText(row);
  }
}

function SortableHeader({
  label,
  sortKey,
  currentKey,
  currentDir,
  onSort,
  align,
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  currentDir: SortDir;
  onSort: (key: SortKey) => void;
  align?: "right";
}) {
  const handleClick = useCallback(() => onSort(sortKey), [onSort, sortKey]);
  const isActive = currentKey === sortKey;
  return (
    <th
      className={cn(
        "cursor-pointer select-none px-4 py-3 font-medium",
        align === "right" ? "text-right" : "text-left",
      )}
      onClick={handleClick}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          currentDir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="text-muted-foreground/50 h-3 w-3" />
        )}
      </span>
    </th>
  );
}

type ConfirmState = {
  title: string;
  description: string;
  action: () => Promise<void>;
} | null;

export default function AdminSandboxesPage() {
  const { data, isLoading, error, refetch } = useAdminListSandboxes();
  const killMutation = useAdminKillSandbox();
  const [killingId, setKillingId] = useState<string | null>(null);
  const [killingAll, setKillingAll] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("startedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const confirmActionRef = useRef<(() => Promise<void>) | null>(null);

  const rawSandboxes = useMemo(() => (data?.sandboxes ?? []) as SandboxRow[], [data]);

  const handleSort = useCallback(
    (key: SortKey) => {
      if (key === sortKey) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("asc");
      }
    },
    [sortKey],
  );

  const sandboxes = useMemo(() => {
    const sorted = rawSandboxes.toSorted((a, b) => {
      const aVal = getSortValue(a, sortKey);
      const bVal = getSortValue(b, sortKey);
      if (aVal < bVal) {
        return sortDir === "asc" ? -1 : 1;
      }
      if (aVal > bVal) {
        return sortDir === "asc" ? 1 : -1;
      }
      return 0;
    });
    return sorted;
  }, [rawSandboxes, sortKey, sortDir]);

  const handleRefresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  const handleKill = useCallback(
    (sandboxId: string) => {
      const action = async () => {
        setKillingId(sandboxId);
        try {
          await killMutation.mutateAsync({ sandboxId });
        } finally {
          setKillingId(null);
        }
      };
      confirmActionRef.current = action;
      setConfirm({
        title: "Kill sandbox",
        description: `This will terminate sandbox ${sandboxId}. This action cannot be undone.`,
        action,
      });
    },
    [killMutation],
  );

  const handleKillAll = useCallback(() => {
    const count = rawSandboxes.length;
    const action = async () => {
      setKillingAll(true);
      try {
        await Promise.allSettled(
          rawSandboxes.map((s) => killMutation.mutateAsync({ sandboxId: s.sandboxId })),
        );
      } finally {
        setKillingAll(false);
      }
    };
    confirmActionRef.current = action;
    setConfirm({
      title: "Kill all sandboxes",
      description: `This will terminate all ${count} sandboxes across all environments. This action cannot be undone.`,
      action,
    });
  }, [rawSandboxes, killMutation]);

  const handleConfirm = useCallback(() => {
    const action = confirmActionRef.current;
    setConfirm(null);
    confirmActionRef.current = null;
    if (action) {
      void action();
    }
  }, []);

  const handleCancel = useCallback(() => {
    setConfirm(null);
    confirmActionRef.current = null;
  }, []);

  const runningCount = sandboxes.filter((s) => s.state === "running").length;
  const pausedCount = sandboxes.filter((s) => s.state === "paused").length;

  const envCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of sandboxes) {
      const env = s.environment ?? "unknown";
      counts[env] = (counts[env] ?? 0) + 1;
    }
    return counts;
  }, [sandboxes]);

  return (
    <div>
      <AlertDialog open={confirm !== null} onOpenChange={handleCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Kill
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">
            Sandboxes{" "}
            {!isLoading && (
              <span className="text-muted-foreground text-base font-normal">
                ({sandboxes.length})
              </span>
            )}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Live E2B sandboxes across all environments.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} />
            Refresh
          </Button>
          {sandboxes.length > 0 && (
            <Button variant="destructive" size="sm" onClick={handleKillAll} disabled={killingAll}>
              {killingAll ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Kill all
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="border-destructive/30 bg-destructive/10 text-destructive mb-4 rounded-lg border p-3 text-sm">
          {error instanceof Error ? error.message : "Failed to load sandboxes."}
        </div>
      )}

      {!isLoading && sandboxes.length > 0 && (
        <div className="mb-4 flex gap-4 text-sm">
          <span className="text-green-600 dark:text-green-400">{runningCount} running</span>
          {pausedCount > 0 && (
            <span className="text-yellow-600 dark:text-yellow-400">{pausedCount} paused</span>
          )}
          <span className="text-muted-foreground">|</span>
          {Object.entries(envCounts).map(([env, count]) => (
            <span key={env}>
              <EnvironmentBadge env={env} /> {count}
            </span>
          ))}
        </div>
      )}

      <div className="bg-card rounded-lg border">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
          </div>
        ) : sandboxes.length === 0 ? (
          <div className="text-muted-foreground py-12 text-center text-sm">
            No sandboxes running.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <SortableHeader
                    label="Sandbox ID"
                    sortKey="sandboxId"
                    currentKey={sortKey}
                    currentDir={sortDir}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Env"
                    sortKey="environment"
                    currentKey={sortKey}
                    currentDir={sortDir}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="State"
                    sortKey="state"
                    currentKey={sortKey}
                    currentDir={sortDir}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Started"
                    sortKey="startedAt"
                    currentKey={sortKey}
                    currentDir={sortDir}
                    onSort={handleSort}
                  />
                  <th className="px-4 py-3 text-left font-medium">Uptime</th>
                  <SortableHeader
                    label="User"
                    sortKey="userEmail"
                    currentKey={sortKey}
                    currentDir={sortDir}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Details"
                    sortKey="details"
                    currentKey={sortKey}
                    currentDir={sortDir}
                    onSort={handleSort}
                  />
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sandboxes.map((s) => (
                  <tr key={s.sandboxId} className="hover:bg-muted/50 border-b last:border-b-0">
                    <td className="px-4 py-3 font-mono text-xs" title={s.sandboxId}>
                      {truncateId(s.sandboxId)}
                    </td>
                    <td className="px-4 py-3">
                      <EnvironmentBadge env={s.environment} />
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                          s.state === "running"
                            ? "bg-green-500/10 text-green-700 dark:text-green-400"
                            : "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
                        )}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            s.state === "running" ? "bg-green-500" : "bg-yellow-500",
                          )}
                        />
                        {s.state}
                      </span>
                    </td>
                    <td className="px-4 py-3">{formatRelativeTime(s.startedAt)}</td>
                    <td className="px-4 py-3">{formatUptime(s.startedAt)}</td>
                    <td className="px-4 py-3">
                      {s.userEmail ? (
                        <span title={s.userName ?? undefined}>{s.userEmail}</span>
                      ) : (
                        <span className="text-muted-foreground">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {s.conversationType === "coworker" ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="text-muted-foreground text-xs">coworker</span>
                          {(s.coworkerUsername || s.coworkerName) && s.coworkerId ? (
                            <a
                              href={`${getEnvBaseUrl(s.environment)}/coworkers/${s.coworkerId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 hover:opacity-70"
                            >
                              {s.coworkerUsername ? `@${s.coworkerUsername}` : s.coworkerName}
                              {s.coworkerTriggerType && (
                                <span className="text-muted-foreground text-xs">
                                  ({s.coworkerTriggerType})
                                </span>
                              )}
                              <ExternalLink className="text-muted-foreground h-3 w-3 shrink-0" />
                            </a>
                          ) : null}
                        </span>
                      ) : s.conversationType === "chat" ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="text-muted-foreground text-xs">chat</span>
                          {s.conversationId ? (
                            <a
                              href={`${getEnvBaseUrl(s.environment)}/chat/${s.conversationId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 hover:opacity-70"
                            >
                              {s.conversationTitle ?? "Untitled"}
                              <ExternalLink className="text-muted-foreground h-3 w-3 shrink-0" />
                            </a>
                          ) : (
                            <span>{s.conversationTitle ?? ""}</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <KillButton
                        sandboxId={s.sandboxId}
                        isKilling={killingId === s.sandboxId}
                        onKill={handleKill}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
