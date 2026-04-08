import {
  SCHEDULED_COWORKER_JOB_NAME,
  buildQueueJobId,
  getQueue,
} from "@cmdclaw/core/server/queues";
import {
  billingLedger,
  conversation,
  coworker,
  coworkerRun,
  generation,
  message,
  user,
  workspace,
} from "@cmdclaw/db/schema";
import { ORPCError } from "@orpc/server";
import { eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, type AuthenticatedContext } from "../middleware";

async function requireAdmin(context: Pick<AuthenticatedContext, "db" | "user">) {
  const dbUser = await context.db.query.user.findFirst({
    where: eq(user.id, context.user.id),
    columns: { role: true },
  });

  if (dbUser?.role !== "admin") {
    throw new ORPCError("FORBIDDEN", { message: "Admin access required" });
  }
}

type CoworkerSchedule =
  | { type: "interval"; intervalMinutes: number }
  | { type: "daily"; time: string; timezone?: string }
  | { type: "weekly"; time: string; daysOfWeek: number[]; timezone?: string }
  | { type: "monthly"; time: string; dayOfMonth: number; timezone?: string };

function parseCoworkerSchedule(value: unknown): CoworkerSchedule | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const schedule = value as Record<string, unknown>;

  if (schedule.type === "interval" && typeof schedule.intervalMinutes === "number") {
    return { type: "interval", intervalMinutes: schedule.intervalMinutes };
  }

  if (
    schedule.type === "daily" &&
    typeof schedule.time === "string" &&
    (schedule.timezone === undefined || typeof schedule.timezone === "string")
  ) {
    return {
      type: "daily",
      time: schedule.time,
      timezone: schedule.timezone,
    };
  }

  if (
    schedule.type === "weekly" &&
    typeof schedule.time === "string" &&
    Array.isArray(schedule.daysOfWeek) &&
    schedule.daysOfWeek.every((day) => typeof day === "number") &&
    (schedule.timezone === undefined || typeof schedule.timezone === "string")
  ) {
    return {
      type: "weekly",
      time: schedule.time,
      daysOfWeek: schedule.daysOfWeek as number[],
      timezone: schedule.timezone,
    };
  }

  if (
    schedule.type === "monthly" &&
    typeof schedule.time === "string" &&
    typeof schedule.dayOfMonth === "number" &&
    (schedule.timezone === undefined || typeof schedule.timezone === "string")
  ) {
    return {
      type: "monthly",
      time: schedule.time,
      dayOfMonth: schedule.dayOfMonth,
      timezone: schedule.timezone,
    };
  }

  return null;
}

type UsageType = "chat" | "coworker_builder" | "coworker_runner";

type UsageRow = {
  date: string;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  runnerName: string | null;
  isBuilder: boolean | null;
  workspaceId: string;
};

function getUsageType(row: UsageRow): UsageType {
  if (row.runnerName) {
    return "coworker_runner";
  }
  if (row.isBuilder) {
    return "coworker_builder";
  }
  return "chat";
}

const getUsageDashboard = protectedProcedure
  .input(
    z.object({
      workspaceId: z.string().min(1).optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    await requireAdmin(context);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const workspaceFilter = input.workspaceId
      ? sql`and c.workspace_id = ${input.workspaceId}`
      : sql``;

    const usageRowsResult = await context.db.execute(sql`
      select
        to_char(g.started_at, 'YYYY-MM-DD') as "date",
        c.model as "model",
        coalesce(g.input_tokens, 0)::int as "inputTokens",
        coalesce(g.output_tokens, 0)::int as "outputTokens",
        runner."runnerName" as "runnerName",
        builder."isBuilder" as "isBuilder",
        c.workspace_id as "workspaceId"
      from ${generation} g
      join ${conversation} c on c.id = g.conversation_id
      left join lateral (
        select
          coalesce(cw.username, cw.name) as "runnerName"
        from ${coworkerRun} r
        join ${coworker} cw on cw.id = r.coworker_id
        where r.generation_id = g.id
        limit 1
      ) runner on true
      left join lateral (
        select true as "isBuilder"
        from ${coworker} builder_cw
        where builder_cw.builder_conversation_id = c.id
        limit 1
      ) builder on runner."runnerName" is null
      where g.started_at >= ${thirtyDaysAgo}
        ${workspaceFilter}
      order by g.started_at asc, c.model asc nulls last
    `);

    const usageRows = (usageRowsResult.rows ?? []) as UsageRow[];

    const summary = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };
    const dailyByModelMap = new Map<string, number>();
    const dailyByTypeMap = new Map<string, number>();
    const coworkerBreakdownMap = new Map<
      string,
      {
        name: string;
        type: UsageType;
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
      }
    >();
    const workspaceBreakdownMap = new Map<
      string,
      { inputTokens: number; outputTokens: number; totalTokens: number }
    >();
    const dailyByWorkspaceMap = new Map<string, number>();

    for (const row of usageRows) {
      const inputTokens = row.inputTokens ?? 0;
      const outputTokens = row.outputTokens ?? 0;
      const totalTokens = inputTokens + outputTokens;
      const usageType = getUsageType(row);
      const model = row.model ?? "unknown";

      summary.inputTokens += inputTokens;
      summary.outputTokens += outputTokens;
      summary.totalTokens += totalTokens;

      const dailyModelKey = `${row.date}::${model}`;
      dailyByModelMap.set(dailyModelKey, (dailyByModelMap.get(dailyModelKey) ?? 0) + totalTokens);

      const dailyTypeKey = `${row.date}::${usageType}`;
      dailyByTypeMap.set(dailyTypeKey, (dailyByTypeMap.get(dailyTypeKey) ?? 0) + totalTokens);

      const name =
        usageType === "coworker_runner"
          ? row.runnerName!
          : usageType === "coworker_builder"
            ? "Coworker Builder"
            : "Chat (direct)";

      const existing = coworkerBreakdownMap.get(name) ?? {
        name,
        type: usageType,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      };
      existing.inputTokens += inputTokens;
      existing.outputTokens += outputTokens;
      existing.totalTokens += totalTokens;
      coworkerBreakdownMap.set(name, existing);

      if (!input.workspaceId) {
        const wsEntry = workspaceBreakdownMap.get(row.workspaceId) ?? {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
        };
        wsEntry.inputTokens += inputTokens;
        wsEntry.outputTokens += outputTokens;
        wsEntry.totalTokens += totalTokens;
        workspaceBreakdownMap.set(row.workspaceId, wsEntry);

        const dailyWsKey = `${row.date}::${row.workspaceId}`;
        dailyByWorkspaceMap.set(
          dailyWsKey,
          (dailyByWorkspaceMap.get(dailyWsKey) ?? 0) + totalTokens,
        );
      }
    }

    const dailyByModel = [...dailyByModelMap.entries()]
      .map(([key, totalTokens]) => {
        const [date, model] = key.split("::");
        return { date: date!, model: model!, totalTokens };
      })
      .toSorted((a, b) => a.date.localeCompare(b.date) || a.model.localeCompare(b.model));

    const dailyByType = [...dailyByTypeMap.entries()]
      .map(([key, totalTokens]) => {
        const [date, type] = key.split("::");
        return { date: date!, type: type as UsageType, totalTokens };
      })
      .toSorted((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));

    const coworkerBreakdown = [...coworkerBreakdownMap.values()].toSorted(
      (a, b) => b.totalTokens - a.totalTokens || a.name.localeCompare(b.name),
    );

    let workspaceBreakdown: Array<{
      workspaceId: string;
      workspaceName: string;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    }> = [];

    let dailyByWorkspace: Array<{
      date: string;
      workspace: string;
      totalTokens: number;
    }> = [];

    if (!input.workspaceId && workspaceBreakdownMap.size > 0) {
      const wsIds = [...workspaceBreakdownMap.keys()];
      const wsRows = await context.db
        .select({ id: workspace.id, name: workspace.name })
        .from(workspace)
        .where(inArray(workspace.id, wsIds));
      const wsNameMap = new Map(wsRows.map((row) => [row.id, row.name]));

      workspaceBreakdown = wsIds
        .map((wsId) => {
          const entry = workspaceBreakdownMap.get(wsId)!;
          return {
            workspaceId: wsId,
            workspaceName: wsNameMap.get(wsId) ?? wsId,
            inputTokens: entry.inputTokens,
            outputTokens: entry.outputTokens,
            totalTokens: entry.totalTokens,
          };
        })
        .toSorted((a, b) => b.totalTokens - a.totalTokens);

      dailyByWorkspace = [...dailyByWorkspaceMap.entries()]
        .map(([key, totalTokens]) => {
          const [date, wsId] = key.split("::");
          return {
            date: date!,
            workspace: wsNameMap.get(wsId!) ?? wsId!,
            totalTokens,
          };
        })
        .toSorted((a, b) => a.date.localeCompare(b.date) || a.workspace.localeCompare(b.workspace));
    }

    return {
      summary,
      dailyByModel,
      dailyByType,
      dailyByWorkspace,
      coworkerBreakdown,
      workspaceBreakdown,
    };
  });

const generationDurationMsSql = sql<number>`
  coalesce(
    (m.timing->>'generationDurationMs')::numeric,
    (m.timing->>'endToEndDurationMs')::numeric
  )
`;

const getOpsScheduledCoworkers = protectedProcedure.handler(async ({ context }) => {
  await requireAdmin(context);

  const coworkers = await context.db.query.coworker.findMany({
    where: eq(coworker.triggerType, "schedule"),
    columns: {
      id: true,
      name: true,
      username: true,
      status: true,
      schedule: true,
      updatedAt: true,
    },
    orderBy: (table, { asc }) => [asc(table.name), asc(table.id)],
  });

  const latestRunResult =
    coworkers.length > 0
      ? await context.db.execute(sql`
          select distinct on (r.coworker_id)
            r.coworker_id as "coworkerId",
            r.id as "runId",
            r.status as "status",
            r.started_at as "startedAt",
            r.finished_at as "finishedAt",
            r.error_message as "errorMessage"
          from ${coworkerRun} r
          where r.coworker_id in ${sql.raw(`(${coworkers.map((row) => `'${row.id}'`).join(",")})`)}
          order by r.coworker_id, r.started_at desc
        `)
      : null;

  const latestRunRows = (latestRunResult?.rows ?? []) as Array<{
    coworkerId: string;
    runId: string;
    status: string;
    startedAt: Date;
    finishedAt: Date | null;
    errorMessage: string | null;
  }>;

  const latestRunByCoworkerId = new Map(latestRunRows.map((row) => [row.coworkerId, row]));

  return coworkers.map((row) => {
    const schedule = parseCoworkerSchedule(row.schedule);
    const latestRun = latestRunByCoworkerId.get(row.id) ?? null;

    return {
      id: row.id,
      name: row.name,
      username: row.username,
      status: row.status,
      schedule,
      isHourlyInterval: schedule?.type === "interval" && schedule.intervalMinutes === 60,
      updatedAt: row.updatedAt,
      latestRun: latestRun
        ? {
            id: latestRun.runId,
            status: latestRun.status,
            startedAt: latestRun.startedAt,
            finishedAt: latestRun.finishedAt,
            errorMessage: latestRun.errorMessage,
          }
        : null,
    };
  });
});

const enqueueScheduledCoworkersNow = protectedProcedure
  .input(
    z.object({
      ids: z.array(z.string().min(1)).min(1).max(100),
    }),
  )
  .handler(async ({ context, input }) => {
    await requireAdmin(context);

    const uniqueIds = [...new Set(input.ids)];
    const rows = await context.db.query.coworker.findMany({
      where: inArray(coworker.id, uniqueIds),
      columns: {
        id: true,
        name: true,
        status: true,
        triggerType: true,
        schedule: true,
      },
    });

    const rowById = new Map(rows.map((row) => [row.id, row]));
    const queue = getQueue();
    const batchStartedAt = Date.now();
    const scheduledFor = new Date(batchStartedAt).toISOString();
    const results = await Promise.all(
      uniqueIds.map(async (id, index) => {
        const row = rowById.get(id);
        if (!row) {
          return { id, ok: false as const, reason: "not_found" };
        }

        if (row.triggerType !== "schedule") {
          return {
            id,
            ok: false as const,
            reason: "not_scheduled",
            name: row.name,
          };
        }

        if (row.status !== "on") {
          return { id, ok: false as const, reason: "off", name: row.name };
        }

        const schedule = parseCoworkerSchedule(row.schedule);
        if (!schedule) {
          return {
            id,
            ok: false as const,
            reason: "invalid_schedule",
            name: row.name,
          };
        }

        const jobId = buildQueueJobId([
          "admin-ops-scheduled-coworker",
          row.id,
          batchStartedAt,
          index + 1,
        ]);

        await queue.add(
          SCHEDULED_COWORKER_JOB_NAME,
          {
            source: "schedule",
            coworkerId: row.id,
            scheduleType: schedule.type,
            scheduledFor,
          },
          {
            jobId,
            removeOnComplete: true,
            removeOnFail: 200,
          },
        );

        return {
          id,
          ok: true as const,
          name: row.name,
          jobId,
          scheduleType: schedule.type,
        };
      }),
    );

    return {
      scheduledFor,
      enqueuedCount: results.filter((result) => result.ok).length,
      skippedCount: results.filter((result) => !result.ok).length,
      results,
    };
  });

const getChatOverview = protectedProcedure.handler(async ({ context }) => {
  await requireAdmin(context);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // 1. Summary stats
  const summaryResult = await context.db.execute(sql`
    select
      count(distinct g.conversation_id) filter (where g.started_at >= ${thirtyDaysAgo})::int as "totalConversations30d",
      count(g.id) filter (where g.started_at >= ${thirtyDaysAgo})::int as "totalGenerations30d",
      count(g.id) filter (where g.status = 'running')::int as "activeGenerations",
      count(g.id) filter (where g.status = 'error' and g.started_at >= ${thirtyDaysAgo})::int as "errorGenerations30d",
      coalesce(avg(extract(epoch from (g.completed_at - g.started_at)) * 1000)
        filter (where g.status = 'completed' and g.completed_at is not null and g.started_at >= ${thirtyDaysAgo}), 0)::int as "avgGenerationMs"
    from ${generation} g
    join ${conversation} c on c.id = g.conversation_id
    where c.type = 'chat'
      and (g.started_at >= ${thirtyDaysAgo} or g.status = 'running')
  `);

  const summaryRow = (summaryResult.rows?.[0] ?? {}) as {
    totalConversations30d: number;
    totalGenerations30d: number;
    activeGenerations: number;
    errorGenerations30d: number;
    avgGenerationMs: number;
  };

  const errorRate =
    summaryRow.totalGenerations30d > 0
      ? Math.round((summaryRow.errorGenerations30d / summaryRow.totalGenerations30d) * 100)
      : 0;

  // 2. Daily generation breakdown
  const dailyResult = await context.db.execute(sql`
    select
      to_char(g.started_at, 'YYYY-MM-DD') as "date",
      count(*) filter (where g.status = 'completed')::int as "completed",
      count(*) filter (where g.status = 'error')::int as "error",
      count(*) filter (where g.status = 'cancelled')::int as "cancelled",
      count(*) filter (where g.status = 'running')::int as "running",
      count(*) filter (where g.status not in ('completed', 'error', 'cancelled', 'running'))::int as "other"
    from ${generation} g
    join ${conversation} c on c.id = g.conversation_id
    where c.type = 'chat' and g.started_at >= ${thirtyDaysAgo}
    group by to_char(g.started_at, 'YYYY-MM-DD')
    order by "date" asc
  `);
  const dailyGenerations = (dailyResult.rows ?? []) as Array<{
    date: string;
    completed: number;
    error: number;
    cancelled: number;
    running: number;
    other: number;
  }>;

  // 3. Stuck generations (running > 10 min)
  const stuckResult = await context.db.execute(sql`
    select
      g.id as "generationId",
      g.conversation_id as "conversationId",
      c.title as "conversationTitle",
      c.model,
      c.user_id as "userId",
      u.email as "userEmail",
      g.started_at as "startedAt",
      extract(epoch from (now() - g.started_at))::int as "runningSeconds"
    from ${generation} g
    join ${conversation} c on c.id = g.conversation_id
    left join ${user} u on u.id = c.user_id
    where g.status = 'running'
      and g.started_at < now() - interval '10 minutes'
      and c.type = 'chat'
    order by g.started_at asc
    limit 50
  `);
  const stuckGenerations = (stuckResult.rows ?? []) as Array<{
    generationId: string;
    conversationId: string;
    conversationTitle: string | null;
    model: string | null;
    userId: string | null;
    userEmail: string | null;
    startedAt: Date;
    runningSeconds: number;
  }>;

  // 4. Conversations with >= 3 errors in 24h
  const repeatedResult = await context.db.execute(sql`
    select
      c.id as "conversationId",
      c.title as "conversationTitle",
      c.model,
      c.user_id as "userId",
      u.email as "userEmail",
      count(g.id)::int as "recentErrors"
    from ${generation} g
    join ${conversation} c on c.id = g.conversation_id
    left join ${user} u on u.id = c.user_id
    where g.status = 'error'
      and g.started_at >= now() - interval '24 hours'
      and c.type = 'chat'
    group by c.id, c.title, c.model, c.user_id, u.email
    having count(g.id) >= 3
    order by count(g.id) desc
    limit 20
  `);
  const repeatedFailures = (repeatedResult.rows ?? []) as Array<{
    conversationId: string;
    conversationTitle: string | null;
    model: string | null;
    userId: string | null;
    userEmail: string | null;
    recentErrors: number;
  }>;

  // 5. Model usage breakdown (30d)
  const modelResult = await context.db.execute(sql`
    select
      c.model,
      count(g.id)::int as "totalGenerations",
      count(g.id) filter (where g.status = 'error')::int as "errors",
      coalesce(avg(g.input_tokens + g.output_tokens)::int, 0) as "avgTokens",
      coalesce(avg(extract(epoch from (g.completed_at - g.started_at)) * 1000)
        filter (where g.status = 'completed' and g.completed_at is not null), 0)::int as "avgDurationMs"
    from ${generation} g
    join ${conversation} c on c.id = g.conversation_id
    where c.type = 'chat' and g.started_at >= ${thirtyDaysAgo}
    group by c.model
    order by count(g.id) desc
  `);
  const modelBreakdownRaw = (modelResult.rows ?? []) as Array<{
    model: string | null;
    totalGenerations: number;
    errors: number;
    avgTokens: number;
    avgDurationMs: number;
  }>;
  const modelBreakdown = modelBreakdownRaw.map((m) => {
    const errorRate =
      m.totalGenerations > 0 ? Math.round((m.errors / m.totalGenerations) * 100) : 0;
    return {
      model: m.model ?? "unknown",
      totalGenerations: m.totalGenerations,
      errors: m.errors,
      errorRate,
      avgTokens: m.avgTokens,
      avgDurationMs: m.avgDurationMs,
    };
  });

  // 6. Recent errors (last 25)
  const errorsResult = await context.db.execute(sql`
    select
      g.id as "generationId",
      g.conversation_id as "conversationId",
      c.title as "conversationTitle",
      c.model,
      c.user_id as "userId",
      u.email as "userEmail",
      g.error_message as "errorMessage",
      g.started_at as "startedAt",
      g.completed_at as "errorAt",
      g.input_tokens as "inputTokens",
      g.output_tokens as "outputTokens"
    from ${generation} g
    join ${conversation} c on c.id = g.conversation_id
    left join ${user} u on u.id = c.user_id
    where g.status = 'error' and c.type = 'chat'
    order by g.completed_at desc nulls last
    limit 25
  `);
  const recentErrors = (errorsResult.rows ?? []) as Array<{
    generationId: string;
    conversationId: string;
    conversationTitle: string | null;
    model: string | null;
    userId: string | null;
    userEmail: string | null;
    errorMessage: string | null;
    startedAt: Date | null;
    errorAt: Date | null;
    inputTokens: number;
    outputTokens: number;
  }>;

  return {
    summary: { ...summaryRow, errorRate },
    dailyGenerations,
    stuckGenerations,
    repeatedFailures,
    modelBreakdown,
    recentErrors,
  };
});

const getPerformanceDashboard = protectedProcedure
  .input(z.object({ days: z.enum(["1", "7", "30"]).default("7") }))
  .handler(async ({ context, input }) => {
    await requireAdmin(context);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(input.days));

    // 1. Summary stats: P50/P95 end-to-end, P50 TTFVO, sandbox reuse rate, total count
    const summaryResult = await context.db.execute(sql`
      select
        count(*)::int as "totalMessages",
        percentile_cont(0.5) within group (
          order by ${generationDurationMsSql}
        )::int as "p50EndToEndMs",
        percentile_cont(0.95) within group (
          order by ${generationDurationMsSql}
        )::int as "p95EndToEndMs",
        percentile_cont(0.5) within group (
          order by (m.timing->'phaseDurationsMs'->>'promptToFirstVisibleOutputMs')::numeric
        )::int as "p50TtfvoMs",
        count(*) filter (
          where m.timing->>'sandboxStartupMode' = 'reused'
        )::int as "sandboxReusedCount",
        count(*) filter (
          where m.timing->>'sandboxStartupMode' is not null
        )::int as "sandboxTotalCount"
      from ${message} m
      where m.role = 'assistant'
        and m.timing is not null
        and ${generationDurationMsSql} is not null
        and m.created_at >= ${cutoffDate}
    `);
    const summaryRow = (summaryResult.rows?.[0] ?? {}) as {
      totalMessages: number;
      p50EndToEndMs: number;
      p95EndToEndMs: number;
      p50TtfvoMs: number;
      sandboxReusedCount: number;
      sandboxTotalCount: number;
    };
    const sandboxReuseRate =
      summaryRow.sandboxTotalCount > 0
        ? Math.round((summaryRow.sandboxReusedCount / summaryRow.sandboxTotalCount) * 100)
        : 0;

    // 2. Latency over time: daily P50/P95 end-to-end + P50 TTFVO
    const latencyResult = await context.db.execute(sql`
      select
        to_char(m.created_at, 'YYYY-MM-DD') as "date",
        count(*)::int as "messageCount",
        percentile_cont(0.5) within group (
          order by ${generationDurationMsSql}
        )::int as "p50EndToEndMs",
        percentile_cont(0.95) within group (
          order by ${generationDurationMsSql}
        )::int as "p95EndToEndMs",
        percentile_cont(0.5) within group (
          order by (m.timing->'phaseDurationsMs'->>'promptToFirstVisibleOutputMs')::numeric
        )::int as "p50TtfvoMs"
      from ${message} m
      where m.role = 'assistant'
        and m.timing is not null
        and ${generationDurationMsSql} is not null
        and m.created_at >= ${cutoffDate}
      group by to_char(m.created_at, 'YYYY-MM-DD')
      order by "date" asc
    `);
    const latencyOverTime = (latencyResult.rows ?? []) as Array<{
      date: string;
      messageCount: number;
      p50EndToEndMs: number;
      p95EndToEndMs: number;
      p50TtfvoMs: number;
    }>;

    // 3. Phase breakdown: average time per execution phase
    const phaseResult = await context.db.execute(sql`
      select
        coalesce(avg((m.timing->'phaseDurationsMs'->>'sandboxConnectOrCreateMs')::numeric), 0)::int as "avgSandboxConnectMs",
        coalesce(avg((m.timing->'phaseDurationsMs'->>'opencodeReadyMs')::numeric), 0)::int as "avgOpencodeReadyMs",
        coalesce(avg((m.timing->'phaseDurationsMs'->>'sessionReadyMs')::numeric), 0)::int as "avgSessionReadyMs",
        coalesce(avg((m.timing->'phaseDurationsMs'->>'prePromptSetupMs')::numeric), 0)::int as "avgPrePromptSetupMs",
        coalesce(avg((m.timing->'phaseDurationsMs'->>'waitForFirstEventMs')::numeric), 0)::int as "avgWaitForFirstEventMs",
        coalesce(avg((m.timing->'phaseDurationsMs'->>'promptToFirstTokenMs')::numeric), 0)::int as "avgPromptToFirstTokenMs",
        coalesce(avg((m.timing->'phaseDurationsMs'->>'modelStreamMs')::numeric), 0)::int as "avgModelStreamMs",
        coalesce(avg((m.timing->'phaseDurationsMs'->>'postProcessingMs')::numeric), 0)::int as "avgPostProcessingMs"
      from ${message} m
      where m.role = 'assistant'
        and m.timing is not null
        and m.timing->'phaseDurationsMs' is not null
        and m.created_at >= ${cutoffDate}
    `);
    const phaseBreakdown = (phaseResult.rows?.[0] ?? {}) as {
      avgSandboxConnectMs: number;
      avgOpencodeReadyMs: number;
      avgSessionReadyMs: number;
      avgPrePromptSetupMs: number;
      avgWaitForFirstEventMs: number;
      avgPromptToFirstTokenMs: number;
      avgModelStreamMs: number;
      avgPostProcessingMs: number;
    };

    // 4. Model comparison: per-model latency stats via billing_ledger for actual model used
    const modelResult = await context.db.execute(sql`
      select
        bl.model,
        count(*)::int as "generationCount",
        percentile_cont(0.5) within group (
          order by ${generationDurationMsSql}
        )::int as "p50EndToEndMs",
        percentile_cont(0.95) within group (
          order by ${generationDurationMsSql}
        )::int as "p95EndToEndMs",
        percentile_cont(0.5) within group (
          order by (m.timing->'phaseDurationsMs'->>'promptToFirstVisibleOutputMs')::numeric
        )::int as "p50TtfvoMs",
        coalesce(avg(bl.input_tokens + bl.output_tokens), 0)::int as "avgTokens"
      from ${billingLedger} bl
      join ${generation} g on g.id = bl.generation_id
      join ${message} m on m.id = g.message_id
      where m.role = 'assistant'
        and m.timing is not null
        and ${generationDurationMsSql} is not null
        and m.created_at >= ${cutoffDate}
      group by bl.model
      order by count(*) desc
    `);
    const modelComparison = (modelResult.rows ?? []) as Array<{
      model: string;
      generationCount: number;
      p50EndToEndMs: number;
      p95EndToEndMs: number;
      p50TtfvoMs: number;
      avgTokens: number;
    }>;

    // 5. Sandbox reuse rate over time
    const sandboxResult = await context.db.execute(sql`
      select
        to_char(m.created_at, 'YYYY-MM-DD') as "date",
        count(*) filter (where m.timing->>'sandboxStartupMode' = 'reused')::int as "reused",
        count(*) filter (where m.timing->>'sandboxStartupMode' = 'created')::int as "created",
        count(*)::int as "total"
      from ${message} m
      where m.role = 'assistant'
        and m.timing is not null
        and m.timing->>'sandboxStartupMode' is not null
        and m.created_at >= ${cutoffDate}
      group by to_char(m.created_at, 'YYYY-MM-DD')
      order by "date" asc
    `);
    const sandboxOverTime = (sandboxResult.rows ?? []) as Array<{
      date: string;
      reused: number;
      created: number;
      total: number;
    }>;

    // 6. Sandbox latency impact: reused vs created
    const sandboxImpactResult = await context.db.execute(sql`
      select
        m.timing->>'sandboxStartupMode' as "mode",
        count(*)::int as "count",
        percentile_cont(0.5) within group (
          order by (m.timing->'phaseDurationsMs'->>'sandboxConnectOrCreateMs')::numeric
        )::int as "p50SandboxMs",
        percentile_cont(0.5) within group (
          order by ${generationDurationMsSql}
        )::int as "p50EndToEndMs"
      from ${message} m
      where m.role = 'assistant'
        and m.timing is not null
        and m.timing->>'sandboxStartupMode' in ('reused', 'created')
        and m.created_at >= ${cutoffDate}
      group by m.timing->>'sandboxStartupMode'
    `);
    const sandboxImpact = (sandboxImpactResult.rows ?? []) as Array<{
      mode: string;
      count: number;
      p50SandboxMs: number;
      p50EndToEndMs: number;
    }>;

    // 7. Slowest generations for investigation (includes full timing for flame chart)
    const slowestResult = await context.db.execute(sql`
      select
        g.id as "generationId",
        g.conversation_id as "conversationId",
        c.title as "conversationTitle",
        c.user_id as "userId",
        u.email as "userEmail",
        bl.model,
        ${generationDurationMsSql}::int as "endToEndMs",
        (m.timing->'phaseDurationsMs'->>'sandboxConnectOrCreateMs')::int as "sandboxMs",
        (m.timing->'phaseDurationsMs'->>'modelStreamMs')::int as "modelStreamMs",
        (m.timing->'phaseDurationsMs'->>'promptToFirstVisibleOutputMs')::int as "ttfvoMs",
        m.timing->>'sandboxStartupMode' as "sandboxMode",
        g.input_tokens as "inputTokens",
        g.output_tokens as "outputTokens",
        m.created_at as "createdAt",
        m.timing as "timing"
      from ${message} m
      join ${generation} g on g.message_id = m.id
      join ${conversation} c on c.id = g.conversation_id
      left join ${user} u on u.id = c.user_id
      left join ${billingLedger} bl on bl.generation_id = g.id
      where m.role = 'assistant'
        and m.timing is not null
        and ${generationDurationMsSql} is not null
        and m.created_at >= ${cutoffDate}
      order by ${generationDurationMsSql} desc
      limit 20
    `);
    const slowestGenerations = (slowestResult.rows ?? []) as Array<{
      generationId: string;
      conversationId: string;
      conversationTitle: string | null;
      userId: string | null;
      userEmail: string | null;
      model: string | null;
      endToEndMs: number;
      sandboxMs: number | null;
      modelStreamMs: number | null;
      ttfvoMs: number | null;
      sandboxMode: string | null;
      inputTokens: number;
      outputTokens: number;
      createdAt: Date;
      timing: Record<string, unknown>;
    }>;

    // 8. Daily phase percentiles: P50/P95 per phase per day for trend charts
    const dailyPhaseResult = await context.db.execute(sql`
      select
        to_char(m.created_at, 'YYYY-MM-DD') as "date",
        percentile_cont(0.5) within group (
          order by (m.timing->'phaseDurationsMs'->>'sandboxConnectOrCreateMs')::numeric
        )::int as "p50SandboxConnectMs",
        percentile_cont(0.95) within group (
          order by (m.timing->'phaseDurationsMs'->>'sandboxConnectOrCreateMs')::numeric
        )::int as "p95SandboxConnectMs",
        percentile_cont(0.5) within group (
          order by (m.timing->'phaseDurationsMs'->>'opencodeReadyMs')::numeric
        )::int as "p50OpencodeReadyMs",
        percentile_cont(0.95) within group (
          order by (m.timing->'phaseDurationsMs'->>'opencodeReadyMs')::numeric
        )::int as "p95OpencodeReadyMs",
        percentile_cont(0.5) within group (
          order by (m.timing->'phaseDurationsMs'->>'sessionReadyMs')::numeric
        )::int as "p50SessionReadyMs",
        percentile_cont(0.95) within group (
          order by (m.timing->'phaseDurationsMs'->>'sessionReadyMs')::numeric
        )::int as "p95SessionReadyMs",
        percentile_cont(0.5) within group (
          order by (m.timing->'phaseDurationsMs'->>'prePromptSetupMs')::numeric
        )::int as "p50PrePromptSetupMs",
        percentile_cont(0.95) within group (
          order by (m.timing->'phaseDurationsMs'->>'prePromptSetupMs')::numeric
        )::int as "p95PrePromptSetupMs",
        percentile_cont(0.5) within group (
          order by (m.timing->'phaseDurationsMs'->>'waitForFirstEventMs')::numeric
        )::int as "p50WaitForFirstEventMs",
        percentile_cont(0.95) within group (
          order by (m.timing->'phaseDurationsMs'->>'waitForFirstEventMs')::numeric
        )::int as "p95WaitForFirstEventMs",
        percentile_cont(0.5) within group (
          order by (m.timing->'phaseDurationsMs'->>'promptToFirstTokenMs')::numeric
        )::int as "p50PromptToFirstTokenMs",
        percentile_cont(0.95) within group (
          order by (m.timing->'phaseDurationsMs'->>'promptToFirstTokenMs')::numeric
        )::int as "p95PromptToFirstTokenMs",
        percentile_cont(0.5) within group (
          order by (m.timing->'phaseDurationsMs'->>'modelStreamMs')::numeric
        )::int as "p50ModelStreamMs",
        percentile_cont(0.95) within group (
          order by (m.timing->'phaseDurationsMs'->>'modelStreamMs')::numeric
        )::int as "p95ModelStreamMs",
        percentile_cont(0.5) within group (
          order by (m.timing->'phaseDurationsMs'->>'postProcessingMs')::numeric
        )::int as "p50PostProcessingMs",
        percentile_cont(0.95) within group (
          order by (m.timing->'phaseDurationsMs'->>'postProcessingMs')::numeric
        )::int as "p95PostProcessingMs"
      from ${message} m
      where m.role = 'assistant'
        and m.timing is not null
        and m.timing->'phaseDurationsMs' is not null
        and m.created_at >= ${cutoffDate}
      group by to_char(m.created_at, 'YYYY-MM-DD')
      order by "date" asc
    `);
    type DailyPhaseRow = {
      date: string;
      p50SandboxConnectMs: number;
      p95SandboxConnectMs: number;
      p50OpencodeReadyMs: number;
      p95OpencodeReadyMs: number;
      p50SessionReadyMs: number;
      p95SessionReadyMs: number;
      p50PrePromptSetupMs: number;
      p95PrePromptSetupMs: number;
      p50WaitForFirstEventMs: number;
      p95WaitForFirstEventMs: number;
      p50PromptToFirstTokenMs: number;
      p95PromptToFirstTokenMs: number;
      p50ModelStreamMs: number;
      p95ModelStreamMs: number;
      p50PostProcessingMs: number;
      p95PostProcessingMs: number;
    };
    const dailyPhases = (dailyPhaseResult.rows ?? []) as DailyPhaseRow[];

    return {
      summary: {
        totalMessages: summaryRow.totalMessages,
        p50EndToEndMs: summaryRow.p50EndToEndMs,
        p95EndToEndMs: summaryRow.p95EndToEndMs,
        p50TtfvoMs: summaryRow.p50TtfvoMs,
        sandboxReuseRate,
      },
      latencyOverTime,
      phaseBreakdown,
      modelComparison,
      sandboxOverTime,
      sandboxImpact,
      slowestGenerations,
      dailyPhases,
    };
  });

export const adminRouter = {
  getChatOverview,
  getUsageDashboard,
  getPerformanceDashboard,
  getOpsScheduledCoworkers,
  enqueueScheduledCoworkersNow,
};
