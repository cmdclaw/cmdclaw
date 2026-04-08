import { SANDBOX_SKILLS_ROOT } from "@cmdclaw/sandbox/paths";
import { promises as fs } from "node:fs";

let cachedSkillsRoot: string | null | undefined;

export async function resolveSkillsRoot(logPrefix: string): Promise<string | null> {
  if (cachedSkillsRoot !== undefined) {
    return cachedSkillsRoot;
  }

  try {
    const stats = await fs.stat(SANDBOX_SKILLS_ROOT);
    if (stats.isDirectory()) {
      cachedSkillsRoot = SANDBOX_SKILLS_ROOT;
      return cachedSkillsRoot;
    }
  } catch {
    // fall through to log and null cache
  }

  console.error(`${logPrefix} Unable to resolve skills root directory`, {
    cwd: process.cwd(),
    candidate: SANDBOX_SKILLS_ROOT,
  });
  cachedSkillsRoot = null;
  return null;
}
