import { db } from "@cmdclaw/db/client";
import { conversation, coworker, coworkerRun, generation, workspace } from "@cmdclaw/db/schema";
import { inArray, sql } from "drizzle-orm";

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

export async function queryUsageDashboard(dbInstance: typeof db, workspaceId?: string) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const workspaceFilter = workspaceId ? sql`and c.workspace_id = ${workspaceId}` : sql``;

  const usageRowsResult = await dbInstance.execute(sql`
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

    if (!workspaceId) {
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
      dailyByWorkspaceMap.set(dailyWsKey, (dailyByWorkspaceMap.get(dailyWsKey) ?? 0) + totalTokens);
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

  if (!workspaceId && workspaceBreakdownMap.size > 0) {
    const wsIds = [...workspaceBreakdownMap.keys()];
    const wsRows = await dbInstance
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
}
