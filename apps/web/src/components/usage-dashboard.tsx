"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import { type CSSProperties, useCallback, useMemo, useState } from "react";
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

type UsageType = "chat" | "coworker_builder" | "coworker_runner";
type GroupBy = "model" | "type" | "workspace";

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

type DailyByWorkspaceEntry = {
  date: string;
  workspace: string;
  totalTokens: number;
};

type CoworkerBreakdownEntry = {
  name: string;
  type: UsageType;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

type WorkspaceBreakdownEntry = {
  workspaceId: string;
  workspaceName: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type UsageDashboardData = {
  summary: { inputTokens: number; outputTokens: number; totalTokens: number };
  dailyByModel: DailyByModelEntry[];
  dailyByType: DailyByTypeEntry[];
  dailyByWorkspace: DailyByWorkspaceEntry[];
  coworkerBreakdown: CoworkerBreakdownEntry[];
  workspaceBreakdown: WorkspaceBreakdownEntry[];
};

export type UsageDashboardProps = {
  data: UsageDashboardData | undefined;
  isLoading: boolean;
  error: unknown;
  /** When provided, renders a workspace dropdown (admin mode). */
  workspaces?: Array<{ id: string; name: string }>;
  workspaceId?: string | null;
  onWorkspaceChange?: (id: string) => void;
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

const WORKSPACE_COLOR_PALETTE = [
  "#5B7B9A",
  "#B55239",
  "#D4956B",
  "#3E8E9E",
  "#6D5BD0",
  "#4F9D69",
  "#C06C84",
  "#8C6A5D",
];

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

function getModelColor(model: string): string {
  const override = MODEL_COLORS[model];
  if (override) {
    return override;
  }
  const shortModel = model.split("/").at(-1);
  if (shortModel && MODEL_COLORS[shortModel]) {
    return MODEL_COLORS[shortModel];
  }
  let hash = 0;
  for (let index = 0; index < model.length; index += 1) {
    hash = (hash * 31 + model.charCodeAt(index)) >>> 0;
  }
  return WORKSPACE_COLOR_PALETTE[hash % WORKSPACE_COLOR_PALETTE.length] ?? "#94a3b8";
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

export function UsageDashboard({
  data,
  isLoading,
  error,
  workspaces,
  workspaceId,
  onWorkspaceChange,
}: UsageDashboardProps) {
  const isMultiWorkspace = Boolean(workspaces && onWorkspaceChange);
  const isAllWorkspaces = isMultiWorkspace && workspaceId === "all";

  const [groupBy, setGroupBy] = useState<GroupBy>(isMultiWorkspace ? "workspace" : "model");

  const handleGroupByChange = useCallback((value: string) => {
    setGroupBy(value as GroupBy);
  }, []);

  const handleWorkspaceChange = useCallback(
    (id: string) => {
      onWorkspaceChange?.(id);
      if (id === "all" && groupBy !== "workspace") {
        setGroupBy("workspace");
      }
      if (id !== "all" && groupBy === "workspace") {
        setGroupBy("model");
      }
    },
    [groupBy, onWorkspaceChange],
  );

  const summary = data?.summary ?? ZERO_SUMMARY;

  const { chartData, chartKeys, chartColors } = useMemo(() => {
    const byDate = new Map<string, Record<string, number>>();
    const keys = new Set<string>();

    if (groupBy === "workspace") {
      for (const entry of (data?.dailyByWorkspace ?? []) as DailyByWorkspaceEntry[]) {
        keys.add(entry.workspace);
        const existing = byDate.get(entry.date) ?? {};
        existing[entry.workspace] = (existing[entry.workspace] ?? 0) + entry.totalTokens;
        byDate.set(entry.date, existing);
      }
    } else {
      const source = groupBy === "model" ? data?.dailyByModel : data?.dailyByType;

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
    }

    const sorted = [...byDate.entries()].toSorted(([dateA], [dateB]) => dateA.localeCompare(dateB));
    const mappedData = sorted.map(([date, values]) =>
      Object.assign({ date: formatChartDate(date) }, values),
    );

    const sortedKeys = [...keys].toSorted();

    let colors: Record<string, string>;
    if (groupBy === "workspace") {
      colors = Object.fromEntries(
        sortedKeys.map((key, i) => [
          key,
          WORKSPACE_COLOR_PALETTE[i % WORKSPACE_COLOR_PALETTE.length] ?? "#94a3b8",
        ]),
      );
    } else if (groupBy === "model") {
      colors = Object.fromEntries(sortedKeys.map((key) => [key, getModelColor(key)]));
    } else {
      colors = Object.fromEntries(
        Object.entries(TYPE_COLORS).map(([key, value]) => [TYPE_LABELS[key as UsageType], value]),
      );
    }

    return {
      chartData: mappedData,
      chartKeys: sortedKeys,
      chartColors: colors,
    };
  }, [groupBy, data]);

  const coworkerBreakdown = useMemo(() => {
    const rows = (data?.coworkerBreakdown ?? []) as CoworkerBreakdownEntry[];
    const grandTotal = rows.reduce((sum, row) => sum + row.totalTokens, 0);
    return rows.map((row) => ({
      name: row.name,
      type: TYPE_LABELS[row.type],
      input: row.inputTokens,
      output: row.outputTokens,
      total: row.totalTokens,
      pct: grandTotal > 0 ? (row.totalTokens / grandTotal) * 100 : 0,
    }));
  }, [data]);

  const workspaceBreakdown = useMemo(() => {
    const rows = (data?.workspaceBreakdown ?? []) as WorkspaceBreakdownEntry[];
    const grandTotal = rows.reduce((sum, row) => sum + row.totalTokens, 0);
    return rows.map((row) => ({
      workspaceId: row.workspaceId,
      name: row.workspaceName,
      input: row.inputTokens,
      output: row.outputTokens,
      total: row.totalTokens,
      pct: grandTotal > 0 ? (row.totalTokens / grandTotal) * 100 : 0,
    }));
  }, [data]);

  const maxCoworkerTotal = Math.max(...coworkerBreakdown.map((row) => row.total), 1);
  const maxWorkspaceTotal = Math.max(...workspaceBreakdown.map((row) => row.total), 1);
  const errorMessage = error ? getErrorMessage(error, "Failed to load usage data.") : null;

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

        {isMultiWorkspace ? (
          <Select value={workspaceId ?? "all"} onValueChange={handleWorkspaceChange}>
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Workspaces</SelectItem>
              {workspaces!.map((ws) => (
                <SelectItem key={ws.id} value={ws.id}>
                  {ws.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
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
              {isAllWorkspaces ? <SelectItem value="workspace">Workspace</SelectItem> : null}
              <SelectItem value="model">Model</SelectItem>
              <SelectItem value="type">Type</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {chartData.length === 0 ? (
          <div className="text-muted-foreground flex h-[380px] items-center justify-center text-sm">
            No usage data {!isAllWorkspaces && isMultiWorkspace ? "for this workspace " : ""}in the
            last 30 days.
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

      {isAllWorkspaces && workspaceBreakdown.length > 0 ? (
        <section className="bg-card rounded-lg border p-5">
          <div className="mb-4">
            <h3 className="text-base font-semibold">Usage by Workspace</h3>
            <p className="text-muted-foreground mt-0.5 text-sm">
              Token consumption broken down by workspace. Click a row to view details.
            </p>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Workspace</th>
                  <th className="px-3 py-2 text-right font-medium">Input</th>
                  <th className="px-3 py-2 text-right font-medium">Output</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2 text-right font-medium">%</th>
                  <th className="hidden px-3 py-2 sm:table-cell" />
                </tr>
              </thead>
              <tbody>
                {workspaceBreakdown.map((row) => (
                  <WorkspaceRow
                    key={row.workspaceId}
                    row={row}
                    maxTotal={maxWorkspaceTotal}
                    onSelect={handleWorkspaceChange}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

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
                    No usage data{" "}
                    {!isAllWorkspaces && isMultiWorkspace ? "for this workspace " : ""}in the last
                    30 days.
                  </td>
                </tr>
              ) : (
                coworkerBreakdown.map((row) => (
                  <CoworkerRow key={row.name} row={row} maxTotal={maxCoworkerTotal} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

type WorkspaceBreakdownRow = {
  workspaceId: string;
  name: string;
  input: number;
  output: number;
  total: number;
  pct: number;
};

function WorkspaceRow({
  row,
  maxTotal,
  onSelect,
}: {
  row: WorkspaceBreakdownRow;
  maxTotal: number;
  onSelect: (id: string) => void;
}) {
  const barWidth = useMemo(
    () => ({ width: `${(row.total / maxTotal) * 100}%` }),
    [maxTotal, row.total],
  );

  const handleClick = useCallback(() => {
    onSelect(row.workspaceId);
  }, [onSelect, row.workspaceId]);

  return (
    <tr
      className="group/ws hover:bg-muted/50 cursor-pointer border-t transition-colors"
      onClick={handleClick}
    >
      <td className="px-3 py-2 font-medium">
        <span className="inline-flex items-center gap-1.5">
          {row.name}
          <ArrowRight className="text-muted-foreground size-3 opacity-0 transition-opacity group-hover/ws:opacity-100" />
        </span>
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{formatFull(row.input)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatFull(row.output)}</td>
      <td className="px-3 py-2 text-right font-medium tabular-nums">{formatFull(row.total)}</td>
      <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
        {row.pct.toFixed(1)}%
      </td>
      <td className="hidden w-32 px-3 py-2 sm:table-cell">
        <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
          <div className="h-full rounded-full bg-[#5B7B9A] transition-all" style={barWidth} />
        </div>
      </td>
    </tr>
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
