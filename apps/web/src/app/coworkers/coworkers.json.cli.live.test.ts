import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, test } from "vitest";
import {
  assertExitOk,
  buildCliCommandArgs,
  commandTimeoutMs,
  ensureCliAuth,
  liveEnabled,
  requireMatch,
  responseTimeoutMs,
  resolveLiveModel,
  runBunCommand,
} from "../../../tests/e2e-cli/live-fixtures";

let liveModel = "";

async function loadDefinitionFixture() {
  const fixturePath = new URL(
    "../../../tests/e2e-cli/fixtures/liam-linkedin-monitoring.json",
    import.meta.url,
  );
  return JSON.parse(await readFile(fixturePath, "utf8")) as {
    version: number;
    exportedAt: string;
    coworker: {
      name: string;
      description: string | null;
      username: string;
      prompt: string;
      model: string;
      authSource: string | null;
      triggerType: string;
      allowedIntegrations: string[];
      allowedCustomIntegrations: string[];
      schedule: unknown;
    };
    documents: unknown[];
  };
}

describe.runIf(liveEnabled)("@live CLI coworkers json", () => {
  beforeAll(async () => {
    await ensureCliAuth();
    liveModel = await resolveLiveModel();
  });

  test(
    "imports a coworker definition from --json-coworker and runs it",
    { timeout: Math.max(responseTimeoutMs + 120_000, 300_000) },
    async () => {
      const marker = `cli-json-coworker-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
      const definition = await loadDefinitionFixture();
      definition.exportedAt = new Date().toISOString();
      definition.coworker.name = `${definition.coworker.name}-${marker}`.slice(0, 128);
      definition.coworker.username = `${definition.coworker.username}-${marker}`.slice(0, 60);
      definition.coworker.model = liveModel;
      definition.coworker.triggerType = "manual";
      definition.coworker.allowedIntegrations = [];
      definition.coworker.allowedCustomIntegrations = [];
      definition.coworker.schedule = null;
      definition.coworker.prompt = [
        `This is a live smoke run for the imported coworker fixture "${definition.coworker.name}".`,
        `Original description: ${definition.coworker.description ?? "none"}.`,
        "Reply in 2-3 short sentences describing what this coworker is intended to monitor based on its exported definition.",
        `Include this exact token in your final answer: ${marker}`,
      ].join("\n\n");
      const definitionJson = JSON.stringify(definition);

      const triggered = await runBunCommand([
        ...buildCliCommandArgs(
          "coworker",
          "run",
          "--json-coworker",
          definitionJson,
          "--payload",
          '{"source":"cli-json-coworker-live-test"}',
        ),
      ]);

      assertExitOk(triggered, "coworker run --json-coworker");
      expect(triggered.stdout).toContain("Imported coworker");
      const runId = requireMatch(triggered.stdout, /run id:\s+([^\s]+)/, triggered.stdout);

      const logs = await runBunCommand(
        [...buildCliCommandArgs("coworker", "logs", runId, "--watch", "--watch-interval", "2")],
        Math.max(responseTimeoutMs, commandTimeoutMs),
      );

      assertExitOk(logs, "coworker logs for --json-coworker");
      expect(logs.stdout).toContain(`Run ${runId}`);
      expect(logs.stdout).toContain(marker);
      expect(logs.stdout).not.toContain("Error:");
      expect(logs.stdout).not.toContain("[ERROR]");
    },
  );
});
