import { and, asc, count, eq, gte, lt } from "drizzle-orm";
import { db } from "@cmdclaw/db/client";
import { user, userDailyActivity } from "@cmdclaw/db/schema";
import { env } from "../../env";
import { DAILY_TELEMETRY_DIGEST_JOB_NAME, getQueue } from "../queues";

const OPS_DAILY_DIGEST_CHANNEL_NAME = "ops-daily";
const OPS_DAILY_DIGEST_TIME = "09:00";
const DEFAULT_DIGEST_TIMEZONE = "Europe/Dublin";
const MAX_SIGNUP_PREVIEW_COUNT = 10;

export const DAILY_TELEMETRY_DIGEST_SCHEDULER_ID = "telemetry:daily-digest";

type SignupPreview = {
  id: string;
  email: string;
  name: string;
};

export type DailyTelemetryDigestSummary = {
  activityDate: string;
  newSignups: number;
  activeUsers: number;
  returningActiveUsers: number;
  signupsPreview: SignupPreview[];
};

function parseDigestTime(time: string): { hour: number; minute: number } {
  const [hour, minute] = time.split(":").map((value) => Number(value));
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    throw new Error(`Invalid digest time "${time}"`);
  }

  return { hour, minute };
}

function resolveDigestTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || process.env.TZ || DEFAULT_DIGEST_TIMEZONE;
}

function formatLocalDate(dateValue: Date): string {
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, "0");
  const day = String(dateValue.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getPreviousDayWindow(now: Date): { start: Date; end: Date; activityDate: string } {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(end);
  start.setDate(start.getDate() - 1);
  return {
    start,
    end,
    activityDate: formatLocalDate(start),
  };
}

async function lookupSlackChannelIdByName(channelName: string): Promise<string> {
  if (!env.SLACK_BOT_TOKEN) {
    throw new Error("SLACK_BOT_TOKEN is required to post the daily telemetry digest");
  }

  const targetName = channelName.trim().replace(/^#/, "").toLowerCase();

  const lookupPage = async (cursor?: string): Promise<string> => {
    const params = new URLSearchParams({
      exclude_archived: "true",
      limit: "200",
      types: "public_channel,private_channel,mpim",
    });
    if (cursor) {
      params.set("cursor", cursor);
    }

    const response = await fetch(`https://slack.com/api/conversations.list?${params.toString()}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
      },
    });

    const result = (await response.json()) as {
      ok: boolean;
      error?: string;
      channels?: Array<{ id: string; name?: string; name_normalized?: string }>;
      response_metadata?: { next_cursor?: string };
    };

    if (!result.ok) {
      throw new Error(result.error ?? "Could not list Slack channels");
    }

    const match = result.channels?.find((channel) => {
      const name = channel.name_normalized ?? channel.name;
      return typeof name === "string" && name.trim().toLowerCase() === targetName;
    });
    if (match?.id) {
      return match.id;
    }

    const nextCursor = result.response_metadata?.next_cursor?.trim();
    if (!nextCursor) {
      throw new Error(`Slack channel not found: ${channelName}`);
    }

    return lookupPage(nextCursor);
  };

  return lookupPage();
}

async function postSlackMessage(channelId: string, text: string): Promise<void> {
  if (!env.SLACK_BOT_TOKEN) {
    throw new Error("SLACK_BOT_TOKEN is required to post the daily telemetry digest");
  }

  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel: channelId,
      text,
    }),
  });

  const result = (await response.json()) as { ok: boolean; error?: string };
  if (!result.ok) {
    throw new Error(result.error ?? "Could not post daily telemetry digest to Slack");
  }
}

export async function getDailyTelemetryDigestSummary(now = new Date()): Promise<DailyTelemetryDigestSummary> {
  const { start, end, activityDate } = getPreviousDayWindow(now);

  const [[{ value: newSignups }], [{ value: activeUsers }], [{ value: returningActiveUsers }], signupsPreview] =
    await Promise.all([
      db
        .select({ value: count() })
        .from(user)
        .where(and(gte(user.createdAt, start), lt(user.createdAt, end))),
      db
        .select({ value: count() })
        .from(userDailyActivity)
        .where(eq(userDailyActivity.activityDate, activityDate)),
      db
        .select({ value: count() })
        .from(userDailyActivity)
        .innerJoin(user, eq(userDailyActivity.userId, user.id))
        .where(and(eq(userDailyActivity.activityDate, activityDate), lt(user.createdAt, start))),
      db.query.user.findMany({
        where: and(gte(user.createdAt, start), lt(user.createdAt, end)),
        columns: {
          id: true,
          email: true,
          name: true,
        },
        orderBy: [asc(user.createdAt)],
        limit: MAX_SIGNUP_PREVIEW_COUNT,
      }),
    ]);

  return {
    activityDate,
    newSignups: Number(newSignups ?? 0),
    activeUsers: Number(activeUsers ?? 0),
    returningActiveUsers: Number(returningActiveUsers ?? 0),
    signupsPreview: signupsPreview.map((signup) => ({
      id: signup.id,
      email: signup.email,
      name: signup.name,
    })),
  };
}

export function buildDailyTelemetryDigestMessage(summary: DailyTelemetryDigestSummary): string {
  const lines = [
    `CmdClaw daily ops digest for ${summary.activityDate}`,
    "",
    `New signups: ${summary.newSignups}`,
    `Active users: ${summary.activeUsers}`,
    `Returning active users: ${summary.returningActiveUsers}`,
  ];

  if (summary.signupsPreview.length > 0) {
    lines.push("", "New signup preview:");
    for (const signup of summary.signupsPreview) {
      const label = signup.name.trim().length > 0 ? `${signup.name} <${signup.email}>` : signup.email;
      lines.push(`- ${label}`);
    }
  }

  return lines.join("\n");
}

export async function postDailyTelemetryDigest(now = new Date()): Promise<DailyTelemetryDigestSummary> {
  const summary = await getDailyTelemetryDigestSummary(now);
  const channelId = await lookupSlackChannelIdByName(OPS_DAILY_DIGEST_CHANNEL_NAME);
  await postSlackMessage(channelId, buildDailyTelemetryDigestMessage(summary));
  return summary;
}

export async function syncDailyTelemetryDigestJob(): Promise<void> {
  const { hour, minute } = parseDigestTime(OPS_DAILY_DIGEST_TIME);
  const queue = getQueue();
  await queue.upsertJobScheduler(
    DAILY_TELEMETRY_DIGEST_SCHEDULER_ID,
    {
      pattern: `${minute} ${hour} * * *`,
      tz: resolveDigestTimezone(),
    },
    {
      name: DAILY_TELEMETRY_DIGEST_JOB_NAME,
      data: {},
    },
  );
}
