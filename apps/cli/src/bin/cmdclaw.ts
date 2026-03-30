#!/usr/bin/env bun
import { run } from "@stricli/core";
import { app } from "../app";
import { buildContext } from "../context";
import { normalizeCmdclawArgv } from "../lib/argv";

await run(app, normalizeCmdclawArgv(process.argv.slice(2)), buildContext(process));
