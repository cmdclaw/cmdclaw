export type CoworkerRecentRun = {
  id: string;
  status: string;
  startedAt?: Date | string | null;
  conversationId?: string | null;
  source?: string;
};

export type CoworkerWithRecentRuns = {
  id: string;
  name?: string | null;
  recentRuns?: CoworkerRecentRun[];
};

export type FlattenedCoworkerRecentRun = CoworkerRecentRun & {
  coworkerId: string;
  coworkerName: string;
};

function getRunTimestamp(value?: Date | string | null): number {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function getCoworkerName(name?: string | null): string {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "Untitled";
}

export function flattenCoworkerRecentRuns(
  coworkers: CoworkerWithRecentRuns[] | undefined,
): FlattenedCoworkerRecentRun[] {
  const list = Array.isArray(coworkers) ? coworkers : [];

  return list
    .flatMap((coworker) =>
      (coworker.recentRuns ?? []).map((run) => ({
        id: run.id,
        status: run.status,
        startedAt: run.startedAt,
        conversationId: run.conversationId ?? null,
        source: run.source,
        coworkerId: coworker.id,
        coworkerName: getCoworkerName(coworker.name),
      })),
    )
    .toSorted((left, right) => getRunTimestamp(right.startedAt) - getRunTimestamp(left.startedAt));
}
