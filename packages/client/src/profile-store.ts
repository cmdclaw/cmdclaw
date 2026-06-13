import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { BapProfile, BapProfileStore } from "./types";

export const DEFAULT_SERVER_URL = "http://localhost:3000";

function buildRootDir(rootDir?: string): string {
  return rootDir ?? join(homedir(), ".bap");
}

function buildProfilesDir(rootDir?: string): string {
  return join(buildRootDir(rootDir), "profiles");
}

function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

export function profileSlugForServerUrl(serverUrl: string): string {
  try {
    const url = new URL(serverUrl);
    const protocol = url.protocol.replace(":", "");
    const host = url.hostname.toLowerCase();
    const port = url.port ? `-${url.port}` : "";
    return `${protocol}--${host}${port}`.replace(/[^a-z0-9.-]/g, "-");
  } catch {
    return serverUrl.toLowerCase().replace(/[^a-z0-9.-]/g, "-");
  }
}

export function createFsProfileStore(options?: { rootDir?: string }): BapProfileStore {
  const rootDir = buildRootDir(options?.rootDir);
  const profilesDir = buildProfilesDir(options?.rootDir);

  return {
    getConfigPathForServerUrl(serverUrl: string): string {
      return join(profilesDir, `chat-config.${profileSlugForServerUrl(serverUrl)}.json`);
    },
    load(serverUrl = process.env.APP_SERVER_URL || DEFAULT_SERVER_URL): BapProfile | null {
      try {
        const configPath = join(profilesDir, `chat-config.${profileSlugForServerUrl(serverUrl)}.json`);
        if (!existsSync(configPath)) {
          return null;
        }
        const raw = readFileSync(configPath, "utf-8");
        return JSON.parse(raw) as BapProfile;
      } catch {
        return null;
      }
    },
    save(config: BapProfile): void {
      ensureDir(rootDir);
      ensureDir(profilesDir);
      const configPath = join(
        profilesDir,
        `chat-config.${profileSlugForServerUrl(config.serverUrl)}.json`,
      );
      writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
    },
    clear(serverUrl = process.env.APP_SERVER_URL || DEFAULT_SERVER_URL): void {
      const configPath = join(profilesDir, `chat-config.${profileSlugForServerUrl(serverUrl)}.json`);
      if (existsSync(configPath)) {
        unlinkSync(configPath);
      }
    },
  };
}

export const defaultProfileStore = createFsProfileStore();
