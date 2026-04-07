"use client";

import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Loader2,
  Search,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import type { IntegrationType } from "@/lib/integration-icons";
import { CoworkerAvatar } from "@/components/coworker-avatar";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { INTEGRATION_DISPLAY_NAMES, INTEGRATION_LOGOS } from "@/lib/integration-icons";
import { cn } from "@/lib/utils";
import { type CoworkerHistoryEntry, useCoworkerHistory } from "@/orpc/hooks";

type HistoryEntryStatus = CoworkerHistoryEntry["status"];

function formatRelativeTime(value?: Date | string | null) {
  if (!value) {
    return "never";
  }

  const date = typeof value === "string" ? new Date(value) : value;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);
  const diffD = Math.floor(diffH / 24);

  if (diffMin < 1) {
    return "just now";
  }
  if (diffMin < 60) {
    return `${diffMin}m ago`;
  }
  if (diffH < 24) {
    return `${diffH}h ago`;
  }
  if (diffD < 7) {
    return `${diffD}d ago`;
  }

  return date.toLocaleDateString();
}

function StatusBadge({ status }: { status: HistoryEntryStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        status === "success" && "bg-green-500/10 text-green-600 dark:text-green-400",
        status === "denied" && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
        status === "error" && "bg-red-500/10 text-red-600 dark:text-red-400",
        status === "pending" && "bg-blue-500/10 text-blue-600 dark:text-blue-400",
      )}
    >
      {status === "success" && <CheckCircle2 className="size-3" />}
      {status === "denied" && <ShieldAlert className="size-3" />}
      {status === "error" && <XCircle className="size-3" />}
      {status === "pending" && <Clock3 className="size-3" />}
      {status}
    </span>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "red" | "default";
}) {
  return (
    <div className="bg-card flex flex-col gap-1 rounded-xl border px-4 py-3">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      <span
        className={cn(
          "text-2xl font-semibold tabular-nums tracking-tight",
          accent === "red" && value > 0 && "text-red-500",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function PayloadPreview({ preview }: { preview: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);
  const toggleExpanded = useCallback(() => setExpanded((value) => !value), []);
  const json = JSON.stringify(preview, null, 2);
  const lines = json.split("\n");
  const isLong = lines.length > 4;
  const displayText = expanded ? json : lines.slice(0, 4).join("\n") + (isLong ? "\n..." : "");

  return (
    <div className="mt-2">
      <pre
        className={cn(
          "bg-muted/50 overflow-x-auto rounded-lg border p-3 font-mono text-[11px] leading-relaxed",
          "text-muted-foreground",
        )}
      >
        {displayText}
      </pre>
      {isLong && (
        <button
          type="button"
          onClick={toggleExpanded}
          className="text-muted-foreground hover:text-foreground mt-1.5 flex items-center gap-1 text-[11px] font-medium transition-colors"
        >
          {expanded ? (
            <>
              <ChevronUp className="size-3" /> Show less
            </>
          ) : (
            <>
              <ChevronDown className="size-3" /> Show more
            </>
          )}
        </button>
      )}
    </div>
  );
}

function IntegrationLogo({
  integration,
  size = 20,
  className,
}: {
  integration: IntegrationType;
  size?: number;
  className?: string;
}) {
  const src = INTEGRATION_LOGOS[integration];
  const needsInvert = integration === "notion" || integration === "github";

  return (
    <Image
      src={src}
      alt={INTEGRATION_DISPLAY_NAMES[integration]}
      width={size}
      height={size}
      className={cn("shrink-0", needsInvert && "dark:invert", className)}
    />
  );
}

function HistoryCard({ entry, isLast }: { entry: CoworkerHistoryEntry; isLast: boolean }) {
  const integration = entry.integration as IntegrationType;

  return (
    <div className="relative flex gap-4">
      <div className="flex w-8 shrink-0 flex-col items-center">
        <div className="bg-card z-10 flex size-8 items-center justify-center rounded-lg border">
          <IntegrationLogo integration={integration} size={16} />
        </div>
        {!isLast && <div className="bg-border w-px flex-1" />}
      </div>

      <div className="bg-card mb-3 min-w-0 flex-1 rounded-xl border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <CoworkerAvatar username={entry.coworker.username} size={24} className="rounded-md" />
          <span className="text-sm font-medium">{entry.coworker.name}</span>
          <span className="text-muted-foreground text-xs">
            {formatRelativeTime(entry.timestamp)}
          </span>
          <div className="ml-auto">
            <StatusBadge status={entry.status} />
          </div>
        </div>

        <div className="mt-2 flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{entry.operationLabel}</span>
          <span className="text-muted-foreground/50">&rarr;</span>
          <span className="font-medium">{entry.target}</span>
          <span className="text-muted-foreground/60 hidden text-xs sm:inline">
            {INTEGRATION_DISPLAY_NAMES[integration]}
          </span>
        </div>

        <PayloadPreview preview={entry.preview} />
      </div>
    </div>
  );
}

export default function CoworkerHistoryPage() {
  const { data, isLoading, error } = useCoworkerHistory();
  const entries = useMemo(() => data ?? [], [data]);
  const [search, setSearch] = useState("");
  const [coworkerFilter, setCoworkerFilter] = useState("all");
  const [integrationFilter, setIntegrationFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const handleSearchChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => setSearch(event.target.value),
    [],
  );

  const coworkerOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const entry of entries) {
      if (!map.has(entry.coworker.id)) {
        map.set(entry.coworker.id, { id: entry.coworker.id, name: entry.coworker.name });
      }
    }

    return Array.from(map.values());
  }, [entries]);

  const integrationOptions = useMemo(() => {
    const unique = new Set<IntegrationType>();
    for (const entry of entries) {
      unique.add(entry.integration as IntegrationType);
    }

    return Array.from(unique);
  }, [entries]);

  const filtered = useMemo(() => {
    const query = search.toLowerCase();

    return entries.filter((entry) => {
      if (coworkerFilter !== "all" && entry.coworker.id !== coworkerFilter) {
        return false;
      }
      if (integrationFilter !== "all" && entry.integration !== integrationFilter) {
        return false;
      }
      if (statusFilter !== "all" && entry.status !== statusFilter) {
        return false;
      }
      if (!query) {
        return true;
      }

      const haystack = [
        entry.target,
        entry.operationLabel,
        entry.coworker.name,
        JSON.stringify(entry.preview),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [entries, search, coworkerFilter, integrationFilter, statusFilter]);

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return {
      actionsToday: entries.filter((entry) => new Date(entry.timestamp) >= today).length,
      integrations: new Set(entries.map((entry) => entry.integration)).size,
      denied: entries.filter((entry) => entry.status === "denied").length,
      activeCoworkers: new Set(entries.map((entry) => entry.coworker.id)).size,
    };
  }, [entries]);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/coworkers"
          className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          Coworkers
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">History</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Audit trail of all write actions across your coworker fleet.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="text-muted-foreground/60 pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={handleSearchChange}
            placeholder='Search actions... (e.g. "#general", "john@", "CSV export")'
            className="h-9 pl-9 text-sm"
          />
        </div>
        <div className="flex gap-2">
          <Select value={coworkerFilter} onValueChange={setCoworkerFilter}>
            <SelectTrigger size="sm" className="w-[160px]">
              <SelectValue placeholder="All coworkers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All coworkers</SelectItem>
              {coworkerOptions.map((coworker) => (
                <SelectItem key={coworker.id} value={coworker.id}>
                  {coworker.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={integrationFilter} onValueChange={setIntegrationFilter}>
            <SelectTrigger size="sm" className="w-[160px]">
              <SelectValue placeholder="All integrations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All integrations</SelectItem>
              {integrationOptions.map((integration) => (
                <SelectItem key={integration} value={integration}>
                  {INTEGRATION_DISPLAY_NAMES[integration]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger size="sm" className="w-[120px]">
              <SelectValue placeholder="All status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="denied">Denied</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Actions today" value={stats.actionsToday} />
        <StatCard label="Integrations used" value={stats.integrations} />
        <StatCard label="Denied" value={stats.denied} accent="red" />
        <StatCard label="Active coworkers" value={stats.activeCoworkers} />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="text-muted-foreground size-5 animate-spin" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16">
          <XCircle className="text-muted-foreground/40 mb-3 size-10" />
          <p className="text-muted-foreground text-sm font-medium">Failed to load history</p>
          <p className="text-muted-foreground/60 mt-1 text-xs">Refresh the page and try again.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Search className="text-muted-foreground/30 mb-3 size-10" />
          <p className="text-muted-foreground text-sm font-medium">No matching actions found</p>
          <p className="text-muted-foreground/60 mt-1 text-xs">
            Try adjusting your search or filters.
          </p>
        </div>
      ) : (
        <div className="pt-2">
          {filtered.map((entry, index) => (
            <HistoryCard key={entry.id} entry={entry} isLast={index === filtered.length - 1} />
          ))}
        </div>
      )}
    </div>
  );
}
