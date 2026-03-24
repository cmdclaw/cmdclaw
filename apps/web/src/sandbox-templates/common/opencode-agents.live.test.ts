import {
  CMDCLAW_CHAT_AGENT_ID,
  CMDCLAW_COWORKER_BUILDER_AGENT_ID,
  CMDCLAW_COWORKER_RUNNER_AGENT_ID,
} from "@cmdclaw/core/server/prompts/opencode-agent-ids";
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client";
import { Sandbox } from "e2b";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { liveEnabled } from "../../../tests/e2e-cli/live-fixtures";

const templateName = process.env.E2B_DAYTONA_SANDBOX_NAME || "cmdclaw-agent-dev";
const liveSandboxAgentsEnabled = liveEnabled && Boolean(process.env.E2B_API_KEY);
const sandboxTimeoutMs = 15 * 60 * 1000;
const opencodePort = 4096;

async function copySandboxAsset(
  sandbox: Sandbox,
  input: {
    localPath: string;
    remotePath: string;
  },
): Promise<void> {
  const content = await readFile(input.localPath, "utf8");
  await sandbox.files.write(input.remotePath, content);
}

async function waitForHealth(url: string): Promise<void> {
  const timeoutMs = 30_000;
  const deadline = Date.now() + timeoutMs;

  async function poll(): Promise<void> {
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until timeout.
    }

    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for OpenCode health at ${url}/health`);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
    await poll();
  }

  await poll();
}

describe.runIf(liveSandboxAgentsEnabled)("@live OpenCode agents", () => {
  beforeAll(() => {
    process.env.E2E_LIVE = "1";
  });

  test(
    "loads custom agents from sandbox assets and accepts an explicit agent on prompt",
    { timeout: 180_000 },
    async () => {
      const sandbox = await Sandbox.create(templateName, {
        timeoutMs: sandboxTimeoutMs,
      });

      try {
        const commonRoot = path.join(process.cwd(), "src", "sandbox-templates", "common");
        await sandbox.commands.run("mkdir -p /app/.opencode/agents");
        await copySandboxAsset(sandbox, {
          localPath: path.join(commonRoot, "opencode.json"),
          remotePath: "/app/opencode.json",
        });
        await copySandboxAsset(sandbox, {
          localPath: path.join(commonRoot, "agents", `${CMDCLAW_CHAT_AGENT_ID}.md`),
          remotePath: `/app/.opencode/agents/${CMDCLAW_CHAT_AGENT_ID}.md`,
        });
        await copySandboxAsset(sandbox, {
          localPath: path.join(commonRoot, "agents", `${CMDCLAW_COWORKER_BUILDER_AGENT_ID}.md`),
          remotePath: `/app/.opencode/agents/${CMDCLAW_COWORKER_BUILDER_AGENT_ID}.md`,
        });
        await copySandboxAsset(sandbox, {
          localPath: path.join(commonRoot, "agents", `${CMDCLAW_COWORKER_RUNNER_AGENT_ID}.md`),
          remotePath: `/app/.opencode/agents/${CMDCLAW_COWORKER_RUNNER_AGENT_ID}.md`,
        });

        await sandbox.commands.run(
          "bash -lc 'cd /app && env OPENCODE_CONFIG=/app/opencode.json opencode serve --hostname 0.0.0.0 --port 4096 >/tmp/opencode-agents-live.log 2>&1'",
          { background: true },
        );

        const baseUrl = `https://${sandbox.getHost(opencodePort)}`;
        await waitForHealth(baseUrl);

        const client = createOpencodeClient({ baseUrl });
        const listed = await client.app.agents({});
        expect(listed.error).toBeFalsy();

        const agents = listed.data ?? [];
        const chat = agents.find((agent) => agent.name === CMDCLAW_CHAT_AGENT_ID);
        const builder = agents.find((agent) => agent.name === CMDCLAW_COWORKER_BUILDER_AGENT_ID);
        const runner = agents.find((agent) => agent.name === CMDCLAW_COWORKER_RUNNER_AGENT_ID);

        expect(chat?.mode).toBe("primary");
        expect(chat?.prompt).toContain("When drafting or sending email bodies");
        expect(builder?.mode).toBe("primary");
        expect(builder?.prompt).toContain("You are CmdClaw's coworker builder agent.");
        expect(runner?.mode).toBe("primary");
        expect(runner?.prompt).toContain("Do not ask clarifying questions.");

        const created = await client.session.create({ title: "Agent smoke" });
        expect(created.error).toBeFalsy();
        expect(created.data?.id).toBeTruthy();

        const promptResult = await client.session.prompt({
          sessionID: created.data!.id,
          agent: CMDCLAW_CHAT_AGENT_ID,
          model: {
            providerID: "opencode",
            modelID: "glm-5-free",
          },
          parts: [{ type: "text", text: "Reply with exactly READY." }],
        });
        expect(promptResult.error).toBeFalsy();
      } finally {
        await sandbox.kill();
      }
    },
  );
});
