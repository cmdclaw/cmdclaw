import { config } from "dotenv";
import { Template, defaultBuildLogger } from "e2b";
import path from "path";
import { template } from "./template";

// Load the shared repo-root .env file.
config({ path: path.join(process.cwd(), "../../.env") });

async function main() {
  console.log("Building production template...");
  console.log("Template source:", path.join(process.cwd(), "src"));

  const result = await Template.build(template, {
    alias: "cmdclaw-agent-prod",
    cpuCount: 2,
    memoryMB: 2048,
    onBuildLogs: defaultBuildLogger(),
    ...(process.env.E2B_ACCESS_TOKEN && {
      apiKey: process.env.E2B_ACCESS_TOKEN,
    }),
  });

  console.log("\nTemplate built successfully!");
  console.log("Template ID:", result.templateId);
  console.log("Alias: cmdclaw-agent-prod");
  console.log("\nUse with: Sandbox.create('cmdclaw-agent-prod')");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
