import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { readRuntimeContext } from "../../../lib/runtime-context";

type AttachmentPayload = {
  name: string;
  mimeType: string;
  dataUrl: string;
};

type DocumentUploadPayload = {
  filename: string;
  mimeType: string;
  content: string;
};

function usage(): never {
  console.error("Usage:");
  console.error("  coworker list [--json]");
  console.error(
    "  coworker invoke --username <username> --message <text> [--attachment <path>]... [--json]",
  );
  console.error("  coworker patch <coworker-id> --base-updated-at <iso> --patch-file <path>");
  console.error(
    "  coworker upload-document <coworker-id> --file <path> [--description <text>] [--json]",
  );
  process.exit(1);
}

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function inferMimeType(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".m4a":
      return "audio/mp4";
    case ".mp4":
      return "video/mp4";
    case ".mov":
      return "video/quicktime";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".pdf":
      return "application/pdf";
    case ".json":
      return "application/json";
    case ".txt":
    case ".md":
      return "text/plain";
    default:
      return "application/octet-stream";
  }
}

async function readAttachment(filePath: string): Promise<AttachmentPayload> {
  const content = await readFile(filePath);
  const mimeType = inferMimeType(filePath);
  return {
    name: basename(filePath),
    mimeType,
    dataUrl: `data:${mimeType};base64,${content.toString("base64")}`,
  };
}

async function readUploadedDocument(filePath: string): Promise<DocumentUploadPayload> {
  const content = await readFile(filePath);
  const mimeType = inferMimeType(filePath);
  return {
    filename: basename(filePath),
    mimeType,
    content: content.toString("base64"),
  };
}

async function readPatchPayload(patchFilePath?: string): Promise<string> {
  const normalizedFilePath = patchFilePath?.trim();

  if (!normalizedFilePath) {
    throw new Error("patch requires --patch-file");
  }

  return await readFile(normalizedFilePath, "utf8");
}

async function postJson(path: string, body: Record<string, unknown>): Promise<unknown> {
  const appUrl = getRequiredEnv("APP_URL");
  const runtimeContext = await readRuntimeContext();

  const response = await fetch(`${appUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${runtimeContext.callbackToken}`,
    },
    body: JSON.stringify({
      runtimeId: runtimeContext.runtimeId,
      turnSeq: runtimeContext.turnSeq,
      ...body,
    }),
  });

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    if (typeof parsed === "object" && parsed && "error" in parsed) {
      const message =
        "availableUsernames" in parsed &&
        Array.isArray(parsed.availableUsernames) &&
        parsed.availableUsernames.length > 0
          ? `${String((parsed as { error: unknown }).error)} (available: ${parsed.availableUsernames.join(", ")})`
          : String((parsed as { error: unknown }).error);
      throw new Error(message);
    }

    throw new Error(
      typeof parsed === "string" && parsed ? parsed : `Request failed with ${response.status}`,
    );
  }

  return parsed;
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  const wantsJson = args.includes("--json");

  if (!command || command === "--help" || command === "-h") {
    usage();
  }

  if (command === "list") {
    const response = (await postJson("/api/internal/coworkers/runtime/list", {})) as {
      coworkers?: unknown;
    };
    const coworkers = Array.isArray(response?.coworkers) ? response.coworkers : [];

    if (wantsJson) {
      printJson(coworkers);
      return;
    }

    if (coworkers.length === 0) {
      console.log("No coworkers available.");
      return;
    }

    for (const entry of coworkers) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const record = entry as Record<string, unknown>;
      console.log(
        `${String(record.name ?? record.username ?? "coworker")} (@${String(record.username ?? "")})`,
      );
    }
    return;
  }

  if (command === "invoke") {
    let username = "";
    let message = "";
    const attachmentPaths: string[] = [];

    for (let index = 1; index < args.length; index += 1) {
      const arg = args[index];
      if (arg === "--json") {
        continue;
      }
      if (arg === "--username") {
        username = args[index + 1] ?? "";
        index += 1;
        continue;
      }
      if (arg === "--message") {
        message = args[index + 1] ?? "";
        index += 1;
        continue;
      }
      if (arg === "--attachment") {
        const path = args[index + 1];
        if (path) {
          attachmentPaths.push(path);
        }
        index += 1;
        continue;
      }

      throw new Error(`Unknown argument: ${arg}`);
    }

    const normalizedUsername = username.startsWith("@") ? username.slice(1) : username;
    if (!normalizedUsername || !message.trim()) {
      usage();
    }

    const attachments = await Promise.all(
      attachmentPaths.map((filePath) => readAttachment(filePath)),
    );
    const response = (await postJson("/api/internal/coworkers/runtime/invoke", {
      username: normalizedUsername,
      message: message.trim(),
      attachments,
    })) as { invocation?: unknown };

    const invocation = response?.invocation ?? response;
    if (wantsJson) {
      printJson(invocation);
      return;
    }

    if (!invocation || typeof invocation !== "object") {
      console.log("Coworker invoked.");
      return;
    }

    const record = invocation as Record<string, unknown>;
    console.log(
      `Started ${String(record.name ?? record.username ?? normalizedUsername)} (@${String(record.username ?? normalizedUsername)})`,
    );
    console.log(`runId: ${String(record.runId ?? "")}`);
    console.log(`conversationId: ${String(record.conversationId ?? "")}`);
    return;
  }

  if (command === "patch") {
    const coworkerId = args[1] ?? "";
    let baseUpdatedAt = "";
    let patchFilePath = "";

    for (let index = 2; index < args.length; index += 1) {
      const arg = args[index];
      if (arg === "--base-updated-at") {
        baseUpdatedAt = args[index + 1] ?? "";
        index += 1;
        continue;
      }
      if (arg === "--patch-file") {
        patchFilePath = args[index + 1] ?? "";
        index += 1;
        continue;
      }

      throw new Error(`Unknown argument: ${arg}`);
    }

    if (!coworkerId || !baseUpdatedAt.trim() || !patchFilePath.trim()) {
      usage();
    }

    const patchPayload = await readPatchPayload(patchFilePath);
    let parsedPatch: unknown;
    try {
      parsedPatch = JSON.parse(patchPayload);
    } catch {
      throw new Error("Invalid JSON for patch payload");
    }

    const response = (await postJson("/api/internal/coworkers/runtime/patch", {
      coworkerId,
      baseUpdatedAt: baseUpdatedAt.trim(),
      patch: parsedPatch,
    })) as { patch?: unknown };

    const patchResult = response?.patch ?? response;
    printJson(patchResult);
    return;
  }

  if (command === "upload-document") {
    const coworkerId = args[1] ?? "";
    let filePath = "";
    let description: string | undefined;

    for (let index = 2; index < args.length; index += 1) {
      const arg = args[index];
      if (arg === "--json") {
        continue;
      }
      if (arg === "--file") {
        filePath = args[index + 1] ?? "";
        index += 1;
        continue;
      }
      if (arg === "--description") {
        description = args[index + 1] ?? "";
        index += 1;
        continue;
      }

      throw new Error(`Unknown argument: ${arg}`);
    }

    if (!coworkerId || !filePath.trim()) {
      usage();
    }

    const document = await readUploadedDocument(filePath.trim());
    const response = (await postJson("/api/internal/coworkers/runtime/documents/upload", {
      coworkerId,
      filename: document.filename,
      mimeType: document.mimeType,
      content: document.content,
      description,
    })) as { document?: unknown };

    const uploadResult = response?.document ?? response;
    if (wantsJson) {
      printJson(uploadResult);
      return;
    }

    if (!uploadResult || typeof uploadResult !== "object") {
      console.log(`Uploaded ${document.filename}.`);
      return;
    }

    const record = uploadResult as Record<string, unknown>;
    console.log(
      `Uploaded ${String(record.filename ?? document.filename)} (${String(record.mimeType ?? document.mimeType)}).`,
    );
    console.log(`documentId: ${String(record.id ?? "")}`);
    return;
  }

  usage();
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
