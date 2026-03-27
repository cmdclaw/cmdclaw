import { describe, expect, it } from "vitest";
import type { CoworkerBuilderContext } from "../services/coworker-builder-service";
import {
  CMDCLAW_CHAT_AGENT_ID,
  CMDCLAW_COWORKER_BUILDER_AGENT_ID,
  CMDCLAW_COWORKER_RUNNER_AGENT_ID,
} from "./opencode-agent-ids";
import { composeOpencodePromptSpec } from "./opencode-runtime-prompt";

const builderContext: CoworkerBuilderContext = {
  coworkerId: "cw-1",
  updatedAt: "2026-03-03T12:00:00.000Z",
  prompt: "Current prompt",
  model: "anthropic/claude-sonnet-4-6",
  toolAccessMode: "selected",
  triggerType: "manual",
  schedule: null,
  allowedIntegrations: ["github"],
};

describe("composeOpencodePromptSpec", () => {
  it("returns the chat agent id and expected runtime sections", () => {
    const result = composeOpencodePromptSpec({
      kind: "chat",
      cliInstructions: "CLI instructions",
      executorInstructions: "Executor instructions",
      skillsInstructions: "Skills instructions",
      integrationSkillsInstructions: "Integration skills instructions",
      memoryInstructions: "Memory instructions",
      selectedPlatformSkillSlugs: ["calendar", "gmail"],
      userTimezone: "Europe/Dublin",
    });

    expect(result.agentId).toBe(CMDCLAW_CHAT_AGENT_ID);
    expect(result.sections.map((section) => section.key)).toEqual([
      "base_system",
      "file_sharing",
      "user_timezone",
      "cli",
      "executor",
      "coworker_cli",
      "skills",
      "selected_platform_skills",
      "integration_skills",
      "integration_skill_drafts",
      "memory",
    ]);
    expect(result.systemPrompt).toContain("## File Sharing");
    expect(result.systemPrompt).toContain("## User Timezone");
    expect(result.systemPrompt).toContain("Europe/Dublin");
    expect(result.systemPrompt).toContain("CLI instructions");
    expect(result.systemPrompt).toContain("Executor instructions");
    expect(result.systemPrompt).toContain("# Selected Platform Skills");
    expect(result.systemPrompt).toContain("/app/.opencode/integration-skill-drafts/<slug>.json");
  });

  it("returns the builder agent id and only runtime-specific builder context", () => {
    const result = composeOpencodePromptSpec({
      kind: "coworker_builder",
      builderCoworkerContext: builderContext,
      cliInstructions: "CLI instructions",
      userTimezone: "America/New_York",
    });

    expect(result.agentId).toBe(CMDCLAW_COWORKER_BUILDER_AGENT_ID);
    expect(result.sections.map((section) => section.key)).toContain("user_timezone");
    expect(result.systemPrompt).toContain("America/New_York");
    expect(result.sections.map((section) => section.key)).toContain("coworker_builder_runtime");
    expect(result.systemPrompt).toContain("## Coworker Builder Runtime Context");
    expect(result.systemPrompt).toContain('"coworkerId": "cw-1"');
    expect(result.systemPrompt).toContain("--base-updated-at '2026-03-03T12:00:00.000Z'");
    expect(result.systemPrompt).toContain("coworker edit cw-1");
    expect(result.systemPrompt).not.toContain("Never run `coworker edit` on your first response");
    expect(result.systemPrompt).not.toContain("Question round first");
    expect(result.systemPrompt).not.toContain("If information is missing, apply a best-effort default edit first");
  });

  it("returns the runner agent id and coworker execution sections", () => {
    const result = composeOpencodePromptSpec({
      kind: "coworker_runner",
      coworkerPrompt: "Fetch unread emails and summarize them.",
      coworkerPromptDo: "Use Gmail only.",
      coworkerPromptDont: "Do not send duplicates.",
      triggerPayload: { source: "schedule" },
      memoryInstructions: "Memory instructions",
      userTimezone: "Asia/Tokyo",
    });

    expect(result.agentId).toBe(CMDCLAW_COWORKER_RUNNER_AGENT_ID);
    expect(result.sections.map((section) => section.key)).toContain("user_timezone");
    expect(result.systemPrompt).toContain("Asia/Tokyo");
    expect(result.sections.map((section) => section.key)).toContain("coworker_execution");
    expect(result.systemPrompt).toContain("## Coworker Instructions");
    expect(result.systemPrompt).toContain("## Do");
    expect(result.systemPrompt).toContain("## Don't");
    expect(result.systemPrompt).toContain("## Trigger Payload");
  });

  it("omits empty optional sections cleanly", () => {
    const result = composeOpencodePromptSpec({
      kind: "chat",
      cliInstructions: "   ",
      skillsInstructions: "",
      integrationSkillsInstructions: null,
      memoryInstructions: undefined,
      selectedPlatformSkillSlugs: [],
    });

    expect(result.sections.map((section) => section.key)).toEqual([
      "base_system",
      "file_sharing",
      "coworker_cli",
      "integration_skill_drafts",
    ]);
    expect(result.systemPrompt).not.toContain("Selected Platform Skills");
    expect(result.systemPrompt).not.toContain("Skills instructions");
    expect(result.systemPrompt).not.toContain("User Timezone");
  });
});
