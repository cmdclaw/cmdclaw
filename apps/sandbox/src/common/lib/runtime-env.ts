import { readFileSync } from "node:fs";

const RUNTIME_ENV_JSON_PATH = "/app/.cmdclaw/runtime-env.json";

let loaded = false;

export function loadRuntimeEnv(): void {
  if (loaded) {
    return;
  }
  loaded = true;

  try {
    const raw = readFileSync(RUNTIME_ENV_JSON_PATH, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== "string" || process.env[key]) {
        continue;
      }
      process.env[key] = value;
    }
  } catch {
    // The runtime env file only exists after sandbox startup.
  }
}
