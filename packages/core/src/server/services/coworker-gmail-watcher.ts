import { and, eq, sql } from "drizzle-orm";
import { db } from "@cmdclaw/db/client";
import { integration, integrationToken, coworker, coworkerRun } from "@cmdclaw/db/schema";
import { getValidAccessToken } from "../integrations/token-refresh";
import { buildQueueJobId, GMAIL_COWORKER_JOB_NAME, getQueue } from "../queues";

const GMAIL_TRIGGER_TYPE = "gmail.new_email";
const DEFAULT_POLL_INTERVAL_MS = 2 * 60 * 1000;
const DEFAULT_LOOKBACK_SECONDS = 120;
const GMAIL_LIST_LIMIT = 10;

type WatchableCoworker = {
  coworkerId: string;
  integrationId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
};

type GmailListResponse = {
  messages?: Array<{ id: string; threadId?: string }>;
};

type GmailMessageResponse = {
  id: string;
  threadId?: string;
  internalDate?: string;
  snippet?: string;
  payload?: {
    headers?: Array<{ name?: string; value?: string }>;
  };
};

type GmailMessageSummary = {
  id: string;
  threadId: string | null;
  internalDateMs: number;
  snippet: string;
  subject: string | null;
  from: string | null;
  date: string | null;
};

function getPollIntervalMs(): number {
  const raw = Number(process.env.GMAIL_WATCHER_INTERVAL_SECONDS ?? "");
  if (!Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_POLL_INTERVAL_MS;
  }
  return Math.floor(raw * 1000);
}

function getHeaderValue(
  headers: Array<{ name?: string; value?: string }> | undefined,
  headerName: string,
): string | null {
  const item = headers?.find((header) => header.name?.toLowerCase() === headerName.toLowerCase());
  return item?.value ?? null;
}

function isGmailAuthError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : JSON.stringify(error);

  return (
    message.includes("invalid_grant") ||
    message.includes("UNAUTHENTICATED") ||
    message.includes("Invalid Credentials") ||
    message.includes("401")
  );
}

async function disableBrokenGmailIntegration(integrationId: string, reason: string): Promise<void> {
  await db
    .update(integration)
    .set({
      enabled: false,
      updatedAt: new Date(),
    })
    .where(eq(integration.id, integrationId));

  console.warn(
    `[coworker-gmail-watcher] disabled gmail integration ${integrationId} due to auth failure (${reason}); reconnect required`,
  );
}

async function listWatchableCoworkers(): Promise<WatchableCoworker[]> {
  const rows = await db
    .select({
      coworkerId: coworker.id,
      integrationId: integration.id,
      accessToken: integrationToken.accessToken,
      refreshToken: integrationToken.refreshToken,
      expiresAt: integrationToken.expiresAt,
    })
    .from(coworker)
    .innerJoin(
      integration,
      and(
        eq(integration.userId, coworker.ownerId),
        eq(integration.type, "google_gmail"),
        eq(integration.enabled, true),
      ),
    )
    .innerJoin(integrationToken, eq(integrationToken.integrationId, integration.id))
    .where(and(eq(coworker.status, "on"), eq(coworker.triggerType, GMAIL_TRIGGER_TYPE)));

  return rows;
}

async function getCoworkerLastProcessedInternalDate(coworkerId: string): Promise<number | null> {
  const result = await db
    .select({
      maxInternalDate: sql<
        string | null
      >`max(((${coworkerRun.triggerPayload} ->> 'gmailInternalDate')::bigint)::text)`,
    })
    .from(coworkerRun)
    .where(
      and(
        eq(coworkerRun.coworkerId, coworkerId),
        sql`${coworkerRun.triggerPayload} ->> 'source' = ${GMAIL_TRIGGER_TYPE}`,
      ),
    );

  const value = result[0]?.maxInternalDate;
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

async function hasRunForGmailMessage(coworkerId: string, gmailMessageId: string): Promise<boolean> {
  const rows = await db
    .select({ id: coworkerRun.id })
    .from(coworkerRun)
    .where(
      and(
        eq(coworkerRun.coworkerId, coworkerId),
        sql`${coworkerRun.triggerPayload} ->> 'gmailMessageId' = ${gmailMessageId}`,
      ),
    )
    .limit(1);

  return rows.length > 0;
}

async function listRecentGmailMessages(
  accessToken: string,
  afterSeconds: number,
): Promise<string[]> {
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  url.searchParams.set("maxResults", String(GMAIL_LIST_LIMIT));
  url.searchParams.set("q", `after:${afterSeconds}`);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gmail list request failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as GmailListResponse;
  return (data.messages ?? []).map((message) => message.id);
}

async function getGmailMessageSummary(
  accessToken: string,
  messageId: string,
): Promise<GmailMessageSummary | null> {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`);
  url.searchParams.set("format", "metadata");
  url.searchParams.set("metadataHeaders", "Subject");
  url.searchParams.set("metadataHeaders", "From");
  url.searchParams.set("metadataHeaders", "Date");

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gmail get request failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as GmailMessageResponse;
  const internalDateMs = Number.parseInt(data.internalDate ?? "", 10);
  if (!Number.isFinite(internalDateMs)) {
    return null;
  }

  return {
    id: data.id,
    threadId: data.threadId ?? null,
    internalDateMs,
    snippet: data.snippet ?? "",
    subject: getHeaderValue(data.payload?.headers, "Subject"),
    from: getHeaderValue(data.payload?.headers, "From"),
    date: getHeaderValue(data.payload?.headers, "Date"),
  };
}

async function triggerCoworkerFromGmailMessage(
  coworkerId: string,
  message: GmailMessageSummary,
): Promise<void> {
  const queue = getQueue();
  await queue.add(
    GMAIL_COWORKER_JOB_NAME,
    {
      coworkerId,
      triggerPayload: {
        source: GMAIL_TRIGGER_TYPE,
        coworkerId,
        gmailMessageId: message.id,
        gmailThreadId: message.threadId,
        gmailInternalDate: message.internalDateMs,
        from: message.from,
        subject: message.subject,
        date: message.date,
        snippet: message.snippet,
        watchedAt: new Date().toISOString(),
      },
    },
    {
      jobId: buildQueueJobId(["coworker-gmail", coworkerId, message.id]),
      attempts: 20,
      backoff: {
        type: "exponential",
        delay: 10_000,
      },
      removeOnComplete: true,
    },
  );
}

export async function pollGmailCoworkerTriggers(): Promise<{
  checked: number;
  enqueued: number;
}> {
  const watchable = await listWatchableCoworkers();
  if (watchable.length === 0) {
    return { checked: 0, enqueued: 0 };
  }

  const tokenCache = new Map<string, string>();
  let checked = 0;
  let enqueued = 0;
  await watchable.reduce<Promise<void>>(async (prev, item) => {
    await prev;
    checked += 1;

    try {
      let accessToken = tokenCache.get(item.integrationId);
      if (!accessToken) {
        accessToken = await getValidAccessToken({
          accessToken: item.accessToken,
          refreshToken: item.refreshToken,
          expiresAt: item.expiresAt,
          integrationId: item.integrationId,
          type: "google_gmail",
        });
        tokenCache.set(item.integrationId, accessToken);
      }

      const lastProcessed = await getCoworkerLastProcessedInternalDate(item.coworkerId);
      const fallbackStart = Math.floor(Date.now() / 1000) - DEFAULT_LOOKBACK_SECONDS;
      const afterSeconds = Math.max(
        0,
        Math.floor(((lastProcessed ?? fallbackStart * 1000) - 60 * 1000) / 1000),
      );

      const messageIds = await listRecentGmailMessages(accessToken, afterSeconds);
      if (messageIds.length === 0) {
        return;
      }

      const summaries = await Promise.all(
        messageIds.map(async (messageId) => {
          try {
            return await getGmailMessageSummary(accessToken, messageId);
          } catch (error) {
            console.error(
              `[coworker-gmail-watcher] failed to fetch message ${messageId} for coworker ${item.coworkerId}`,
              error,
            );
            return null;
          }
        }),
      );

      const messages = summaries
        .filter((summary): summary is GmailMessageSummary => summary !== null)
        .toSorted((a, b) => a.internalDateMs - b.internalDateMs);

      const enqueuedCount = await Promise.all(
        messages.map(async (message) => {
          if (lastProcessed !== null && message.internalDateMs <= lastProcessed) {
            return 0;
          }

          const alreadyHandled = await hasRunForGmailMessage(item.coworkerId, message.id);
          if (alreadyHandled) {
            return 0;
          }

          try {
            await triggerCoworkerFromGmailMessage(item.coworkerId, message);
            return 1;
          } catch (error) {
            console.error(
              `[coworker-gmail-watcher] failed to trigger coworker ${item.coworkerId} for message ${message.id}`,
              error,
            );
            return 0;
          }
        }),
      );

      enqueued += enqueuedCount.reduce<number>((sum, count) => sum + count, 0);
    } catch (error) {
      if (isGmailAuthError(error)) {
        try {
          await disableBrokenGmailIntegration(
            item.integrationId,
            error instanceof Error ? error.message : "auth_error",
          );
        } catch (disableError) {
          console.error(
            `[coworker-gmail-watcher] failed to disable broken gmail integration ${item.integrationId}`,
            disableError,
          );
        }
      }
      console.error(`[coworker-gmail-watcher] failed for coworker ${item.coworkerId}`, error);
    }
  }, Promise.resolve());

  return { checked, enqueued };
}

export function startGmailCoworkerWatcher(): () => void {
  const intervalMs = getPollIntervalMs();
  let isRunning = false;

  const run = async () => {
    if (isRunning) {
      return;
    }
    isRunning = true;

    try {
      const { checked, enqueued } = await pollGmailCoworkerTriggers();
      if (checked > 0) {
        console.log(
          `[coworker-gmail-watcher] checked ${checked} coworker(s), enqueued ${enqueued} run(s)`,
        );
      }
    } catch (error) {
      console.error("[coworker-gmail-watcher] poll failed", error);
    } finally {
      isRunning = false;
    }
  };

  void run();
  const interval = setInterval(() => {
    void run();
  }, intervalMs);

  return () => clearInterval(interval);
}
