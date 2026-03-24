import { z } from "zod";
import { db } from "@cmdclaw/db/client";
import { conversationSessionSnapshot } from "@cmdclaw/db/schema";
import { eq } from "drizzle-orm";
import {
  deleteFromS3,
  downloadFromS3,
  ensureBucket,
  uploadToS3,
} from "../storage/s3-client";
import type { OpencodeClient } from "@opencode-ai/sdk/v2/client";

const SNAPSHOT_CONTENT_TYPE = "application/json";

const opencodeSessionSnapshotSchema = z.object({
  info: z
    .object({
      id: z.string().min(1),
    })
    .passthrough(),
  messages: z.array(z.object({}).passthrough()),
});

export type OpencodeSessionSnapshotPayload = z.infer<typeof opencodeSessionSnapshotSchema>;

type SnapshotSandbox = {
  exec: (
    command: string,
    opts?: {
      timeoutMs?: number;
      env?: Record<string, string>;
      background?: boolean;
      onStderr?: (chunk: string) => void;
    },
  ) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
  writeFile: (path: string, content: string | ArrayBuffer) => Promise<void>;
};

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

export function buildConversationSessionSnapshotStorageKey(conversationId: string): string {
  return `opencode-session-snapshots/${conversationId}/latest.json`;
}

export function buildOpencodeExportCommand(sessionId: string): string {
  return `opencode export ${shellEscape(sessionId)}`;
}

export function buildOpencodeImportCommand(filePath: string): string {
  return `opencode import ${shellEscape(filePath)}`;
}

export function parseOpencodeSessionSnapshotPayload(raw: string): OpencodeSessionSnapshotPayload {
  return opencodeSessionSnapshotSchema.parse(JSON.parse(raw));
}

export async function getConversationSessionSnapshot(conversationId: string) {
  return (
    (await db.query.conversationSessionSnapshot.findFirst({
      where: eq(conversationSessionSnapshot.conversationId, conversationId),
    })) ?? null
  );
}

export async function saveConversationSessionSnapshot(input: {
  conversationId: string;
  sessionId: string;
  sandbox: SnapshotSandbox;
  exportedAt?: Date;
}): Promise<{
  sessionId: string;
  storageKey: string;
  exportedAt: Date;
}> {
  const exportResult = await input.sandbox.exec(buildOpencodeExportCommand(input.sessionId), {
    timeoutMs: 60_000,
  });
  if (exportResult.exitCode !== 0) {
    throw new Error(
      exportResult.stderr || exportResult.stdout || `Failed to export session ${input.sessionId}`,
    );
  }

  const payload = parseOpencodeSessionSnapshotPayload(exportResult.stdout);
  const storageKey = buildConversationSessionSnapshotStorageKey(input.conversationId);
  const exportedAt = input.exportedAt ?? new Date();

  await ensureBucket();
  await uploadToS3(storageKey, Buffer.from(exportResult.stdout, "utf8"), SNAPSHOT_CONTENT_TYPE);

  await db
    .insert(conversationSessionSnapshot)
    .values({
      conversationId: input.conversationId,
      sessionId: payload.info.id,
      storageKey,
      exportedAt,
    })
    .onConflictDoUpdate({
      target: conversationSessionSnapshot.conversationId,
      set: {
        sessionId: payload.info.id,
        storageKey,
        exportedAt,
        updatedAt: new Date(),
      },
    });

  return {
    sessionId: payload.info.id,
    storageKey,
    exportedAt,
  };
}

export async function clearConversationSessionSnapshot(conversationId: string): Promise<void> {
  const existing = await getConversationSessionSnapshot(conversationId);
  if (!existing) {
    return;
  }

  await db
    .delete(conversationSessionSnapshot)
    .where(eq(conversationSessionSnapshot.conversationId, conversationId));

  await deleteFromS3(existing.storageKey);
}

export async function restoreConversationSessionSnapshot(input: {
  conversationId: string;
  sandbox: SnapshotSandbox;
  client: OpencodeClient;
  tempFilePath?: string;
}): Promise<{ sessionId: string } | null> {
  const snapshot = await getConversationSessionSnapshot(input.conversationId);
  if (!snapshot) {
    return null;
  }

  const buffer = await downloadFromS3(snapshot.storageKey);
  const raw = buffer.toString("utf8");
  const payload = parseOpencodeSessionSnapshotPayload(raw);
  const tempFilePath =
    input.tempFilePath ?? `/tmp/cmdclaw-opencode-session-${input.conversationId}.json`;

  await input.sandbox.writeFile(tempFilePath, raw);

  const importResult = await input.sandbox.exec(buildOpencodeImportCommand(tempFilePath), {
    timeoutMs: 60_000,
  });
  if (importResult.exitCode !== 0) {
    throw new Error(
      importResult.stderr || importResult.stdout || `Failed to import snapshot for ${snapshot.sessionId}`,
    );
  }

  const restored = await input.client.session.get({ sessionID: payload.info.id });
  if (restored.error || !restored.data) {
    throw new Error(`Imported session ${payload.info.id} could not be retrieved`);
  }

  return { sessionId: payload.info.id };
}
