import { Queue, QueueEvents, Worker, type ConnectionOptions, type Processor } from "bullmq";
import IORedis from "ioredis";
import { EMAIL_FORWARDED_TRIGGER_TYPE } from "../../lib/email-forwarding";
import { buildRedisOptions } from "../redis/connection-options";
import { processForwardedEmailEvent } from "../services/coworker-email-forwarding";
import { triggerCoworkerRun } from "../services/coworker-service";

const rawQueueName = process.env.BULLMQ_QUEUE_NAME ?? "cmdclaw-default";
export const queueName = rawQueueName.replaceAll(":", "-");
export const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const redisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
} as const;

export const SCHEDULED_COWORKER_JOB_NAME = "coworker:scheduled-trigger";
export const GMAIL_COWORKER_JOB_NAME = "coworker:gmail-trigger";
export const X_DM_COWORKER_JOB_NAME = "coworker:x-dm-trigger";
export const EMAIL_FORWARDED_COWORKER_JOB_NAME = "coworker:email-forwarded-trigger";
export const CHAT_GENERATION_JOB_NAME = "generation:chat-run";
export const COWORKER_GENERATION_JOB_NAME = "generation:coworker-run";
export const GENERATION_APPROVAL_TIMEOUT_JOB_NAME = "generation:approval-timeout";
export const GENERATION_AUTH_TIMEOUT_JOB_NAME = "generation:auth-timeout";
export const GENERATION_PREPARING_STUCK_CHECK_JOB_NAME = "generation:preparing-stuck-check";
export const GENERATION_STALE_REAPER_JOB_NAME = "generation:stale-reaper";
export const PAUSED_SANDBOX_CLEANUP_JOB_NAME = "sandbox:paused-cleanup";
export const CONVERSATION_LOADING_CLEANUP_JOB_NAME = "conversation:loading-cleanup";
export const CONVERSATION_QUEUED_MESSAGE_PROCESS_JOB_NAME = "conversation:queued-message-process";
export const SLACK_EVENT_JOB_NAME = "slack:event-callback";
export const DAILY_TELEMETRY_DIGEST_JOB_NAME = "telemetry:daily-digest";

export function buildQueueJobId(parts: Array<string | number | null | undefined>): string {
  const joined = parts
    .map((part) => String(part ?? "").trim())
    .filter((part) => part.length > 0)
    .join("-");
  const normalized = joined.replaceAll(":", "-").replaceAll(/\s+/g, "-").replaceAll(/-+/g, "-");
  return normalized.length > 0 ? normalized : "job";
}

type JobPayload = Record<string, unknown> & { coworkerId?: string };
type JobHandler = Processor<JobPayload, unknown, string>;

function isActiveCoworkerRunConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as {
    code?: unknown;
    status?: unknown;
    message?: unknown;
  };

  return (
    maybeError.code === "BAD_REQUEST" &&
    maybeError.status === 400 &&
    typeof maybeError.message === "string" &&
    maybeError.message.includes("Coworker already has an active run")
  );
}

const handlers: Record<string, JobHandler> = {
  [SCHEDULED_COWORKER_JOB_NAME]: async (job) => {
    const coworkerId = job.data?.coworkerId;
    if (!coworkerId || typeof coworkerId !== "string") {
      throw new Error(`Missing coworkerId in scheduled job "${job.id}"`);
    }

    const scheduleType =
      typeof job.data?.scheduleType === "string" ? job.data.scheduleType : "unknown";

    return triggerCoworkerRun({
      coworkerId,
      triggerPayload: {
        source: "schedule",
        coworkerId,
        scheduleType,
        scheduledFor: new Date().toISOString(),
      },
    });
  },
  [GMAIL_COWORKER_JOB_NAME]: async (job) => {
    const coworkerId = job.data?.coworkerId;
    if (!coworkerId || typeof coworkerId !== "string") {
      throw new Error(`Missing coworkerId in gmail job "${job.id}"`);
    }

    try {
      return await triggerCoworkerRun({
        coworkerId,
        triggerPayload: job.data?.triggerPayload ?? {},
      });
    } catch (error) {
      if (isActiveCoworkerRunConflict(error)) {
        console.warn(
          `[worker] skipped gmail coworker trigger because run is already active for coworker ${coworkerId}`,
        );
        return;
      }
      throw error;
    }
  },
  [X_DM_COWORKER_JOB_NAME]: async (job) => {
    const coworkerId = job.data?.coworkerId;
    if (!coworkerId || typeof coworkerId !== "string") {
      throw new Error(`Missing coworkerId in x dm job "${job.id}"`);
    }

    try {
      return await triggerCoworkerRun({
        coworkerId,
        triggerPayload: job.data?.triggerPayload ?? {},
      });
    } catch (error) {
      if (isActiveCoworkerRunConflict(error)) {
        console.warn(
          `[worker] skipped x dm coworker trigger because run is already active for coworker ${coworkerId}`,
        );
        return;
      }
      throw error;
    }
  },
  [EMAIL_FORWARDED_COWORKER_JOB_NAME]: async (job) => {
    try {
      console.info("[worker] received forwarded-email job", {
        jobId: job.id ?? null,
        webhookId:
          typeof job.data?.webhookId === "string" && job.data.webhookId.length > 0
            ? job.data.webhookId
            : null,
        eventType:
          typeof (job.data as { event?: { type?: unknown } })?.event?.type === "string"
            ? ((job.data as { event?: { type?: string } }).event?.type ?? null)
            : null,
      });
      await processForwardedEmailEvent(
        job.data as Parameters<typeof processForwardedEmailEvent>[0],
      );
    } catch (error) {
      if (isActiveCoworkerRunConflict(error)) {
        console.warn(
          `[worker] skipped forwarded email trigger because run is already active (source: ${EMAIL_FORWARDED_TRIGGER_TYPE})`,
        );
        return;
      }
      throw error;
    }
  },
  [CHAT_GENERATION_JOB_NAME]: async (job) => {
    const generationId = job.data?.generationId;
    if (!generationId || typeof generationId !== "string") {
      throw new Error(`Missing generationId in chat generation job "${job.id}"`);
    }

    const { generationManager } = await import("../services/generation-manager");
    await generationManager.runQueuedGeneration(generationId);
  },
  [COWORKER_GENERATION_JOB_NAME]: async (job) => {
    const generationId = job.data?.generationId;
    if (!generationId || typeof generationId !== "string") {
      throw new Error(`Missing generationId in coworker generation job "${job.id}"`);
    }

    const { generationManager } = await import("../services/generation-manager");
    await generationManager.runQueuedGeneration(generationId);
  },
  [GENERATION_APPROVAL_TIMEOUT_JOB_NAME]: async (job) => {
    const generationId = job.data?.generationId;
    if (!generationId || typeof generationId !== "string") {
      throw new Error(`Missing generationId in approval timeout job "${job.id}"`);
    }

    const { generationManager } = await import("../services/generation-manager");
    await generationManager.processGenerationTimeout(generationId, "approval");
  },
  [GENERATION_AUTH_TIMEOUT_JOB_NAME]: async (job) => {
    const generationId = job.data?.generationId;
    if (!generationId || typeof generationId !== "string") {
      throw new Error(`Missing generationId in auth timeout job "${job.id}"`);
    }

    const { generationManager } = await import("../services/generation-manager");
    await generationManager.processGenerationTimeout(generationId, "auth");
  },
  [GENERATION_PREPARING_STUCK_CHECK_JOB_NAME]: async (job) => {
    const generationId = job.data?.generationId;
    if (!generationId || typeof generationId !== "string") {
      throw new Error(`Missing generationId in preparing-stuck-check job "${job.id}"`);
    }

    const { generationManager } = await import("../services/generation-manager");
    await generationManager.processPreparingStuckCheck(generationId);
  },
  [GENERATION_STALE_REAPER_JOB_NAME]: async () => {
    const { generationManager } = await import("../services/generation-manager");
    const summary = await generationManager.reapStaleGenerations();
    if (summary.stale > 0) {
      console.warn(
        `[worker] stale generation reaper finalized ${summary.stale} generation(s) (${summary.finalizedRunningAsError} as error, ${summary.finalizedOtherAsCancelled} as cancelled)`,
      );
    }
  },
  [PAUSED_SANDBOX_CLEANUP_JOB_NAME]: async () => {
    const { cleanupPausedSandboxes } = await import("../services/paused-sandbox-cleanup");
    const summary = await cleanupPausedSandboxes();
    if (summary.cleaned > 0 || summary.skippedWithActiveLease > 0) {
      console.info("[worker] paused sandbox cleanup summary", summary);
    }
  },
  [CONVERSATION_LOADING_CLEANUP_JOB_NAME]: async () => {
    const { cleanupStaleConversationLoadingStates } = await import(
      "../services/conversation-loading-cleanup"
    );
    const summary = await cleanupStaleConversationLoadingStates();
    if (summary.stale > 0) {
      console.warn("[worker] stale conversation loading cleanup summary", summary);
    }
  },
  [CONVERSATION_QUEUED_MESSAGE_PROCESS_JOB_NAME]: async (job) => {
    const conversationId = job.data?.conversationId;
    if (!conversationId || typeof conversationId !== "string") {
      throw new Error(`Missing conversationId in queued message process job "${job.id}"`);
    }

    const { generationManager } = await import("../services/generation-manager");
    await generationManager.processConversationQueuedMessages(conversationId);
  },
  [SLACK_EVENT_JOB_NAME]: async (job) => {
    const payload = job.data?.payload;
    if (!payload || typeof payload !== "object") {
      throw new Error(`Missing payload in slack event job "${job.id}"`);
    }
    const { handleSlackEvent } = await import("../services/slack-bot");
    await handleSlackEvent(payload as Parameters<typeof handleSlackEvent>[0]);
  },
  [DAILY_TELEMETRY_DIGEST_JOB_NAME]: async () => {
    const { postDailyTelemetryDigest } = await import("../services/telemetry-digest");
    const summary = await postDailyTelemetryDigest();
    console.info("[worker] posted daily telemetry digest", summary);
  },
};

const processor: Processor<JobPayload, unknown, string> = async (job) => {
  const handler = handlers[job.name];

  if (!handler) {
    throw new Error(`No handler registered for job "${job.name}"`);
  }

  return handler(job);
};

let queue: Queue<JobPayload, unknown, string> | null = null;
let queueConnection: IORedis | null = null;

function createRedisConnection(): IORedis {
  return new IORedis(buildRedisOptions(redisUrl, redisOptions));
}

export const getQueue = (): Queue<JobPayload, unknown, string> => {
  if (!queue) {
    queueConnection = createRedisConnection();
    queue = new Queue<JobPayload, unknown, string>(queueName, {
      connection: queueConnection as unknown as ConnectionOptions,
    });
  }

  return queue!;
};

export const startQueues = () => {
  const workerConnection = createRedisConnection();
  const queueEventsConnection = createRedisConnection();

  const worker = new Worker(queueName, processor, {
    connection: workerConnection as unknown as ConnectionOptions,
    concurrency: Number(process.env.BULLMQ_CONCURRENCY ?? "5"),
  });

  const queueEvents = new QueueEvents(queueName, {
    connection: queueEventsConnection as unknown as ConnectionOptions,
  });

  queueEvents.on("failed", ({ jobId, failedReason }) => {
    console.error(`[worker] job ${jobId} failed: ${failedReason}`);
  });

  worker.on("error", (error) => {
    console.error("[worker] unhandled error", error);
  });

  worker.on("failed", (job, error) => {
    const id = job?.id ?? "unknown";
    console.error(`[worker] job ${id} failed in processor`, error);
  });

  queueEvents.on("error", (error) => {
    console.error("[worker] queue events error", error);
  });

  return {
    worker,
    queueEvents,
    workerConnection,
    queueEventsConnection,
    queueName,
    redisUrl,
  };
};

async function closeRedisConnection(connection: IORedis): Promise<void> {
  try {
    await connection.quit();
  } catch {
    connection.disconnect();
  }
}

export const stopQueues = async (
  worker: Worker,
  queueEvents: QueueEvents,
  workerConnection: IORedis,
  queueEventsConnection: IORedis,
) => {
  const closers: Promise<unknown>[] = [worker.close(), queueEvents.close()];
  if (queue) {
    closers.push(queue.close());
    if (queueConnection) {
      closers.push(closeRedisConnection(queueConnection));
      queueConnection = null;
    }
    queue = null;
  }
  closers.push(closeRedisConnection(workerConnection));
  closers.push(closeRedisConnection(queueEventsConnection));
  await Promise.allSettled(closers);
};
