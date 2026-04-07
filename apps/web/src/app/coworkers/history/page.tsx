"use client";

import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Search,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import type { IntegrationType } from "@/lib/integration-icons";
import {
  INTEGRATION_DISPLAY_NAMES,
  INTEGRATION_LOGOS,
  INTEGRATION_OPERATION_LABELS,
} from "@/lib/integration-icons";
import { CoworkerAvatar } from "@/components/coworker-avatar";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type HistoryEntry = {
  id: string;
  timestamp: Date;
  coworker: { id: string; name: string; username: string };
  integration: IntegrationType;
  operation: string;
  operationLabel: string;
  status: "success" | "denied" | "error";
  target: string;
  preview: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 60 * 60 * 1000);
}

function getOperationLabel(integration: IntegrationType, operation: string): string {
  const ops = INTEGRATION_OPERATION_LABELS[integration];
  return ops?.[operation] ?? operation;
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const COWORKERS = {
  slackNotifier: { id: "cw-1", name: "Slack Notifier", username: "slack-notifier" },
  weeklyReporter: { id: "cw-2", name: "Weekly Reporter", username: "weekly-reporter" },
  dealTracker: { id: "cw-3", name: "Deal Tracker", username: "deal-tracker" },
  supportBot: { id: "cw-4", name: "Support Bot", username: "support-bot" },
} as const;

const MOCK_ENTRIES: HistoryEntry[] = [
  {
    id: "h-01",
    timestamp: hoursAgo(0.1),
    coworker: COWORKERS.slackNotifier,
    integration: "slack",
    operation: "send",
    operationLabel: getOperationLabel("slack", "send"),
    status: "success",
    target: "#general",
    preview: {
      channel: "#general",
      text: "Daily standup reminder: please post your updates in the thread below.",
    },
  },
  {
    id: "h-02",
    timestamp: hoursAgo(0.4),
    coworker: COWORKERS.dealTracker,
    integration: "slack",
    operation: "send",
    operationLabel: getOperationLabel("slack", "send"),
    status: "success",
    target: "#sales-alerts",
    preview: {
      channel: "#sales-alerts",
      text: 'Deal "Acme Corp Enterprise" moved to Negotiation stage. Value: $180,000.',
    },
  },
  {
    id: "h-03",
    timestamp: hoursAgo(1.2),
    coworker: COWORKERS.weeklyReporter,
    integration: "google_gmail",
    operation: "send",
    operationLabel: getOperationLabel("google_gmail", "send"),
    status: "success",
    target: "team@company.com",
    preview: {
      to: "team@company.com",
      subject: "Weekly Engineering Report - W14",
      body: "Hi team, here's the weekly summary: 23 PRs merged, 4 incidents resolved...",
    },
  },
  {
    id: "h-04",
    timestamp: hoursAgo(1.8),
    coworker: COWORKERS.supportBot,
    integration: "linear",
    operation: "create",
    operationLabel: getOperationLabel("linear", "create"),
    status: "success",
    target: "SUP-342",
    preview: {
      title: "Customer unable to export CSV from dashboard",
      team: "Support",
      priority: "High",
      description: "Customer reports timeout when exporting large datasets...",
    },
  },
  {
    id: "h-05",
    timestamp: hoursAgo(2.5),
    coworker: COWORKERS.slackNotifier,
    integration: "slack",
    operation: "send",
    operationLabel: getOperationLabel("slack", "send"),
    status: "denied",
    target: "#engineering",
    preview: {
      channel: "#engineering",
      text: "Production deployment v2.14.3 completed successfully.",
    },
  },
  {
    id: "h-06",
    timestamp: hoursAgo(3.1),
    coworker: COWORKERS.dealTracker,
    integration: "airtable",
    operation: "update",
    operationLabel: getOperationLabel("airtable", "update"),
    status: "success",
    target: "Pipeline Tracker",
    preview: {
      base: "Sales CRM",
      table: "Pipeline Tracker",
      record: "Acme Corp",
      fields: { stage: "Negotiation", value: "$180,000", nextStep: "Send contract" },
    },
  },
  {
    id: "h-07",
    timestamp: hoursAgo(4.0),
    coworker: COWORKERS.weeklyReporter,
    integration: "notion",
    operation: "create",
    operationLabel: getOperationLabel("notion", "create"),
    status: "success",
    target: "Sprint Retrospective W14",
    preview: {
      parent: "Engineering Wiki",
      title: "Sprint Retrospective W14",
      content: "## What went well\n- Shipped auth v2 ahead of schedule\n- Zero P0 incidents...",
    },
  },
  {
    id: "h-08",
    timestamp: hoursAgo(5.5),
    coworker: COWORKERS.supportBot,
    integration: "slack",
    operation: "send",
    operationLabel: getOperationLabel("slack", "send"),
    status: "success",
    target: "#support-escalations",
    preview: {
      channel: "#support-escalations",
      text: "New P1 escalation: Customer Zendesk #8842 — billing discrepancy on enterprise plan.",
    },
  },
  {
    id: "h-09",
    timestamp: hoursAgo(6.2),
    coworker: COWORKERS.dealTracker,
    integration: "google_sheets",
    operation: "append",
    operationLabel: getOperationLabel("google_sheets", "append"),
    status: "success",
    target: "Q2 Pipeline Forecast",
    preview: {
      spreadsheet: "Q2 Pipeline Forecast",
      sheet: "April",
      rows: [{ company: "Acme Corp", amount: 180000, probability: "60%", close: "2026-04-30" }],
    },
  },
  {
    id: "h-10",
    timestamp: hoursAgo(8.0),
    coworker: COWORKERS.slackNotifier,
    integration: "slack",
    operation: "send",
    operationLabel: getOperationLabel("slack", "send"),
    status: "error",
    target: "#alerts",
    preview: {
      channel: "#alerts",
      text: "API latency spike detected: p99 > 2s for /api/v1/search",
      error: "channel_not_found: #alerts has been archived",
    },
  },
  {
    id: "h-11",
    timestamp: hoursAgo(10.0),
    coworker: COWORKERS.weeklyReporter,
    integration: "google_gmail",
    operation: "send",
    operationLabel: getOperationLabel("google_gmail", "send"),
    status: "success",
    target: "ceo@company.com",
    preview: {
      to: "ceo@company.com",
      subject: "Weekly KPI Snapshot",
      body: "ARR: $2.4M (+3.2%), Active users: 12,400 (+180), Churn: 1.1% (-0.3pp)",
    },
  },
  {
    id: "h-12",
    timestamp: hoursAgo(12.5),
    coworker: COWORKERS.supportBot,
    integration: "airtable",
    operation: "create",
    operationLabel: getOperationLabel("airtable", "create"),
    status: "success",
    target: "Bug Reports",
    preview: {
      base: "Product",
      table: "Bug Reports",
      fields: {
        title: "CSV export timeout on large datasets",
        severity: "High",
        source: "Zendesk #8842",
      },
    },
  },
  {
    id: "h-13",
    timestamp: hoursAgo(16.0),
    coworker: COWORKERS.dealTracker,
    integration: "slack",
    operation: "send",
    operationLabel: getOperationLabel("slack", "send"),
    status: "success",
    target: "#sales-wins",
    preview: {
      channel: "#sales-wins",
      text: 'Closed Won: "CloudFirst Pro" — $45,000 ARR. Congratulations Sarah!',
    },
  },
  {
    id: "h-14",
    timestamp: hoursAgo(20.0),
    coworker: COWORKERS.slackNotifier,
    integration: "slack",
    operation: "send",
    operationLabel: getOperationLabel("slack", "send"),
    status: "denied",
    target: "#all-hands",
    preview: {
      channel: "#all-hands",
      text: "Reminder: All-hands meeting tomorrow at 2pm. Agenda link in the calendar invite.",
    },
  },
  {
    id: "h-15",
    timestamp: hoursAgo(24.0),
    coworker: COWORKERS.weeklyReporter,
    integration: "notion",
    operation: "append",
    operationLabel: getOperationLabel("notion", "append"),
    status: "success",
    target: "Meeting Notes Archive",
    preview: {
      page: "Meeting Notes Archive",
      content: "## Product Sync — April 6\nAttendees: 8\nDecisions: Ship auth v2 by EOW...",
    },
  },
  {
    id: "h-16",
    timestamp: hoursAgo(28.0),
    coworker: COWORKERS.supportBot,
    integration: "linear",
    operation: "update",
    operationLabel: getOperationLabel("linear", "update"),
    status: "success",
    target: "SUP-338",
    preview: {
      issue: "SUP-338",
      changes: { status: "Done", resolution: "Fixed in v2.14.2" },
    },
  },
  {
    id: "h-17",
    timestamp: hoursAgo(36.0),
    coworker: COWORKERS.dealTracker,
    integration: "airtable",
    operation: "update",
    operationLabel: getOperationLabel("airtable", "update"),
    status: "success",
    target: "Pipeline Tracker",
    preview: {
      base: "Sales CRM",
      table: "Pipeline Tracker",
      record: "CloudFirst Pro",
      fields: { stage: "Closed Won", value: "$45,000", closedDate: "2026-04-05" },
    },
  },
  {
    id: "h-18",
    timestamp: hoursAgo(42.0),
    coworker: COWORKERS.slackNotifier,
    integration: "slack",
    operation: "send",
    operationLabel: getOperationLabel("slack", "send"),
    status: "success",
    target: "#deployments",
    preview: {
      channel: "#deployments",
      text: "Deployment v2.14.2 started. ETA: ~8 minutes. Changelog: 12 commits, 3 fixes.",
    },
  },
];

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: HistoryEntry["status"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        status === "success" && "bg-green-500/10 text-green-600 dark:text-green-400",
        status === "denied" && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
        status === "error" && "bg-red-500/10 text-red-600 dark:text-red-400",
      )}
    >
      {status === "success" && <CheckCircle2 className="size-3" />}
      {status === "denied" && <ShieldAlert className="size-3" />}
      {status === "error" && <XCircle className="size-3" />}
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Payload preview
// ---------------------------------------------------------------------------

function PayloadPreview({ preview }: { preview: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);
  const toggleExpanded = useCallback(() => setExpanded((v) => !v), []);
  const json = JSON.stringify(preview, null, 2);
  const lines = json.split("\n");
  const isLong = lines.length > 4;
  const displayText = expanded ? json : lines.slice(0, 4).join("\n") + (isLong ? "\n..." : "");

  return (
    <div className="mt-2">
      <pre
        className={cn(
          "bg-muted/50 overflow-x-auto rounded-lg p-3 font-mono text-[11px] leading-relaxed",
          "text-muted-foreground border",
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

// ---------------------------------------------------------------------------
// Integration logo (small)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Timeline card
// ---------------------------------------------------------------------------

function HistoryCard({ entry, isLast }: { entry: HistoryEntry; isLast: boolean }) {
  return (
    <div className="relative flex gap-4">
      {/* Timeline connector */}
      <div className="flex w-8 shrink-0 flex-col items-center">
        <div className="bg-card z-10 flex size-8 items-center justify-center rounded-lg border">
          <IntegrationLogo integration={entry.integration} size={16} />
        </div>
        {!isLast && <div className="bg-border w-px flex-1" />}
      </div>

      {/* Card */}
      <div className="bg-card mb-3 min-w-0 flex-1 rounded-xl border p-4">
        {/* Header row */}
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

        {/* Action row */}
        <div className="mt-2 flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{entry.operationLabel}</span>
          <span className="text-muted-foreground/50">&rarr;</span>
          <span className="font-medium">{entry.target}</span>
          <span className="text-muted-foreground/60 hidden text-xs sm:inline">
            {INTEGRATION_DISPLAY_NAMES[entry.integration]}
          </span>
        </div>

        {/* Payload */}
        <PayloadPreview preview={entry.preview} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CoworkerHistoryPage() {
  const [search, setSearch] = useState("");
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value),
    [],
  );
  const [coworkerFilter, setCoworkerFilter] = useState("all");
  const [integrationFilter, setIntegrationFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Derive unique values for filters
  const coworkerOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const e of MOCK_ENTRIES) {
      if (!map.has(e.coworker.id)) {
        map.set(e.coworker.id, { id: e.coworker.id, name: e.coworker.name });
      }
    }
    return Array.from(map.values());
  }, []);

  const integrationOptions = useMemo(() => {
    const set = new Set<IntegrationType>();
    for (const e of MOCK_ENTRIES) {
      set.add(e.integration);
    }
    return Array.from(set);
  }, []);

  // Filter + search
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return MOCK_ENTRIES.filter((e) => {
      if (coworkerFilter !== "all" && e.coworker.id !== coworkerFilter) {
        return false;
      }
      if (integrationFilter !== "all" && e.integration !== integrationFilter) {
        return false;
      }
      if (statusFilter !== "all" && e.status !== statusFilter) {
        return false;
      }
      if (q) {
        const haystack = [
          e.target,
          e.operationLabel,
          e.coworker.name,
          JSON.stringify(e.preview),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [search, coworkerFilter, integrationFilter, statusFilter]);

  // Stats (computed from filtered for context-aware numbers)
  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const actionsToday = MOCK_ENTRIES.filter((e) => e.timestamp >= today).length;
    const integrations = new Set(MOCK_ENTRIES.map((e) => e.integration)).size;
    const denied = MOCK_ENTRIES.filter((e) => e.status === "denied").length;
    const activeCoworkers = new Set(MOCK_ENTRIES.map((e) => e.coworker.id)).size;
    return { actionsToday, integrations, denied, activeCoworkers };
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
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

      {/* Search + Filters */}
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
              {coworkerOptions.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
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
              {integrationOptions.map((i) => (
                <SelectItem key={i} value={i}>
                  {INTEGRATION_DISPLAY_NAMES[i]}
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
              <SelectItem value="denied">Denied</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Actions today" value={stats.actionsToday} />
        <StatCard label="Integrations used" value={stats.integrations} />
        <StatCard label="Denied" value={stats.denied} accent="red" />
        <StatCard label="Active coworkers" value={stats.activeCoworkers} />
      </div>

      {/* Timeline */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Search className="text-muted-foreground/30 mb-3 size-10" />
          <p className="text-muted-foreground text-sm font-medium">No matching actions found</p>
          <p className="text-muted-foreground/60 mt-1 text-xs">
            Try adjusting your search or filters.
          </p>
        </div>
      ) : (
        <div className="pt-2">
          {filtered.map((entry, i) => (
            <HistoryCard key={entry.id} entry={entry} isLast={i === filtered.length - 1} />
          ))}
        </div>
      )}
    </div>
  );
}
