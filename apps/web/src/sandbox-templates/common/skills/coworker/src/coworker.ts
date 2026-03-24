import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { readRuntimeContext } from "../../../lib/runtime-context";

type AttachmentPayload = {
  name: string;
  mimeType: string;
  dataUrl: string;
};

function usage(): never {
  console.error("Usage:");
  console.error("  coworker list [--json]");
  console.error(
    "  coworker invoke --username <username> --message <text> [--attachment <path>]... [--json]",
  );
  console.error("  coworker patch <coworker-id> --base-updated-at <iso> --patch <json> [--json]");
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
    let patch = "";

    for (let index = 2; index < args.length; index += 1) {
      const arg = args[index];
      if (arg === "--json") {
        continue;
      }
      if (arg === "--base-updated-at") {
        baseUpdatedAt = args[index + 1] ?? "";
        index += 1;
        continue;
      }
      if (arg === "--patch") {
        patch = args[index + 1] ?? "";
        index += 1;
        continue;
      }

      throw new Error(`Unknown argument: ${arg}`);
    }

    if (!coworkerId || !baseUpdatedAt.trim() || !patch.trim()) {
      usage();
    }

    let parsedPatch: unknown;
    try {
      parsedPatch = JSON.parse(patch);
    } catch {
      throw new Error("Invalid JSON for --patch");
    }

    const response = (await postJson("/api/internal/coworkers/runtime/patch", {
      coworkerId,
      baseUpdatedAt: baseUpdatedAt.trim(),
      patch: parsedPatch,
    })) as { patch?: unknown };

    const patchResult = response?.patch ?? response;
    if (wantsJson) {
      printJson(patchResult);
      return;
    }

    if (!patchResult || typeof patchResult !== "object") {
      console.log("Coworker patch submitted.");
      return;
    }

    const record = patchResult as Record<string, unknown>;
    console.log(String(record.message ?? "Coworker patch submitted."));
    if (Array.isArray(record.details) && record.details.length > 0) {
      for (const detail of record.details) {
        console.log(`- ${String(detail)}`);
      }
    }
    return;
  }

  usage();
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
