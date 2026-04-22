import type { IntegrationType } from "../server/oauth/config";

export const COWORKER_TOOL_ACCESS_MODES = ["all", "selected"] as const;
export type CoworkerToolAccessMode = (typeof COWORKER_TOOL_ACCESS_MODES)[number];

export const CUSTOM_SKILL_PREFIX = "custom:";

export const COWORKER_AVAILABLE_INTEGRATION_TYPES: IntegrationType[] = [
  "google_gmail",
  "outlook",
  "outlook_calendar",
  "google_calendar",
  "google_docs",
  "google_sheets",
  "google_drive",
  "notion",
  "github",
  "airtable",
  "slack",
  "hubspot",
  "linkedin",
  "salesforce",
  "dynamics",
];

export function normalizeCoworkerToolAccessMode(
  value: unknown,
  allowedIntegrations: readonly string[],
): CoworkerToolAccessMode {
  if (value === "all" || value === "selected") {
    return value;
  }

  const allowedSet = new Set(
    allowedIntegrations
      .map((entry) => entry.trim())
      .filter((entry): entry is IntegrationType =>
        COWORKER_AVAILABLE_INTEGRATION_TYPES.includes(entry as IntegrationType),
      ),
  );

  return COWORKER_AVAILABLE_INTEGRATION_TYPES.every((entry) => allowedSet.has(entry))
    ? "all"
    : "selected";
}

export function normalizeCoworkerAllowedSkillSlugs(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => entry.length > 0),
    ),
  );
}

export function splitCoworkerAllowedSkillSlugs(skillSlugs: readonly string[]): {
  platformSkillSlugs: string[];
  customSkillNames: string[];
} {
  const platformSkillSlugs: string[] = [];
  const customSkillNames: string[] = [];

  for (const entry of normalizeCoworkerAllowedSkillSlugs(skillSlugs)) {
    if (entry.startsWith(CUSTOM_SKILL_PREFIX)) {
      const customName = entry.slice(CUSTOM_SKILL_PREFIX.length).trim();
      if (customName) {
        customSkillNames.push(customName);
      }
      continue;
    }

    platformSkillSlugs.push(entry);
  }

  return { platformSkillSlugs, customSkillNames };
}
