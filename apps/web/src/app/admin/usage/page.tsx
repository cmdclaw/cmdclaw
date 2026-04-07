"use client";

import { Loader2 } from "lucide-react";
import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminUsageDashboard, useAdminWorkspaces } from "@/orpc/hooks";

type UsageType = "chat" | "coworker_builder" | "coworker_runner";
type GroupBy = "model" | "type";

type DailyByModelEntry = {
  date: string;
  model: string;
  totalTokens: number;
};

type DailyByTypeEntry = {
  date: string;
  type: UsageType;
  totalTokens: number;
};

type CoworkerBreakdownEntry = {
  name: string;
  type: UsageType;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

const TYPE_LABELS: Record<UsageType, string> = {
  chat: "Chat",
  coworker_builder: "Coworker Builder",
  coworker_runner: "Coworker Runner",
};

const MODEL_COLORS: Record<string, string> = {
  "claude-sonnet-4-6": "#B55239",
  "claude-haiku-4-5": "#D4956B",
  "gpt-4o": "#5B7B9A",
};

const TYPE_COLORS: Record<UsageType, string> = {
  chat: "#B55239",
  coworker_builder: "#D4956B",
  coworker_runner: "#7C8B6F",
};

const BAR_RADIUS: [number, number, number, number] = [0, 0, 0, 0];
const CHART_MARGIN = { top: 4, right: 4, left: 0, bottom: 0 };
const TICK_STYLE = { fontSize: 11 };
const CURSOR_STYLE = { fill: "var(--color-muted)", opacity: 0.4 };
const LEGEND_STYLE = { fontSize: 12, paddingTop: 12 };
const ZERO_SUMMARY = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const fullFormatter = new Intl.NumberFormat("en-US");

function formatCompact(n: number): string {
  return compactFormatter.format(n);
}

function formatFull(n: number): string {
  return fullFormatter.format(n);
}

function formatChartDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

const yAxisTickFormatter = (v: number) => formatCompact(v);
const tooltipElement = <CustomTooltip />;

function CustomTooltip({
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
        <div key={entry.name} className="flex items-center gap-2 py-0.5">
          <span
            className="inline-block size-2 shrink-0 rounded-full"
            style={colorStyle(entry.color)}
          />
          <span className="text-muted-foreground">{entry.name}</span>
          <span className="ml-auto font-medium tabular-nums">{formatFull(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

const colorStyleCache = new Map<string, CSSProperties>();
function colorStyle(color: string): CSSProperties {
  let cached = colorStyleCache.get(color);
  if (!cached) {
    cached = { backgroundColor: color };
    colorStyleCache.set(color, cached);
  }
  return cached;
}

export default function AdminUsagePage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<GroupBy>("model");

  const workspacesQuery = useAdminWorkspaces();
  const workspaces = useMemo(() => workspacesQuery.data ?? [], [workspacesQuery.data]);

  useEffect(() => {
    setWorkspaceId((current) => {
      if (current && workspaces.some((workspace) => workspace.id === current)) {
        return current;
      }
      return workspaces[0]?.id ?? null;
    });
  }, [workspaces]);

  const usageQuery = useAdminUsageDashboard(workspaceId);

  const handleGroupByChange = useCallback((value: string) => {
    setGroupBy(value as GroupBy);
  }, []);

  const summary = usageQuery.data?.summary ?? ZERO_SUMMARY;

  const { chartData, chartKeys, chartColors } = useMemo(() => {
    const byDate = new Map<string, Record<string, number>>();
    const keys = new Set<string>();
    const source =
      groupBy === "model" ? usageQuery.data?.dailyByModel : usageQuery.data?.dailyByType;

    for (const entry of source ?? []) {
      const typedEntry = entry as DailyByModelEntry | DailyByTypeEntry;
      const key =
        groupBy === "model"
          ? (typedEntry as DailyByModelEntry).model
          : TYPE_LABELS[(typedEntry as DailyByTypeEntry).type];
      keys.add(key);
      const existing = byDate.get(typedEntry.date) ?? {};
      existing[key] = (existing[key] ?? 0) + typedEntry.totalTokens;
      byDate.set(typedEntry.date, existing);
    }

    const data = [...byDate.entries()].toSorted(([dateA], [dateB]) => dateA.localeCompare(dateB));
    const mappedData = data.map(([date, values]) =>
      Object.assign({ date: formatChartDate(date) }, values),
    );

    const colors =
      groupBy === "model"
        ? MODEL_COLORS
        : Object.fromEntries(
            Object.entries(TYPE_COLORS).map(([key, value]) => [
              TYPE_LABELS[key as UsageType],
              value,
            ]),
          );

    return {
      chartData: mappedData,
      chartKeys: [...keys].toSorted(),
      chartColors: colors,
    };
  }, [groupBy, usageQuery.data]);

  const coworkerBreakdown = useMemo(() => {
    const rows = (usageQuery.data?.coworkerBreakdown ?? []) as CoworkerBreakdownEntry[];
    const grandTotal = rows.reduce((sum, row) => sum + row.totalTokens, 0);
    return rows.map((row) => ({
      name: row.name,
      type: TYPE_LABELS[row.type],
      input: row.inputTokens,
      output: row.outputTokens,
      total: row.totalTokens,
      pct: grandTotal > 0 ? (row.totalTokens / grandTotal) * 100 : 0,
    }));
  }, [usageQuery.data]);

  const maxTotal = Math.max(...coworkerBreakdown.map((row) => row.total), 1);
  const isLoading =
    workspacesQuery.isLoading ||
    (workspaces.length > 0 && !workspaceId) ||
    (Boolean(workspaceId) && usageQuery.isLoading && !usageQuery.data);
  const errorMessage = workspacesQuery.error
    ? getErrorMessage(workspacesQuery.error, "Failed to load workspaces.")
    : usageQuery.error
      ? getErrorMessage(usageQuery.error, "Failed to load usage data.")
      : null;

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
        <span className="sr-only">Loading usage dashboard</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Token Usage</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Token consumption across chat, coworker builder, and coworker runners.
          </p>
        </div>

        {workspaces.length > 0 ? (
          <Select value={workspaceId ?? undefined} onValueChange={setWorkspaceId}>
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {workspaces.map((workspace) => (
                <SelectItem key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="text-muted-foreground rounded-md border px-3 py-2 text-sm">
            No workspaces
          </div>
        )}
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="bg-muted/40 rounded-lg border px-4 py-3">
          <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
            Total tokens in
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {formatFull(summary.inputTokens)}
          </p>
        </div>
        <div className="bg-muted/40 rounded-lg border px-4 py-3">
          <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
            Total tokens out
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {formatFull(summary.outputTokens)}
          </p>
        </div>
        <div className="bg-muted/40 rounded-lg border px-4 py-3">
          <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
            Total tokens
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {formatFull(summary.totalTokens)}
          </p>
        </div>
      </div>

      <section className="bg-card rounded-lg border p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Usage over time</h3>
            <p className="text-muted-foreground mt-0.5 text-sm">
              Includes both input and output tokens.
            </p>
          </div>
          <Select value={groupBy} onValueChange={handleGroupByChange}>
            <SelectTrigger size="sm">
              <span className="text-muted-foreground mr-1 text-xs">Group by:</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="model">Model</SelectItem>
              <SelectItem value="type">Type</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {chartData.length === 0 ? (
          <div className="text-muted-foreground flex h-[380px] items-center justify-center text-sm">
            No usage data for this workspace in the last 30 days.
          </div>
        ) : (
          <div className="h-[380px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={CHART_MARGIN}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={TICK_STYLE}
                  tickLine={false}
                  axisLine={false}
                  className="fill-muted-foreground"
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickFormatter={yAxisTickFormatter}
                  tick={TICK_STYLE}
                  tickLine={false}
                  axisLine={false}
                  className="fill-muted-foreground"
                  width={48}
                />
                <Tooltip content={tooltipElement} cursor={CURSOR_STYLE} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={LEGEND_STYLE} />
                {chartKeys.map((key) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    stackId="a"
                    fill={chartColors[key] ?? "#94a3b8"}
                    radius={BAR_RADIUS}
                    maxBarSize={32}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="bg-card rounded-lg border p-5">
        <div className="mb-4">
          <h3 className="text-base font-semibold">Usage by Coworker</h3>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Token consumption broken down by individual coworker and chat.
          </p>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Coworker</th>
                <th className="px-3 py-2 text-left font-medium">Type</th>
                <th className="px-3 py-2 text-right font-medium">Input</th>
                <th className="px-3 py-2 text-right font-medium">Output</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="px-3 py-2 text-right font-medium">%</th>
                <th className="hidden px-3 py-2 sm:table-cell" />
              </tr>
            </thead>
            <tbody>
              {coworkerBreakdown.length === 0 ? (
                <tr className="border-t">
                  <td colSpan={7} className="text-muted-foreground px-3 py-8 text-center">
                    No usage data for this workspace in the last 30 days.
                  </td>
                </tr>
              ) : (
                coworkerBreakdown.map((row) => (
                  <CoworkerRow key={row.name} row={row} maxTotal={maxTotal} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

type BreakdownRow = {
  name: string;
  type: string;
  input: number;
  output: number;
  total: number;
  pct: number;
};

function CoworkerRow({ row, maxTotal }: { row: BreakdownRow; maxTotal: number }) {
  const barWidth = useMemo(
    () => ({ width: `${(row.total / maxTotal) * 100}%` }),
    [maxTotal, row.total],
  );

  return (
    <tr className="border-t">
      <td className="px-3 py-2 font-medium">
        {row.name.startsWith("@") ? <span className="text-[#B55239]">{row.name}</span> : row.name}
      </td>
      <td className="text-muted-foreground px-3 py-2">{row.type}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatFull(row.input)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatFull(row.output)}</td>
      <td className="px-3 py-2 text-right font-medium tabular-nums">{formatFull(row.total)}</td>
      <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
        {row.pct.toFixed(1)}%
      </td>
      <td className="hidden w-32 px-3 py-2 sm:table-cell">
        <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
          <div className="h-full rounded-full bg-[#B55239] transition-all" style={barWidth} />
        </div>
      </td>
    </tr>
  );
}
