# Expose the CmdClaw MCP Server as a hard-wired Platform MCP Server in every Generation

Save this file as `plans/cmdclaw-platform-mcp-server.md`.

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. It must be maintained in accordance with the skill file at `.claude/skills/execplan/SKILL.md` (repository root).

Source documents: the PRD at `docs/prd/cmdclaw-mcp-server-platform-capability.md`, the decision record at `docs/adr/0013-cmdclaw-mcp-server-as-hardwired-platform-capability.md`, and the glossary `CONTEXT.md` (terms **Platform MCP Server**, **CmdClaw MCP Server**, **Runtime-Originated Run**, **Spawn Depth**). This plan restates everything needed from them; you do not need to read them to execute, but they explain the "why".

## Purpose / Big Picture

CmdClaw is a platform where users chat with an agent or configure "coworkers" (saved agents with a prompt and a trigger: manual, schedule, email, webhook). Each agent turn is a "Generation" that runs inside a sandbox executing OpenCode (an agent runtime). The agent's tools come from MCP servers (Model Context Protocol — a standard where a server exposes callable tools over HTTP) that CmdClaw connects into the sandbox.

CmdClaw already has an MCP server that exposes CmdClaw's *own* capabilities (`apps/mcp/servers/cmdclaw`): run a chat, list/create/run coworkers, read coworker run logs, upload documents to a coworker, add skills. Today that server is only reachable by external agents through an interactive OAuth flow. The agent inside a CmdClaw generation cannot use it.

After this change, every Generation — chat, coworker, or coworker run — automatically gets the CmdClaw MCP server as a tool source, authenticated as the Generation's acting user. A user can type "make me a coworker that summarizes my inbox every morning" into a plain chat and the agent can actually create and run that coworker. Runs spawned this way carry a "Spawn Depth"; at depth 3 the platform refuses to spawn more, so two coworkers that trigger each other cannot loop forever.

The observable outcome: start a chat (`bun run cmdclaw -- chat --message "list my coworkers using the cmdclaw tools"`) and the agent succeeds by calling the `coworker.list` MCP tool — without enabling anything in any toolbox. Unit tests prove token claims, depth refusal, and auth acceptance.

## Progress

- [x] (2026-06-10) Milestone 1: spawn-depth module + tests (`packages/core/src/server/services/generation/spawn-depth.ts`).
- [x] (2026-06-10) Milestone 2: `spawnDepth` claim in managed tokens + platform server builder + tests.
- [x] (2026-06-10) Milestone 3: schema columns (`conversation.spawn_depth`, `coworker_run.spawn_depth`), persistence through turn-intake/coworker-service, GenerationContext exposure, injection in opencode-normal-runner. `bun db:push` applied.
- [x] (2026-06-10) Milestone 4: oRPC accepts managed tokens (`authSource: "managed_mcp"`), runtime-origin context, observability attributes.
- [x] (2026-06-10) Milestone 5: spawn-depth guards in `generation.startGeneration` and `coworker.trigger`.
- [x] (2026-06-10) Milestone 6: cmdclaw MCP middleware accepts managed tokens.
- [x] (2026-06-10) Milestone 7: `bun run check` and `bun run test` green on touched packages; live chat validation attempted (see Outcomes).

## Surprises & Discoveries

- Observation: the gateway auth shim (`apps/mcp/shared/auth.ts`) already returns `audience: requiredAudience` for managed tokens, so the cmdclaw server's `createMcpClient` audience check (`audience !== "cmdclaw"`) passes for managed tokens with no change to `client.ts`. The only server-side change needed there is `allowManagedToken: true` in its middleware.
  Evidence: `apps/mcp/shared/auth.ts:126-143` builds `extra: { audience: requiredAudience, authType: "managed" }`.
- Observation: oRPC context (`apps/web/src/server/orpc/context.ts`) sets `workspaceId: null` even for browser sessions; workspace is resolved later by `requireActiveWorkspaceAccess(userId, context.workspaceId)` (`apps/web/src/server/orpc/workspace-access.ts:14`) which falls back to the user's active workspace. This lets the managed path simply set `workspaceId` from token claims and compose with every existing procedure.
- Observation: 21 tests in `packages/core/src/server/services/generation-manager.test.ts` fail identically with and without this change — verified by reverting the runner injection and re-running. They are pre-existing failures from in-flight working-tree changes (turn-finalizer/reconciliation), not caused by this work.
  Evidence: `21 failed | 377 passed` both before re-applying the injection patch and after.
- Observation: xmcp bakes `PORT` from the environment at BUILD time into `dist/http.js` (a manually built child bound :3001 despite `PORT=4101` at runtime), and the dev gateway supervisor does not respawn dead children. Picking up middleware changes requires restarting the whole managed gateway (`bun run dev:managed` in `apps/mcp`), which rebuilds children with the right per-child env.
- Observation: agents prefer the in-sandbox `coworker` CLI over MCP tools when both can answer; the first E2E run answered via `coworker list --json`. The MCP tools are exposed namespaced as `cmdclaw_coworker_list` etc. (dots become underscores).

## Decision Log

- Decision: do NOT register `cmdclaw` in the managed workspace-server definitions in `packages/core/src/server/executor/workspace-sources.ts`.
  Rationale: ADR-0013 — a Platform MCP Server is not a Workspace MCP Server; it must never appear in workspace rows, the Toolbox, or allowlist resolution. The platform entry is appended at session assembly in the runner instead.
  Date/Author: 2026-06-10 / Claude + baptiste.
- Decision: mint the platform token with a real workspace id always — the generation's `workspaceId` when present (coworker runs), else the acting user's active workspace resolved at mint time via `requireActiveWorkspaceForUser` from `@cmdclaw/core/server/billing/service`.
  Rationale: `ManagedMcpTokenClaims.workspaceId` is a required string verified strictly; an empty-string sentinel would weaken verification and push resolution into every consumer. Mint-time resolution keeps claims honest and the oRPC managed path trivial.
  Date/Author: 2026-06-10 / Claude.
- Decision: spawn depth lives in verified token claims and persisted DB columns, never in tool parameters.
  Rationale: PRD requirement — the agent must not be able to lower its own depth. The token is signed server-side with `CMDCLAW_SERVER_SECRET`; the sandbox only ever sees the opaque header.
  Date/Author: 2026-06-10 / Claude + baptiste (from grilling session).
- Decision: depth refusal is a tool-level oRPC `BAD_REQUEST` error naming Spawn Depth and the limit, not a Generation failure.
  Rationale: PRD "Refusal contract" — the agent should relay the message and continue its turn.
  Date/Author: 2026-06-10 / Claude + baptiste.
- Decision: if `CMDCLAW_MCP_BASE_URL` or `CMDCLAW_SERVER_SECRET` is unset, or active-workspace resolution fails, skip injecting the platform server and record a runtime MCP warning (the same warning channel used when a workspace MCP server fails to connect).
  Rationale: local/dev setups without the MCP gateway must not break generation start; the PRD requires missing capability to be a visible Runtime Warning, not a silent absence.
  Date/Author: 2026-06-10 / Claude.

## Outcomes & Retrospective

All milestones completed and validated on 2026-06-10. Repo `bun run check` green (12/12 tasks). New unit tests: 4 (spawn depth) + 3 (platform builder) + 2 (claims spawnDepth) + 5 (oRPC managed claims) — all passing; apps/web suite 768/768 green; packages/core suite shows only the 21 pre-existing failures documented above.

Live validation (local dev stack, daytona sandbox):

- oRPC accepted a hand-minted managed token and returned the acting user's coworkers (`coworker.list` 200).
- The MCP gateway at `/cmdclaw` accepted the managed token after the middleware change, listed all 9 tools, and `tools/call coworker.list` returned real data — proving the MCP-server→oRPC token forwarding loop.
- A depth-3 token POSTed to `generation.startGeneration` was refused with HTTP 400 and the exact Spawn Depth message; no generation started.
- A real chat generation (`bun run cmdclaw -- chat`) reported all 9 `cmdclaw_*` MCP tools available with zero toolbox configuration and successfully called `cmdclaw_coworker_list` from inside the sandbox.

Not exercised live: a full coworker→coworker spawn chain to depth 3 (would create real runs); the guard is covered by unit tests plus the live oRPC refusal. Lesson learned: validate the deployment path early — the dist-baked PORT and non-respawning supervisor cost more time than the code.

## Context and Orientation

This is a Bun + TypeScript monorepo. Key areas for this change:

- `packages/core/src/server/managed-mcp-auth.ts` — the "managed token": a compact `base64url(JSON payload).hmacSha256Signature` string. `ManagedMcpTokenClaims` is `{ userId, workspaceId, internalKey, exp, remoteIntegrationSource? }`. `signManagedMcpToken(claims, secret)` and `verifyManagedMcpToken(token, secret, nowSeconds?)` live here; the secret is the env var `CMDCLAW_SERVER_SECRET`. Tests: `managed-mcp-auth.test.ts` alongside.
- `packages/core/src/server/executor/workspace-sources.ts` — resolves which workspace MCP servers a generation gets (the allowlist). `MANAGED_MCP_TOKEN_TTL_SECONDS = 600` (line ~42). `resolveManagedMcpBaseUrl()` (line ~124) reads `CMDCLAW_MCP_BASE_URL`, the public URL of the MCP gateway. Managed servers (gmail/galien/modulr) get `Authorization: Bearer <managed token>` headers built in `buildWorkspaceMcpRuntimeServer` (~line 586). We deliberately do not touch the managed definitions here.
- `packages/core/src/server/sandbox/core/types.ts` (~line 41) — `RuntimeMcpServer`, a discriminated union; the HTTP flavor is `{ type: "http" | "sse"; name: string; url: string; headers: Array<{name, value}> }`. This is the shape OpenCode receives.
- `packages/core/src/server/runtime/opencode/opencode-normal-runner.ts` — the generation runner. Around lines 661–676 it calls `resolveWorkspaceMcpServersForGeneration({...})` with `ctx.workspaceId`, `ctx.userId`, `ctx.allowedWorkspaceMcpServerIds`, then resolves the session's MCP servers (a promise consumed at line ~522 via `completeAgentInit({ sessionMcpServers })`). This is the injection point.
- `packages/core/src/server/sandbox/opencode-mcp-reconciliation.ts` — connects the desired `RuntimeMcpServer[]` into the running OpenCode instance per generation, hash-cached in Redis (`packages/core/src/server/redis/sandbox-mcp-config-cache.ts`). Connection failures become `OpenCodeMcpRuntimeWarning`s shown to the user. Nothing here changes; the platform server rides this machinery.
- `packages/core/src/server/services/generation/turn-intake.ts` — `startGeneration` (chat; creates `conversation` rows, type "chat") and `startCoworkerGeneration` (creates `conversation` rows, type "coworker").
- `packages/core/src/server/services/coworker-service.ts` — `triggerCoworkerRun(params)` (~line 472) creates `coworkerRun` rows and starts the generation.
- `packages/core/src/server/services/generation/turn-runner.ts` — `loadQueuedGenerationContext` (~line 116) builds the `GenerationContext` (`ctx`) the runner uses; it loads the conversation and the linked coworker run.
- `packages/db/src/schema.ts` — Drizzle ORM schema. `conversation` (~line 582), `coworkerRun` (~line 1298). Migrations: edit schema then run `bun db:push` from `apps/web` (per `apps/web/AGENTS.md`; do not use db:generate).
- `apps/web/src/server/orpc/context.ts` — builds the request auth context for the oRPC API (`/api/rpc`). Today: Better-Auth browser session, then "hosted MCP" OAuth bearer token, else anonymous. `apps/web/src/server/orpc/middleware.ts` defines `protectedProcedure` (requires `user` + `session`).
- `apps/web/src/server/orpc/routers/generation.ts` — `startGeneration` procedure (~line 396), called by the cmdclaw MCP `chat.run` tool via `@cmdclaw/client`'s `runChatSession`. Emits a Canonical Service Event (structured observability record) at ~line 515.
- `apps/web/src/server/orpc/routers/coworker.ts` — `trigger` procedure (~line 1679), called by the cmdclaw MCP `coworker.run` tool; delegates to `triggerCoworkerRun`.
- `apps/mcp/` — the MCP gateway and servers. `apps/mcp/shared/registry.ts` already registers slug `cmdclaw` at public path `/cmdclaw`. `apps/mcp/shared/auth.ts` exports `authenticateHostedMcpRequest({ req, requiredAudience, allowManagedToken? })`: it tries the OAuth access token first and, when `allowManagedToken` is true, falls back to `verifyManagedMcpToken` and requires `claims.internalKey === requiredAudience`. Galien/Modulr middlewares pass `allowManagedToken: true`; cmdclaw's (`apps/mcp/servers/cmdclaw/src/middleware.ts`) does not yet.
- `apps/mcp/servers/cmdclaw/src/lib/client.ts` — `createMcpClient(extra)` takes the verified token from `extra.authInfo` and builds an oRPC client (`createRpcClient(serverUrl, token)` → `Authorization: Bearer <token>` against `${CMDCLAW_SERVER_URL}/api/rpc`). For managed tokens the forwarded bearer is the managed token itself — which is why oRPC must learn to accept it (Milestone 4).

Definitions used below: "Spawn Depth" = number of runtime-originated hops from a human/external trigger (depth 0) to the current generation; "platform server" = the hard-wired CmdClaw MCP server entry; "managed token" = the HMAC token described above.

## Plan of Work

Milestone 1 — spawn-depth module. Create `packages/core/src/server/services/generation/spawn-depth.ts` exporting `MAX_SPAWN_DEPTH = 3`, `resolveCallerSpawnDepth(value: unknown): number` (non-negative integer or 0), and `evaluateSpawnRequest(callerSpawnDepth: number)` returning either `{ allowed: true, childSpawnDepth }` or `{ allowed: false, message }` where the message names Spawn Depth and the limit in agent-relayable language. Colocated test `spawn-depth.test.ts` (bun/vitest style matching `managed-mcp-auth.test.ts`).

Milestone 2 — claims + platform builder. In `managed-mcp-auth.ts`, add optional `spawnDepth?: number` to `ManagedMcpTokenClaims`; serialize when present and verify it as a non-negative integer when present (extend the existing strict field validation). Extend `managed-mcp-auth.test.ts` with a round-trip including `spawnDepth` and a rejection for a negative value. Create `packages/core/src/server/sandbox/platform-mcp-server.ts` with a pure `buildCmdclawPlatformMcpServer({ userId, workspaceId, spawnDepth, baseUrl, secret, nowSeconds })` returning the HTTP `RuntimeMcpServer` named `cmdclaw` with url `new URL("/cmdclaw", baseUrl)` and an `Authorization: Bearer <managed token>` header whose claims are `{ userId, workspaceId, internalKey: "cmdclaw", spawnDepth, exp: now + 600 }`. Colocated test asserting name/url/header and claims by verifying the emitted token with the same secret, plus independence from any workspace-server input.

Milestone 3 — persistence and injection. Add `spawnDepth: integer("spawn_depth").notNull().default(0)` to `conversation` and `coworkerRun` in `packages/db/src/schema.ts`; run `bun db:push` from `apps/web`. Thread an optional `spawnDepth` through: `StartGenerationInput` in turn-intake (set on newly created chat conversations), `triggerCoworkerRun` params in coworker-service (set on the `coworkerRun` row and forwarded so the coworker conversation row gets the same value). Extend the `GenerationContext` type and `loadQueuedGenerationContext` to expose `spawnDepth` (coworker run's value when a run is linked, else the conversation's, else 0). In `opencode-normal-runner.ts`, after workspace servers resolve, build the platform entry: workspace id = `ctx.workspaceId ?? (await requireActiveWorkspaceForUser(ctx.userId)).id`; on env/workspace failure skip and append a runtime MCP warning using the same warning list the unavailable workspace servers use; otherwise append the platform entry to the session servers array.

Milestone 4 — oRPC managed auth. In `apps/web/src/server/orpc/context.ts`, add `authSource: "managed_mcp"` to the union and a `runtimeMcp: { token, userId, workspaceId, spawnDepth, expiresAt } | null` field. Resolution order: session → hosted MCP → managed → anonymous. The managed resolver verifies the bearer with `verifyManagedMcpToken`, requires `internalKey === "cmdclaw"`, loads the user row (reject unknown), synthesizes a `Session` (`id: managed-mcp:<userId>`), sets `workspaceId` from claims. Extract the pure header→claims step into an exported helper so it can be tested without the db (`resolveManagedMcpClaims(headers, secret, nowSeconds)`); colocate tests. Add `"cmdclaw.auth.source"` and (when runtime-originated) `"cmdclaw.spawn.depth"` attributes to the Canonical Service Events emitted by `generation.startGeneration` and `coworker.trigger`.

Milestone 5 — guards. In `generation.startGeneration` and `coworker.trigger`: when `context.authSource === "managed_mcp"`, run `evaluateSpawnRequest(context.runtimeMcp.spawnDepth)`; on refusal throw `ORPCError("BAD_REQUEST", { message })`; on success pass `spawnDepth: childSpawnDepth` down (`generationManager.startGeneration` → turn-intake; `triggerCoworkerRun`). Non-managed callers pass `spawnDepth: 0` implicitly (column default).

Milestone 6 — cmdclaw MCP server. In `apps/mcp/servers/cmdclaw/src/middleware.ts`, pass `allowManagedToken: true`. No change to `client.ts` (see Surprises). The OAuth path is untouched.

Milestone 7 — validation. `bun run check` at repo root (type+lint), `bun run test` for the touched packages, then live validation per `apps/web/AGENTS.md`: `bun run cmdclaw -- chat --message "Using your cmdclaw tools, list my coworkers" --model <available model>` and observe the agent calling the `coworker.list` tool. If the local environment lacks the MCP gateway or sandbox, report the limitation explicitly instead of faking the result.

## Concrete Steps

All commands run from the repository root `/Users/baptiste/Git/cmdclaw` unless noted.

    bun run check                 # types + lint, must be green before and after
    cd packages/core && bun test src/server/services/generation/spawn-depth.test.ts
    cd packages/core && bun test src/server/managed-mcp-auth.test.ts
    cd packages/core && bun test src/server/sandbox/platform-mcp-server.test.ts
    cd apps/web && bun db:push    # after schema edit (NOT db:generate)
    cd apps/web && bun test src/server/orpc/context.test.ts
    bun run test                  # full sweep after all milestones

Expected: each new test file fails before its milestone's code exists and passes after; `bun db:push` reports the two added columns.

## Validation and Acceptance

Acceptance is the PRD's behavior, phrased concretely:

1. Unit: `evaluateSpawnRequest(2)` allows with child depth 3; `evaluateSpawnRequest(3)` refuses with a message containing "Spawn Depth" and "3". Claims round-trip preserves `spawnDepth`; negative depth rejected at verify.
2. Unit: `buildCmdclawPlatformMcpServer` output has `name: "cmdclaw"`, url `<base>/cmdclaw`, one Authorization header whose token verifies with the same secret to claims `{ internalKey: "cmdclaw", spawnDepth, userId, workspaceId }` and a 10-minute expiry. It takes no workspace-server inputs at all.
3. Unit: a managed token with `internalKey: "cmdclaw"` resolves to an authenticated oRPC context (`authSource: "managed_mcp"`, correct user/workspace/depth); expired, bad-signature, and wrong-internal-key tokens resolve to anonymous.
4. Behavior: with the dev stack running (web on :3000, MCP gateway reachable at `CMDCLAW_MCP_BASE_URL`, sandbox provider configured), `bun run cmdclaw -- chat --message "Using your cmdclaw tools, list my coworkers"` produces a generation where the agent calls `coworker.list` and answers with the user's coworkers — with no toolbox configuration.
5. Behavior: a chain of coworkers triggering each other stops with the refusal message once depth 3 is reached; the refusal is a tool error inside the turn, not a failed generation.

## Idempotence and Recovery

All edits are additive and re-runnable. `bun db:push` is idempotent for already-applied columns. If a milestone breaks `bun run check`, fix forward; nothing here is destructive. The platform server injection degrades to a runtime warning when env vars are missing, so partial deployment cannot block generations. To roll back behavior without a schema rollback, remove the injection block in `opencode-normal-runner.ts` (columns defaulting to 0 are harmless).

## Artifacts and Notes

(updated as work proceeds — keep proof snippets here)

## Interfaces and Dependencies

In `packages/core/src/server/services/generation/spawn-depth.ts`:

    export const MAX_SPAWN_DEPTH = 3;
    export function resolveCallerSpawnDepth(value: unknown): number;
    export type SpawnRequestEvaluation =
      | { allowed: true; childSpawnDepth: number }
      | { allowed: false; message: string };
    export function evaluateSpawnRequest(callerSpawnDepth: number): SpawnRequestEvaluation;

In `packages/core/src/server/sandbox/platform-mcp-server.ts`:

    export const CMDCLAW_PLATFORM_MCP_SERVER_NAME = "cmdclaw";
    export function buildCmdclawPlatformMcpServer(input: {
      userId: string; workspaceId: string; spawnDepth: number;
      baseUrl: string; secret: string; nowSeconds?: number;
    }): RuntimeMcpServer;

In `packages/core/src/server/managed-mcp-auth.ts`, `ManagedMcpTokenClaims` gains `spawnDepth?: number` (non-negative integer when present).

In `apps/web/src/server/orpc/context.ts`:

    export type RuntimeMcpContext = {
      token: string; userId: string; workspaceId: string;
      spawnDepth: number; expiresAt: number;
    };
    // ORPCContext.authSource: "anonymous" | "session" | "hosted_mcp" | "managed_mcp"
    // ORPCContext.runtimeMcp: RuntimeMcpContext | null

No new external dependencies. Existing libraries only: drizzle-orm (schema), orpc, bun test/vitest.
