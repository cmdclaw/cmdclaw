import { and, eq, isNotNull, lte } from "drizzle-orm";
import { db } from "@cmdclaw/db/client";
import { conversation } from "@cmdclaw/db/schema";
import { killSandbox } from "../sandbox/e2b";
import { getSandboxSlotManager } from "./sandbox-slot-manager";

const PAUSED_SANDBOX_MAX_INACTIVITY_MS = 24 * 60 * 60 * 1000;

export async function cleanupPausedSandboxes(): Promise<{
  scanned: number;
  cleaned: number;
  skippedWithActiveLease: number;
}> {
  const cutoff = new Date(Date.now() - PAUSED_SANDBOX_MAX_INACTIVITY_MS);
  const candidates = await db.query.conversation.findMany({
    where: and(
      eq(conversation.generationStatus, "paused"),
      isNotNull(conversation.opencodeSandboxId),
      lte(conversation.sandboxLastUserVisibleActionAt, cutoff),
    ),
    columns: {
      id: true,
      currentGenerationId: true,
    },
  });

  let cleaned = 0;
  let skippedWithActiveLease = 0;

  for (const candidate of candidates) {
    if (candidate.currentGenerationId) {
      // eslint-disable-next-line no-await-in-loop -- cleanup must remain ordered and bounded
      const hasLease = await getSandboxSlotManager().hasActiveLease(candidate.currentGenerationId);
      if (hasLease) {
        skippedWithActiveLease += 1;
        continue;
      }
    }

    // eslint-disable-next-line no-await-in-loop -- sandbox cleanup must be deliberate
    await killSandbox(candidate.id, "paused_cleanup");
    cleaned += 1;
  }

  return {
    scanned: candidates.length,
    cleaned,
    skippedWithActiveLease,
  };
}
