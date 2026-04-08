import { readFileSync } from "node:fs";

const RUNTIME_ENV_JSON_PATH = "/app/.cmdclaw/runtime-env.json";

let loadedKeys = new Set<string>();

export function loadRuntimeEnv(): void {
  try {
    const raw = readFileSync(RUNTIME_ENV_JSON_PATH, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const nextValues = Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
    const nextKeys = new Set(Object.keys(nextValues));

    for (const key of loadedKeys) {
      if (!nextKeys.has(key)) {
        delete process.env[key];
      }
    }

    for (const [key, value] of Object.entries(nextValues)) {
      process.env[key] = value;
    }

    loadedKeys = nextKeys;
  } catch {
    for (const key of loadedKeys) {
      delete process.env[key];
    }
    loadedKeys = new Set<string>();
  }
}
