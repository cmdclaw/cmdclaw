import { Queue, QueueEvents, Worker, type ConnectionOptions } from "bullmq";
import IORedis from "ioredis";
import { buildRedisOptions } from "../redis/connection-options";

const rawBaseQueueName = process.env.BULLMQ_QUEUE_NAME ?? "cmdclaw-default";
export const daytonaRunawayCleanupQueueName = `${rawBaseQueueName.replaceAll(":", "-")}-daytona-runaway-cleanup`;
export const daytonaRunawayCleanupRedisUrl =
  process.env.REDIS_URL ?? "redis://localhost:6379";

const redisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
} as const;

export const DAYTONA_RUNAWAY_CLEANUP_JOB_NAME = "daytona:runaway-cleanup";
export const DAYTONA_STOPPED_SANDBOX_DELETE_JOB_NAME = "daytona:stopped-sandbox-delete";

type CleanupJobPayload = Record<string, never>;

let queue: Queue<CleanupJobPayload, unknown, string> | null = null;
let queueConnection: IORedis | null = null;

function createRedisConnection(): IORedis {
  return new IORedis(buildRedisOptions(daytonaRunawayCleanupRedisUrl, redisOptions));
}

export function getDaytonaRunawayCleanupQueue(): Queue<CleanupJobPayload, unknown, string> {
  if (!queue) {
    queueConnection = createRedisConnection();
    queue = new Queue<CleanupJobPayload, unknown, string>(daytonaRunawayCleanupQueueName, {
      connection: queueConnection as unknown as ConnectionOptions,
    });
  }

  return queue;
}

export function startDaytonaRunawayCleanupQueue() {
  const workerConnection = createRedisConnection();
  const queueEventsConnection = createRedisConnection();

  const worker = new Worker<CleanupJobPayload, unknown, string>(
    daytonaRunawayCleanupQueueName,
    async (job) => {
      if (job.name === DAYTONA_RUNAWAY_CLEANUP_JOB_NAME) {
        const { cleanupRunawayDaytonaJobs } = await import("../services/daytona-runaway-cleanup");
        const summary = await cleanupRunawayDaytonaJobs();
        if (summary.stale > 0 || summary.stopFailed > 0 || summary.lookupFailed > 0) {
          console.info("[worker] daytona runaway cleanup summary", summary);
        }
        return;
      }

      if (job.name === DAYTONA_STOPPED_SANDBOX_DELETE_JOB_NAME) {
        const { cleanupStoppedDaytonaSandboxes } = await import(
          "../services/daytona-stopped-sandbox-delete"
        );
        const summary = await cleanupStoppedDaytonaSandboxes();
        if (summary.stopped > 0 || summary.deleted > 0 || summary.deleteFailed > 0) {
          console.info("[worker] daytona stopped sandbox delete summary", summary);
        }
        return;
      }

      throw new Error(`No handler registered for Daytona cleanup job "${job.name}"`);
    },
    {
      connection: workerConnection as unknown as ConnectionOptions,
      concurrency: 1,
    },
  );

  const queueEvents = new QueueEvents(daytonaRunawayCleanupQueueName, {
    connection: queueEventsConnection as unknown as ConnectionOptions,
  });

  queueEvents.on("failed", ({ jobId, failedReason }) => {
    console.error(`[worker] Daytona cleanup job ${jobId} failed: ${failedReason}`);
  });

  worker.on("error", (error) => {
    console.error("[worker] Daytona cleanup worker unhandled error", error);
  });

  worker.on("failed", (job, error) => {
    const id = job?.id ?? "unknown";
    console.error(`[worker] Daytona cleanup job ${id} failed in processor`, error);
  });

  queueEvents.on("error", (error) => {
    console.error("[worker] Daytona cleanup queue events error", error);
  });

  return {
    worker,
    queueEvents,
    workerConnection,
    queueEventsConnection,
    queueName: daytonaRunawayCleanupQueueName,
    redisUrl: daytonaRunawayCleanupRedisUrl,
  };
}

async function closeRedisConnection(connection: IORedis): Promise<void> {
  try {
    await connection.quit();
  } catch {
    connection.disconnect();
  }
}

export async function stopDaytonaRunawayCleanupQueue(
  worker: Worker,
  queueEvents: QueueEvents,
  workerConnection: IORedis,
  queueEventsConnection: IORedis,
): Promise<void> {
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
}
