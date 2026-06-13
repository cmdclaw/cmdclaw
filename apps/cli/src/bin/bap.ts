#!/usr/bin/env bun
import {
  initializeObservabilityRuntime,
  recordCounter,
  recordHistogram,
  shutdownObservabilityRuntime,
  startActiveServerSpan,
} from "@bap/core/server/utils/observability";
import { run } from "@stricli/core";
import { app } from "../app";
import { buildContext } from "../context";
import { normalizeBapArgv } from "../lib/argv";

initializeObservabilityRuntime("bap-cli");

const normalizedArgv = normalizeBapArgv(process.argv.slice(2));
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
          "bap_cli_invocations_total",
          1,
          {
            ...commandAttributes,
            status: "ok",
          },
          "Count of Bap CLI invocations by command and status.",
        );
      } catch (error) {
        recordCounter(
          "bap_cli_invocations_total",
          1,
          {
            ...commandAttributes,
            status: "error",
          },
          "Count of Bap CLI invocations by command and status.",
        );
        throw error;
      } finally {
        recordHistogram(
          "bap_cli_invocation_duration_ms",
          performance.now() - startedAt,
          commandAttributes,
          "Duration of Bap CLI invocations.",
        );
      }
    },
  );
} finally {
  await shutdownObservabilityRuntime();
}
