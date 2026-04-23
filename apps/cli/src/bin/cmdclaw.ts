#!/usr/bin/env bun
import {
  initializeObservabilityRuntime,
  recordCounter,
  recordHistogram,
  shutdownObservabilityRuntime,
  startActiveServerSpan,
} from "@cmdclaw/core/server/utils/observability";
import { run } from "@stricli/core";
import { app } from "../app";
import { buildContext } from "../context";
import { normalizeCmdclawArgv } from "../lib/argv";

initializeObservabilityRuntime("cmdclaw-cli");

const normalizedArgv = normalizeCmdclawArgv(process.argv.slice(2));
const startedAt = performance.now();
const commandAttributes = {
  primary_command: normalizedArgv[0] ?? "root",
  secondary_command: normalizedArgv[1] ?? undefined,
};

try {
  await startActiveServerSpan(
    `cli ${commandAttributes.primary_command}${commandAttributes.secondary_command ? ` ${commandAttributes.secondary_command}` : ""}`,
    {
      attributes: commandAttributes,
    },
    async () => {
      try {
        await run(app, normalizedArgv, buildContext(process));
        recordCounter(
          "cmdclaw_cli_invocations_total",
          1,
          {
            ...commandAttributes,
            status: "ok",
          },
          "Count of CmdClaw CLI invocations by command and status.",
        );
      } catch (error) {
        recordCounter(
          "cmdclaw_cli_invocations_total",
          1,
          {
            ...commandAttributes,
            status: "error",
          },
          "Count of CmdClaw CLI invocations by command and status.",
        );
        throw error;
      } finally {
        recordHistogram(
          "cmdclaw_cli_invocation_duration_ms",
          performance.now() - startedAt,
          commandAttributes,
          "Duration of CmdClaw CLI invocations.",
        );
      }
    },
  );
} finally {
  await shutdownObservabilityRuntime();
}
