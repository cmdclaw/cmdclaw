import { deleteFromS3, ensureBucket, uploadToS3 } from "@cmdclaw/core/server/storage/s3-client";
import { db } from "@cmdclaw/db/client";
import { coworker, coworkerDocument } from "@cmdclaw/db/schema";
import { ORPCError } from "@orpc/server";
import { and, count, eq } from "drizzle-orm";
import { validateFileUpload } from "@/server/storage/validation";

type Database = typeof db;

function generateCoworkerDocumentStorageKey(
  userId: string,
  coworkerId: string,
  filename: string,
): string {
  const timestamp = Date.now();
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
  return `coworkers/${userId}/${coworkerId}/documents/${timestamp}-${sanitizedFilename}`;
}

export async function uploadCoworkerDocument(params: {
  database: Database;
  userId: string;
  coworkerId: string;
  filename: string;
  mimeType: string;
  contentBase64: string;
  description?: string | undefined;
}): Promise<{
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}> {
  const existingCoworker = await params.database.query.coworker.findFirst({
    where: and(eq(coworker.id, params.coworkerId), eq(coworker.ownerId, params.userId)),
    columns: {
      id: true,
    },
  });

  if (!existingCoworker) {
    throw new ORPCError("NOT_FOUND", { message: "Coworker not found" });
  }

  const fileBuffer = Buffer.from(params.contentBase64, "base64");
  const sizeBytes = fileBuffer.length;
  const [{ value: documentCount }] = await params.database
    .select({ value: count() })
    .from(coworkerDocument)
    .where(eq(coworkerDocument.coworkerId, params.coworkerId));

  validateFileUpload(params.filename, params.mimeType, sizeBytes, documentCount);

  await ensureBucket();
  const storageKey = generateCoworkerDocumentStorageKey(
    params.userId,
    params.coworkerId,
    params.filename,
  );
  await uploadToS3(storageKey, fileBuffer, params.mimeType);

  const [document] = await params.database
    .insert(coworkerDocument)
    .values({
      coworkerId: params.coworkerId,
      filename: params.filename,
      mimeType: params.mimeType,
      sizeBytes,
      storageKey,
      description: params.description,
    })
    .returning();

  return {
    id: document.id,
    filename: document.filename,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
  };
}

export async function deleteCoworkerDocument(params: {
  database: Database;
  userId: string;
  documentId: string;
}): Promise<{ success: true; filename: string }> {
  const existingDocument = await params.database.query.coworkerDocument.findFirst({
    where: eq(coworkerDocument.id, params.documentId),
    columns: {
      id: true,
      coworkerId: true,
      filename: true,
      storageKey: true,
    },
  });

  if (!existingDocument) {
    throw new ORPCError("NOT_FOUND", { message: "Document not found" });
  }

  const existingCoworker = await params.database.query.coworker.findFirst({
    where: and(eq(coworker.id, existingDocument.coworkerId), eq(coworker.ownerId, params.userId)),
    columns: {
      id: true,
    },
  });

  if (!existingCoworker) {
    throw new ORPCError("NOT_FOUND", { message: "Document not found" });
  }

  await deleteFromS3(existingDocument.storageKey);
  await params.database
    .delete(coworkerDocument)
    .where(eq(coworkerDocument.id, existingDocument.id));

  return {
    success: true,
    filename: existingDocument.filename,
  };
}
