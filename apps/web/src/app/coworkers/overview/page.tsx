"use client";

import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, Loader2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
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
// TanStack Table columns
// ---------------------------------------------------------------------------

type CoworkerRow = {
  id: string;
  name: string;
  username: string | null;
  status: string;
  triggerType: string;
  totalRuns: number;
  errorRuns: number;
  errorRate: number;
  consecutiveErrors: number;
  latestRunStatus: string | null;
  latestRunAt: Date | string | null;
  latestErrorMessage: string | null;
};

function SortableHeader({
  column,
  label,
}: {
  column: { getIsSorted: () => false | "asc" | "desc"; toggleSorting: () => void };
  label: string;
}) {
  const sorted = column.getIsSorted();
  const handleClick = useMemo(() => () => column.toggleSorting(), [column]);
  return (
    <button type="button" className="inline-flex items-center gap-1" onClick={handleClick}>
      {label}
      {sorted === "asc" ? (
        <ArrowUp className="size-3.5" />
      ) : sorted === "desc" ? (
        <ArrowDown className="size-3.5" />
      ) : (
        <ArrowUpDown className="text-muted-foreground/50 size-3.5" />
      )}
    </button>
  );
}

const columns: ColumnDef<CoworkerRow>[] = [
  {
    accessorKey: "name",
    header: "Name",
    enableSorting: false,
    cell: ({ row }) => (
      <Link
        href={`/coworkers/${row.original.id}`}
        className="font-medium underline-offset-2 hover:underline"
      >
        {row.original.name}
      </Link>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    enableSorting: false,
    cell: ({ row }) => {
      const isOn = row.original.status === "on";
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
            isOn
              ? "bg-green-500/10 text-green-600 dark:text-green-400"
              : "bg-muted text-muted-foreground",
          )}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              isOn ? "bg-green-500" : "bg-muted-foreground/50",
            )}
          />
          {isOn ? "On" : "Off"}
        </span>
      );
    },
  },
  {
    accessorKey: "triggerType",
    header: "Trigger",
    enableSorting: false,
    cell: ({ row }) => (
      <span className="text-muted-foreground">{getTriggerLabel(row.original.triggerType)}</span>
    ),
  },
  {
    accessorKey: "totalRuns",
    header: ({ column }) => <SortableHeader column={column} label="Runs" />,
    meta: { align: "right" },
    cell: ({ row }) => <span className="tabular-nums">{row.original.totalRuns}</span>,
  },
  {
    accessorKey: "errorRuns",
    header: ({ column }) => <SortableHeader column={column} label="Errors" />,
    meta: { align: "right" },
    cell: ({ row }) => <span className="tabular-nums">{row.original.errorRuns}</span>,
  },
  {
    accessorKey: "errorRate",
    header: ({ column }) => <SortableHeader column={column} label="Error Rate" />,
    meta: { align: "right" },
    cell: ({ row }) => (
      <span
        className={cn("tabular-nums", row.original.errorRate > 20 && "font-medium text-red-500")}
      >
        {row.original.errorRate}%
      </span>
    ),
  },
  {
    accessorKey: "latestRunAt",
    header: "Last Run",
    enableSorting: false,
    cell: ({ row }) => (
      <div className="text-muted-foreground flex items-center gap-2">
        <StatusDot status={row.original.latestRunStatus} />
        <span>{formatRelativeTime(row.original.latestRunAt)}</span>
      </div>
    ),
  },
  {
    accessorKey: "consecutiveErrors",
    header: ({ column }) => <SortableHeader column={column} label="Health" />,
    cell: ({ row }) => {
      const c = row.original;
      if (c.consecutiveErrors >= 3) {
        return (
          <span className="text-xs font-medium text-red-500">{c.consecutiveErrors}x failing</span>
        );
      }
      if (c.consecutiveErrors >= 1) {
        return (
          <span className="text-xs font-medium text-amber-500">{c.consecutiveErrors}x error</span>
        );
      }
      if (c.latestRunStatus === "completed") {
        return <span className="text-xs font-medium text-green-500">healthy</span>;
      }
      if (c.latestRunStatus === null) {
        return <span className="text-muted-foreground text-xs">no runs</span>;
      }
      return <span className="text-muted-foreground text-xs capitalize">{c.latestRunStatus}</span>;
    },
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CoworkerOverviewPage() {
  const { data, isLoading } = useCoworkerOverview();
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data: data?.coworkers ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

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
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b text-left">
                  {headerGroup.headers.map((header) => {
                    const align = (header.column.columnDef.meta as { align?: string })?.align;
                    return (
                      <th
                        key={header.id}
                        className={cn(
                          "px-4 py-3 font-medium",
                          align === "right" && "text-right",
                          header.column.getCanSort() && "cursor-pointer select-none",
                        )}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length > 0 ? (
                table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/30 border-b last:border-b-0">
                    {row.getVisibleCells().map((cell) => {
                      const align = (cell.column.columnDef.meta as { align?: string })?.align;
                      return (
                        <td
                          key={cell.id}
                          className={cn("px-4 py-3", align === "right" && "text-right")}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="text-muted-foreground px-4 py-8 text-center"
                  >
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
