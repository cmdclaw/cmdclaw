import { count, eq } from "drizzle-orm";
import { db } from "@cmdclaw/db/client";
import { session, user, userDailyActivity } from "@cmdclaw/db/schema";
import { captureUserActiveToday, captureUserSignedUp } from "./posthog";
import { postSignupSlackNotification } from "./telemetry-slack";

type GenericContextValue = Record<string, unknown>;

type TrackSignupFromSessionParams = {
  session: Pick<typeof session.$inferInsert, "userId" | "createdAt">;
  context?: unknown;
};

type RecordUserActiveTodayParams = {
  userId: string;
  workspaceId?: string | null;
  occurredAt?: Date;
};

function asRecord(value: unknown): GenericContextValue | null {
  return value && typeof value === "object" ? (value as GenericContextValue) : null;
}

function pickString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function resolveContextProperty(context: unknown, keys: string[]): unknown {
  let current: unknown = context;

  for (const key of keys) {
    const record = asRecord(current);
    if (!record) {
      return undefined;
    }
    current = record[key];
  }

  return current;
}

export function inferSignupMethod(context?: unknown): string | undefined {
  const provider =
    pickString(resolveContextProperty(context, ["body", "provider"])) ??
    pickString(resolveContextProperty(context, ["params", "provider"])) ??
    pickString(resolveContextProperty(context, ["query", "provider"])) ??
    pickString(resolveContextProperty(context, ["request", "body", "provider"]));

  if (provider) {
    return provider.toLowerCase();
  }

  const pathCandidate =
    pickString(resolveContextProperty(context, ["path"])) ??
    pickString(resolveContextProperty(context, ["url", "pathname"])) ??
    pickString(resolveContextProperty(context, ["request", "url"]));

  if (!pathCandidate) {
    return undefined;
  }

  const normalizedPath = pathCandidate.toLowerCase();
  if (normalizedPath.includes("magic-link")) {
    return "email";
  }

  if (normalizedPath.includes("social")) {
    return "social";
  }

  return undefined;
}

export function formatLocalDate(dateValue: Date): string {
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, "0");
  const day = String(dateValue.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function trackSignupFromSession(params: TrackSignupFromSessionParams): Promise<boolean> {
  const [{ value: sessionCount }] = await db
    .select({ value: count() })
    .from(session)
    .where(eq(session.userId, params.session.userId));

  if (Number(sessionCount ?? 0) !== 1) {
    return false;
  }

  const existingUser = await db.query.user.findFirst({
    where: eq(user.id, params.session.userId),
    columns: {
      email: true,
      name: true,
    },
  });

  if (!existingUser?.email) {
    return false;
  }

  const signupMethod = inferSignupMethod(params.context);
  const occurredAt = params.session.createdAt ?? new Date();
  const telemetryResults = await Promise.allSettled([
    captureUserSignedUp({
      distinctId: params.session.userId,
      email: existingUser.email,
      name: existingUser.name,
      signupMethod,
    }),
    postSignupSlackNotification({
      email: existingUser.email,
      name: existingUser.name,
      signupMethod,
      userId: params.session.userId,
      occurredAt,
    }),
  ]);

  const errors = telemetryResults
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) => result.reason);

  if (errors.length > 0) {
    throw new AggregateError(errors, "Failed to emit signup telemetry");
  }

  return true;
}

export async function recordUserActiveToday(
  params: RecordUserActiveTodayParams,
): Promise<{ created: boolean; activityDate: string }> {
  const occurredAt = params.occurredAt ?? new Date();
  const activityDate = formatLocalDate(occurredAt);

  const inserted = await db
    .insert(userDailyActivity)
    .values({
      userId: params.userId,
      activityDate,
      firstSeenAt: occurredAt,
      source: "web",
    })
    .onConflictDoNothing()
    .returning({
      userId: userDailyActivity.userId,
    });

  if (inserted.length === 0) {
    return { created: false, activityDate };
  }

  await captureUserActiveToday({
    distinctId: params.userId,
    activityDate,
    workspaceId: params.workspaceId,
  });

  return { created: true, activityDate };
}
