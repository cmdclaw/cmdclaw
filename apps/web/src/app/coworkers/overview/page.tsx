"use client";

import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import { useCoworkerOverview } from "@/orpc/hooks";

// ---------------------------------------------------------------------------
// Chart constants (matches admin/usage patterns)
// ---------------------------------------------------------------------------

const BAR_RADIUS_TOP: [number, number, number, number] = [2, 2, 0, 0];
const BAR_RADIUS_NONE: [number, number, number, number] = [0, 0, 0, 0];
const CHART_MARGIN = { top: 4, right: 4, left: 0, bottom: 0 };
const TICK_STYLE = { fontSize: 11 };
const CURSOR_STYLE = { fill: "var(--color-muted)", opacity: 0.4 };
const LEGEND_STYLE = { fontSize: 12, paddingTop: 12 };

const STATUS_COLORS = {
  completed: "#22c55e",
  error: "#ef4444",
  running: "#3b82f6",
  other: "#a1a1aa",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatChartDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

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

function getTriggerLabel(triggerType: string) {
  const map: Record<string, string> = {
    manual: "Manual",
    schedule: "Scheduled",
    email: "Email",
    webhook: "Webhook",
  };
  return map[triggerType] ?? triggerType;
}

function StatusDot({ status }: { status: string | null }) {
  return (
    <span
      className={cn(
        "inline-block size-2 rounded-full",
        status === "completed" && "bg-green-500",
        status === "error" && "bg-red-500",
        status === "running" && "bg-blue-500",
        !status && "bg-muted-foreground/30",
        status &&
          status !== "completed" &&
          status !== "error" &&
          status !== "running" &&
          "bg-amber-500",
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) {
    return null;
  }
  return (
    <div className="bg-popover rounded-lg border px-3 py-2 text-xs shadow-lg">
      <p className="text-muted-foreground mb-1.5 font-medium">{label}</p>
      {payload.map((entry) => (
        <TooltipEntry key={entry.name} name={entry.name} value={entry.value} color={entry.color} />
      ))}
    </div>
  );
}

function TooltipEntry({ name, value, color }: { name: string; value: number; color: string }) {
  const dotStyle = useMemo(() => ({ backgroundColor: color }), [color]);
  return (
    <div className="flex items-center gap-2">
      <span className="size-2 rounded-full" style={dotStyle} />
      <span className="capitalize">{name}</span>
      <span className="text-foreground ml-auto font-medium">{value}</span>
    </div>
  );
}

const tooltipElement = <ChartTooltip />;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CoworkerOverviewPage() {
  const { data, isLoading } = useCoworkerOverview();

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { summary, dailyRuns, coworkers } = data;
  const failingCoworkers = coworkers.filter((c) => c.latestRunStatus === "error");

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/coworkers"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Coworker Overview</h1>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total Coworkers" value={summary.totalCoworkers} />
        <StatCard
          label="Active"
          value={summary.activeCoworkers}
          subtitle={`of ${summary.totalCoworkers}`}
        />
        <StatCard label="Runs (30d)" value={summary.totalRuns30d} />
        <StatCard
          label="Error Rate"
          value={`${summary.errorRate}%`}
          subtitle={`${summary.errorRuns30d} errors`}
          alert={summary.errorRate > 20}
        />
      </div>

      {/* Runs over time chart */}
      {dailyRuns.length > 0 && (
        <div className="rounded-xl border p-4">
          <h2 className="mb-4 text-sm font-medium">Runs over time (30 days)</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={dailyRuns} margin={CHART_MARGIN}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis
                dataKey="date"
                tickFormatter={formatChartDate}
                tick={TICK_STYLE}
                stroke="var(--color-muted-foreground)"
              />
              <YAxis
                tick={TICK_STYLE}
                stroke="var(--color-muted-foreground)"
                allowDecimals={false}
              />
              <Tooltip content={tooltipElement} cursor={CURSOR_STYLE} />
              <Legend wrapperStyle={LEGEND_STYLE} />
              <Bar
                dataKey="completed"
                stackId="a"
                fill={STATUS_COLORS.completed}
                radius={BAR_RADIUS_NONE}
              />
              <Bar
                dataKey="error"
                stackId="a"
                fill={STATUS_COLORS.error}
                radius={BAR_RADIUS_NONE}
              />
              <Bar
                dataKey="running"
                stackId="a"
                fill={STATUS_COLORS.running}
                radius={BAR_RADIUS_NONE}
              />
              <Bar dataKey="other" stackId="a" fill={STATUS_COLORS.other} radius={BAR_RADIUS_TOP} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Health alerts */}
      {failingCoworkers.length > 0 && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-red-600 dark:text-red-400">
            <AlertTriangle className="size-4" />
            <span>
              {failingCoworkers.length} coworker{failingCoworkers.length > 1 ? "s" : ""} failing
            </span>
          </div>
          <div className="space-y-2">
            {failingCoworkers.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 rounded-lg bg-red-500/5 px-3 py-2 text-sm"
              >
                <StatusDot status="error" />
                <Link
                  href={`/coworkers/${c.id}`}
                  className="font-medium underline-offset-2 hover:underline"
                >
                  {c.name}
                </Link>
                {c.consecutiveErrors > 1 && (
                  <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
                    {c.consecutiveErrors}x consecutive
                  </span>
                )}
                {c.latestErrorMessage && (
                  <span className="text-muted-foreground ml-auto max-w-[300px] truncate text-xs">
                    {c.latestErrorMessage}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-coworker table */}
      <div className="rounded-xl border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Trigger</th>
                <th className="px-4 py-3 text-right font-medium">Runs</th>
                <th className="px-4 py-3 text-right font-medium">Errors</th>
                <th className="px-4 py-3 text-right font-medium">Error Rate</th>
                <th className="px-4 py-3 font-medium">Last Run</th>
                <th className="px-4 py-3 font-medium">Health</th>
              </tr>
            </thead>
            <tbody>
              {coworkers.map((c) => (
                <tr key={c.id} className="border-b last:border-b-0 hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link
                      href={`/coworkers/${c.id}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                        c.status === "on"
                          ? "bg-green-500/10 text-green-600 dark:text-green-400"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          c.status === "on" ? "bg-green-500" : "bg-muted-foreground/50",
                        )}
                      />
                      {c.status === "on" ? "On" : "Off"}
                    </span>
                  </td>
                  <td className="text-muted-foreground px-4 py-3">
                    {getTriggerLabel(c.triggerType)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.totalRuns}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.errorRuns}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span className={cn(c.errorRate > 20 && "text-red-500 font-medium")}>
                      {c.errorRate}%
                    </span>
                  </td>
                  <td className="text-muted-foreground px-4 py-3">
                    <div className="flex items-center gap-2">
                      <StatusDot status={c.latestRunStatus} />
                      <span>{formatRelativeTime(c.latestRunAt)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {c.consecutiveErrors >= 3 ? (
                      <span className="text-xs font-medium text-red-500">
                        {c.consecutiveErrors}x failing
                      </span>
                    ) : c.consecutiveErrors >= 1 ? (
                      <span className="text-xs font-medium text-amber-500">
                        {c.consecutiveErrors}x error
                      </span>
                    ) : c.latestRunStatus === "completed" ? (
                      <span className="text-xs font-medium text-green-500">healthy</span>
                    ) : c.latestRunStatus === null ? (
                      <span className="text-muted-foreground text-xs">no runs</span>
                    ) : (
                      <span className="text-muted-foreground text-xs capitalize">
                        {c.latestRunStatus}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {coworkers.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-muted-foreground px-4 py-8 text-center">
                    No coworkers yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  subtitle,
  alert,
}: {
  label: string;
  value: string | number;
  subtitle?: string;
  alert?: boolean;
}) {
  return (
    <div className={cn("rounded-xl border p-4", alert && "border-red-500/30 bg-red-500/5")}>
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className={cn("text-2xl font-semibold tabular-nums", alert && "text-red-500")}>
          {value}
        </p>
        {subtitle && <p className="text-muted-foreground text-xs">{subtitle}</p>}
      </div>
    </div>
  );
}
