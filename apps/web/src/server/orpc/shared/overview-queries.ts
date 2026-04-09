import { db } from "@cmdclaw/db/client";
import { coworker, coworkerRun, workspace } from "@cmdclaw/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

type CoworkerOverviewResult = {
  summary: {
    totalCoworkers: number;
    activeCoworkers: number;
    totalRuns30d: number;
    errorRuns30d: number;
    errorRate: number;
  };
  dailyRuns: Array<{
    date: string;
    completed: number;
    error: number;
    running: number;
    other: number;
  }>;
  dailyRunsByWorkspace: Array<{
    date: string;
    workspace: string;
    total: number;
  }>;
  workspaceBreakdown: Array<{
    workspaceId: string;
    workspaceName: string;
    totalCoworkers: number;
    activeCoworkers: number;
    totalRuns: number;
    errorRuns: number;
    errorRate: number;
  }>;
  coworkers: Array<{
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
    latestRunAt: Date | null;
    latestErrorMessage: string | null;
    workspaceId?: string;
    workspaceName?: string;
  }>;
};

/**
 * Query coworker overview data.
 * - When ownerId is set, scopes to that user's coworkers (workspace user mode).
 * - When ownerId is omitted, returns all coworkers (admin mode).
 * - When workspaceId is set, scopes to that workspace.
 * - When workspaceId is omitted (admin + no filter), aggregates across all workspaces.
 */
export async function queryCoworkerOverview(
  dbInstance: typeof db,
  opts: { workspaceId?: string; ownerId?: string },
): Promise<CoworkerOverviewResult> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Build coworker filter conditions
  const conditions = [];
  if (opts.ownerId) {
    conditions.push(eq(coworker.ownerId, opts.ownerId));
  }
  if (opts.workspaceId) {
    conditions.push(eq(coworker.workspaceId, opts.workspaceId));
  }

  const coworkers = await dbInstance.query.coworker.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    columns: {
      id: true,
      name: true,
      status: true,
      triggerType: true,
      username: true,
      workspaceId: true,
    },
  });

  const emptyResult: CoworkerOverviewResult = {
    summary: {
      totalCoworkers: 0,
      activeCoworkers: 0,
      totalRuns30d: 0,
      errorRuns30d: 0,
      errorRate: 0,
    },
    dailyRuns: [],
    dailyRunsByWorkspace: [],
    workspaceBreakdown: [],
    coworkers: [],
  };

  if (coworkers.length === 0) {
    return emptyResult;
  }

  const coworkerIds = coworkers.map((c) => c.id);
  const coworkerIdsIn = sql.raw(`(${coworkerIds.map((id) => `'${id}'`).join(",")})`);

  // Build run filter
  const runOwnerFilter = opts.ownerId ? sql`and owner_id = ${opts.ownerId}` : sql``;
  const runWorkspaceFilter = opts.workspaceId ? sql`and workspace_id = ${opts.workspaceId}` : sql``;

  // Daily aggregation by status
  const dailyResult = await dbInstance.execute(sql`
    select
      to_char(started_at, 'YYYY-MM-DD') as "date",
      count(*) filter (where status = 'completed')::int as "completed",
      count(*) filter (where status = 'error')::int as "error",
      count(*) filter (where status = 'running')::int as "running",
      count(*) filter (where status not in ('completed', 'error', 'running'))::int as "other"
    from ${coworkerRun}
    where coworker_id in ${coworkerIdsIn}
      ${runOwnerFilter}
      ${runWorkspaceFilter}
      and started_at >= ${thirtyDaysAgo}
    group by to_char(started_at, 'YYYY-MM-DD')
    order by "date" asc
  `);
  const dailyRuns = (dailyResult.rows ?? []) as CoworkerOverviewResult["dailyRuns"];

  // Daily aggregation by workspace (only when viewing all workspaces)
  let dailyRunsByWorkspace: CoworkerOverviewResult["dailyRunsByWorkspace"] = [];
  if (!opts.workspaceId) {
    const dailyWsResult = await dbInstance.execute(sql`
      select
        to_char(r.started_at, 'YYYY-MM-DD') as "date",
        w.name as "workspace",
        count(*)::int as "total"
      from ${coworkerRun} r
      join ${workspace} w on w.id = r.workspace_id
      where r.coworker_id in ${coworkerIdsIn}
        ${runOwnerFilter}
        and r.started_at >= ${thirtyDaysAgo}
      group by to_char(r.started_at, 'YYYY-MM-DD'), w.name
      order by "date" asc, "workspace" asc
    `);
    dailyRunsByWorkspace = (dailyWsResult.rows ??
      []) as CoworkerOverviewResult["dailyRunsByWorkspace"];
  }

  // Per-coworker stats
  const perCoworkerResult = await dbInstance.execute(sql`
    select
      coworker_id as "coworkerId",
      count(*)::int as "totalRuns",
      count(*) filter (where status = 'error')::int as "errorRuns"
    from ${coworkerRun}
    where coworker_id in ${coworkerIdsIn}
      ${runOwnerFilter}
      ${runWorkspaceFilter}
      and started_at >= ${thirtyDaysAgo}
    group by coworker_id
  `);
  const perCoworkerStats = new Map(
    (
      (perCoworkerResult.rows ?? []) as Array<{
        coworkerId: string;
        totalRuns: number;
        errorRuns: number;
      }>
    ).map((r) => [r.coworkerId, r]),
  );

  // Latest run per coworker
  const latestResult = await dbInstance.execute(sql`
    select distinct on (coworker_id)
      coworker_id as "coworkerId",
      status,
      started_at as "startedAt",
      error_message as "errorMessage"
    from ${coworkerRun}
    where coworker_id in ${coworkerIdsIn}
      ${runOwnerFilter}
      ${runWorkspaceFilter}
    order by coworker_id, started_at desc
  `);
  const latestRuns = new Map(
    (
      (latestResult.rows ?? []) as Array<{
        coworkerId: string;
        status: string;
        startedAt: Date;
        errorMessage: string | null;
      }>
    ).map((r) => [r.coworkerId, r]),
  );

  // Consecutive error streaks
  const streakResult = await dbInstance.execute(sql`
    select coworker_id as "coworkerId", status
    from (
      select coworker_id, status, started_at,
        row_number() over (partition by coworker_id order by started_at desc) as rn
      from ${coworkerRun}
      where coworker_id in ${coworkerIdsIn}
        ${runOwnerFilter}
        ${runWorkspaceFilter}
    ) t
    where rn <= 20
    order by coworker_id, started_at desc
  `);
  const streakRows = (streakResult.rows ?? []) as Array<{
    coworkerId: string;
    status: string;
  }>;
  const consecutiveErrorMap = new Map<string, number>();
  {
    let currentId = "";
    let count = 0;
    let counting = true;
    for (const row of streakRows) {
      if (row.coworkerId !== currentId) {
        if (currentId) {
          consecutiveErrorMap.set(currentId, count);
        }
        currentId = row.coworkerId;
        count = 0;
        counting = true;
      }
      if (counting) {
        if (row.status === "error") {
          count++;
        } else {
          counting = false;
        }
      }
    }
    if (currentId) {
      consecutiveErrorMap.set(currentId, count);
    }
  }

  // Resolve workspace names if showing all workspaces
  let wsNameMap = new Map<string, string>();
  if (!opts.workspaceId) {
    const wsIds = [...new Set(coworkers.map((c) => c.workspaceId).filter(Boolean))] as string[];
    if (wsIds.length > 0) {
      const wsRows = await dbInstance
        .select({ id: workspace.id, name: workspace.name })
        .from(workspace)
        .where(inArray(workspace.id, wsIds));
      wsNameMap = new Map(wsRows.map((row) => [row.id, row.name]));
    }
  }

  // Build per-coworker response
  const coworkerData = coworkers.map((c) => {
    const stats = perCoworkerStats.get(c.id);
    const latest = latestRuns.get(c.id);
    const totalRuns = stats?.totalRuns ?? 0;
    const errorRuns = stats?.errorRuns ?? 0;
    const wsId = c.workspaceId ?? "";
    return {
      id: c.id,
      name: c.name,
      username: c.username,
      status: c.status as string,
      triggerType: c.triggerType,
      totalRuns,
      errorRuns,
      errorRate: totalRuns > 0 ? Math.round((errorRuns / totalRuns) * 100) : 0,
      consecutiveErrors: consecutiveErrorMap.get(c.id) ?? 0,
      latestRunStatus: latest?.status ?? null,
      latestRunAt: latest?.startedAt ?? null,
      latestErrorMessage: latest?.errorMessage ?? null,
      workspaceId: !opts.workspaceId ? wsId : undefined,
      workspaceName: !opts.workspaceId ? (wsNameMap.get(wsId) ?? wsId) : undefined,
    };
  });

  coworkerData.sort(
    (a, b) => b.consecutiveErrors - a.consecutiveErrors || b.errorRate - a.errorRate,
  );

  const totalRuns30d = dailyRuns.reduce(
    (s, d) => s + d.completed + d.error + d.running + d.other,
    0,
  );
  const errorRuns30d = dailyRuns.reduce((s, d) => s + d.error, 0);

  // Build workspace breakdown if viewing all workspaces
  let workspaceBreakdown: CoworkerOverviewResult["workspaceBreakdown"] = [];
  if (!opts.workspaceId) {
    const wsMap = new Map<
      string,
      { total: number; active: number; runs: number; errors: number }
    >();
    for (const c of coworkers) {
      const wsId = c.workspaceId ?? "";
      const entry = wsMap.get(wsId) ?? { total: 0, active: 0, runs: 0, errors: 0 };
      entry.total++;
      if (c.status === "on") {
        entry.active++;
      }
      const stats = perCoworkerStats.get(c.id);
      entry.runs += stats?.totalRuns ?? 0;
      entry.errors += stats?.errorRuns ?? 0;
      wsMap.set(wsId, entry);
    }
    workspaceBreakdown = [...wsMap.entries()]
      .map(([wsId, entry]) => ({
        workspaceId: wsId,
        workspaceName: wsNameMap.get(wsId) ?? wsId,
        totalCoworkers: entry.total,
        activeCoworkers: entry.active,
        totalRuns: entry.runs,
        errorRuns: entry.errors,
        errorRate: entry.runs > 0 ? Math.round((entry.errors / entry.runs) * 100) : 0,
      }))
      .toSorted((a, b) => b.totalRuns - a.totalRuns);
  }

  return {
    summary: {
      totalCoworkers: coworkers.length,
      activeCoworkers: coworkers.filter((c) => c.status === "on").length,
      totalRuns30d,
      errorRuns30d,
      errorRate: totalRuns30d > 0 ? Math.round((errorRuns30d / totalRuns30d) * 100) : 0,
    },
    dailyRuns,
    dailyRunsByWorkspace,
    workspaceBreakdown,
    coworkers: coworkerData,
  };
}
