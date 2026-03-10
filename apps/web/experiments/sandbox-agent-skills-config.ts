import { SandboxAgent, type SkillsConfig } from "sandbox-agent";

const baseUrl = process.env.SANDBOX_AGENT_BASE_URL ?? "http://127.0.0.1:2468";
const token = process.env.SANDBOX_AGENT_TOKEN;
const directory = process.env.SKILLS_DIRECTORY ?? "/app";
const skillName = process.env.SKILLS_NAME ?? "opencode";
const cleanup = process.env.SKILLS_CLEANUP === "1";
const startLocal = process.env.SANDBOX_AGENT_START === "1";

const sdk = startLocal
  ? await SandboxAgent.start()
  : await SandboxAgent.connect({
      baseUrl,
      ...(token ? { token } : {}),
    });

const query = { directory, skillName };

const testConfig: SkillsConfig = {
  sources: [
    {
      type: "github",
      source: "rivet-dev/skills",
      skills: ["sandbox-agent"],
    },
  ],
};

try {
  await sdk.setSkillsConfig(query, testConfig);
  const stored = await sdk.getSkillsConfig(query);

  console.log("skills config set+get ok");
  console.log(
    JSON.stringify(
      {
        directory,
        skillName,
        sourceCount: stored.sources.length,
        sources: stored.sources,
      },
      null,
      2,
    ),
  );

  if (cleanup) {
    await sdk.deleteSkillsConfig(query);
    console.log("skills config deleted");
  }
} finally {
  await sdk.dispose();
}
