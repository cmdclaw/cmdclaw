"use client";

import { useCallback, useMemo, useState } from "react";
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

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const WORKSPACES = [
  { id: "ws-1", name: "Acme Corp" },
  { id: "ws-2", name: "Startup Labs" },
  { id: "ws-3", name: "Personal" },
];

type UsageType = "chat" | "coworker_builder" | "coworker_runner";

type MockEntry = {
  date: string;
  model: string;
  type: UsageType;
  inputTokens: number;
  outputTokens: number;
  coworkerUsername?: string;
  workspaceId: string;
};

const MODELS = ["claude-sonnet-4-6", "claude-haiku-4-5", "gpt-4o"];
const COWORKERS: Array<{ username: string; type: UsageType }> = [
  { username: "@email-handler", type: "coworker_runner" },
  { username: "@slack-bot", type: "coworker_runner" },
  { username: "@daily-reporter", type: "coworker_runner" },
  { username: "@code-reviewer", type: "coworker_runner" },
];

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

function generateMockData(): MockEntry[] {
  const entries: MockEntry[] = [];
  const rand = seededRandom(42);

  for (let d = 0; d < 30; d++) {
    const date = `2026-03-${String(d + 1).padStart(2, "0")}`;

    for (const ws of WORKSPACES) {
      const wsMultiplier = ws.id === "ws-1" ? 1 : ws.id === "ws-2" ? 0.6 : 0.25;

      // Chat entries — spread across models
      for (const model of MODELS) {
        const modelWeight =
          model === "claude-sonnet-4-6" ? 1 : model === "claude-haiku-4-5" ? 0.7 : 0.3;
        const input = Math.floor(rand() * 80_000 * wsMultiplier * modelWeight + 5_000);
        const output = Math.floor(input * (0.15 + rand() * 0.2));
        entries.push({
          date,
          model,
          type: "chat",
          inputTokens: input,
          outputTokens: output,
          workspaceId: ws.id,
        });
      }

      // Coworker builder entries (less frequent, mostly sonnet)
      if (rand() > 0.4) {
        const input = Math.floor(rand() * 40_000 * wsMultiplier + 2_000);
        const output = Math.floor(input * (0.25 + rand() * 0.15));
        entries.push({
          date,
          model: "claude-sonnet-4-6",
          type: "coworker_builder",
          inputTokens: input,
          outputTokens: output,
          workspaceId: ws.id,
        });
      }

      // Coworker runner entries
      for (const cw of COWORKERS) {
        if (rand() > 0.3) {
          const model = MODELS[Math.floor(rand() * MODELS.length)]!;
          const input = Math.floor(rand() * 60_000 * wsMultiplier + 3_000);
          const output = Math.floor(input * (0.1 + rand() * 0.25));
          entries.push({
            date,
            model,
            type: "coworker_runner",
            inputTokens: input,
            outputTokens: output,
            coworkerUsername: cw.username,
            workspaceId: ws.id,
          });
        }
      }
    }
  }

  return entries;
}

const MOCK_DATA = generateMockData();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

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
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const yAxisTickFormatter = (v: number) => formatCompact(v);

// ---------------------------------------------------------------------------
// Chart tooltip
// ---------------------------------------------------------------------------

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

// Cache for color styles to avoid creating new objects on every render
const colorStyleCache = new Map<string, React.CSSProperties>();
function colorStyle(color: string): React.CSSProperties {
  let cached = colorStyleCache.get(color);
  if (!cached) {
    cached = { backgroundColor: color };
    colorStyleCache.set(color, cached);
  }
  return cached;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type GroupBy = "model" | "type";

export default function AdminUsagePage() {
  const [workspaceId, setWorkspaceId] = useState(WORKSPACES[0]!.id);
  const [groupBy, setGroupBy] = useState<GroupBy>("model");

  const handleGroupByChange = useCallback((v: string) => {
    setGroupBy(v as GroupBy);
  }, []);

  // Filter entries for selected workspace
  const wsEntries = useMemo(
    () => MOCK_DATA.filter((e) => e.workspaceId === workspaceId),
    [workspaceId],
  );

  // Summary totals
  const totals = useMemo(() => {
    let input = 0;
    let output = 0;
    for (const e of wsEntries) {
      input += e.inputTokens;
      output += e.outputTokens;
    }
    return { input, output, total: input + output };
  }, [wsEntries]);

  // Chart data — aggregate per date, grouped by model or type
  const { chartData, chartKeys, chartColors } = useMemo(() => {
    const byDate = new Map<string, Record<string, number>>();
    const keys = new Set<string>();

    for (const e of wsEntries) {
      const key = groupBy === "model" ? e.model : TYPE_LABELS[e.type];
      keys.add(key);
      const existing = byDate.get(e.date) ?? {};
      existing[key] = (existing[key] ?? 0) + e.inputTokens + e.outputTokens;
      byDate.set(e.date, existing);
    }

    const sortedDates = [...byDate.keys()].toSorted();
    const data = sortedDates.map((date) =>
      Object.assign({ date: formatChartDate(date) }, byDate.get(date)),
    );

    const sortedKeys = [...keys].toSorted();
    const colors: Record<string, string> =
      groupBy === "model"
        ? MODEL_COLORS
        : Object.fromEntries(
            Object.entries(TYPE_COLORS).map(([k, v]) => [TYPE_LABELS[k as UsageType], v]),
          );

    return { chartData: data, chartKeys: sortedKeys, chartColors: colors };
  }, [wsEntries, groupBy]);

  // Per-coworker breakdown
  const coworkerBreakdown = useMemo(() => {
    const map = new Map<string, { type: string; input: number; output: number }>();

    for (const e of wsEntries) {
      const label =
        e.type === "coworker_runner" && e.coworkerUsername
          ? e.coworkerUsername
          : e.type === "coworker_builder"
            ? "Coworker Builder"
            : "Chat (direct)";
      const typeLabel = TYPE_LABELS[e.type];
      const existing = map.get(label) ?? { type: typeLabel, input: 0, output: 0 };
      existing.input += e.inputTokens;
      existing.output += e.outputTokens;
      map.set(label, existing);
    }

    const rows = [...map.entries()]
      .map(([name, data]) => ({
        name,
        type: data.type,
        input: data.input,
        output: data.output,
        total: data.input + data.output,
      }))
      .toSorted((a, b) => b.total - a.total);

    const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);
    return rows.map((r) => {
      return {
        name: r.name,
        type: r.type,
        input: r.input,
        output: r.output,
        total: r.total,
        pct: grandTotal > 0 ? (r.total / grandTotal) * 100 : 0,
      };
    });
  }, [wsEntries]);

  const maxTotal = Math.max(...coworkerBreakdown.map((r) => r.total), 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Token Usage</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Token consumption across chat, coworker builder, and coworker runners.
          </p>
        </div>
        <Select value={workspaceId} onValueChange={setWorkspaceId}>
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WORKSPACES.map((ws) => (
              <SelectItem key={ws.id} value={ws.id}>
                {ws.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="bg-muted/40 rounded-lg border px-4 py-3">
          <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
            Total tokens in
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatFull(totals.input)}</p>
        </div>
        <div className="bg-muted/40 rounded-lg border px-4 py-3">
          <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
            Total tokens out
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatFull(totals.output)}</p>
        </div>
        <div className="bg-muted/40 rounded-lg border px-4 py-3">
          <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
            Total tokens
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatFull(totals.total)}</p>
        </div>
      </div>

      {/* Bar chart */}
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
      </section>

      {/* Per-coworker breakdown */}
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
              {coworkerBreakdown.map((row) => (
                <CoworkerRow key={row.name} row={row} maxTotal={maxTotal} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table row component (extracted to avoid inline style objects)
// ---------------------------------------------------------------------------

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
    [row.total, maxTotal],
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
