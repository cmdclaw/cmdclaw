# Bap MCP Server as a Hard-Wired Platform Capability

See ADR-0013 (`docs/adr/0013-bap-mcp-server-as-hardwired-platform-capability.md`) and the
**Platform MCP Server**, **Bap MCP Server**, **Runtime-Originated Run**, and **Spawn Depth**
entries in `CONTEXT.md`.

## Problem Statement

When I'm in a Bap chat and realize "this should be a coworker," or when a coworker run
needs to hand work to another coworker, the agent can't do anything about it — it can read my
connected tools but it cannot operate Bap itself. I have to leave the conversation, click
through the coworker builder, and wire things up by hand, even though the agent already has
all the context. Coworkers likewise cannot orchestrate other coworkers, so multi-step
automations have to be crammed into a single coworker prompt.

## Solution

Every **Generation** — chat, coworker, or runner — gets the **Bap MCP Server** as a
hard-wired **Platform MCP Server**. The agent can run chats, list, create, and run
**Coworkers**, inspect coworker runs and logs, upload documents, and add skills, acting as the
Generation's acting user. The server is always present: it does not appear in the **Toolbox**,
is not governed by the **Workspace MCP Server Allowlist**, and cannot be removed per chat or
per coworker. Runs started this way are **Runtime-Originated Runs** carrying a **Spawn Depth**;
the platform refuses runs beyond depth three so coworker cycles self-extinguish.

## User Stories

1. As a chat user, I want to ask the agent to create a coworker from our conversation, so that I don't have to rebuild the context by hand in the coworker builder.
2. As a chat user, I want to ask the agent to run an existing coworker, so that I can trigger automations conversationally.
3. As a chat user, I want the agent to list my coworkers, so that I can ask "what automations do I already have?" and get a real answer.
4. As a chat user, I want the agent to fetch a coworker's definition, so that I can ask it to explain or improve an existing automation.
5. As a chat user, I want the agent to inspect a coworker's recent runs and logs, so that I can debug "why did my 3am run fail?" without leaving the chat.
6. As a chat user, I want these capabilities present in every conversation without enabling anything, so that "make me a coworker for this" just works the first time I try it.
7. As a coworker, I want to run another coworker as part of my task, so that orchestrator/worker patterns are possible without duplicating prompts.
8. As a coworker, I want to start a chat run for a sub-task, so that I can delegate open-ended work mid-run.
9. As a coworker owner, I want runs my coworker spawns to act as me and be owned by me, so that quotas, permissions, and results stay attached to one accountable person.
10. As a coworker owner, I want runs spawned by my coworker to be refused beyond Spawn Depth three with a clear tool error, so that two coworkers that reference each other cannot loop and burn tokens overnight.
11. As a coworker owner, I want the depth refusal message to be relayed by the agent in plain language, so that I understand why the chain stopped and can restructure it.
12. As a workspace admin, I want runtime-originated actions recorded distinctly from user-originated actions, so that the audit trail distinguishes "Alice did X" from "Alice's coworker did X".
13. As a workspace admin, I want Bap MCP calls scoped to the acting user's workspace, so that a generation in one workspace can never touch another workspace's coworkers.
14. As a user, I want the agent's Bap credentials to be short-lived and minted per generation, so that a leaked sandbox cannot operate my account indefinitely.
15. As a user, I want a Bap MCP connection failure surfaced as a visible runtime warning, so that I know the agent is missing its self-management tools instead of silently lacking them.
16. As a user, I want the Bap tools available on a reused warm sandbox just as on a fresh one, so that capability does not depend on sandbox luck.
17. As a developer using a Local Runtime, I want the Bap MCP Server present there too, so that local development exercises the same capability surface as production.
18. As an external agent author (e.g. Claude Code on a laptop), I want the existing OAuth path to the Bap MCP server to keep working unchanged, so that exposing it inside generations does not break outside-in use.
19. As a user, I want documents uploaded through the agent to land on the right coworker, so that conversational setup is as complete as the builder UI.
20. As a user, I want the agent to add skills to my workspace through the existing skill.add tool, so that it can finish "set this up for me" requests end to end.
21. As a platform operator, I want the Bap MCP Server excluded from Toolbox listings and allowlist resolution, so that the product invariant "the allowlist governs Workspace MCP Servers only" holds.
22. As a platform operator, I want Spawn Depth carried in the platform token claims and persisted on spawned runs, so that depth survives across sandbox boundaries and cannot be forged by the agent.

## Implementation Decisions

- **Platform MCP Server provisioning (new, deep module).** A pure builder in core that takes the
  Generation's acting user, workspace, and Spawn Depth and returns the runtime MCP server entry
  for the Bap MCP Server: gateway URL plus an Authorization header bearing a managed token.
  It is invoked for every Generation by the session pipeline and is entirely independent of
  Workspace MCP Server allowlist resolution — no workspace row, no Toolbox visibility, no
  per-coworker toggle.
- **Managed token claims gain the bap internal key and Spawn Depth.** The existing managed
  MCP token (short-lived, signed with the server secret, carrying user and workspace) is reused.
  The managed internal-key union gains `bap`, and claims gain the caller's Spawn Depth.
  Unlike other managed servers, `bap` is never reconciled into workspace MCP server rows.
- **Spawn depth guard (new, deep module).** Pure functions: read caller depth from verified
  claims (absent claim = depth zero, i.e. user- or trigger-initiated), decide whether starting a
  run is allowed against the platform maximum (three), and compute the child depth. The
  run-starting services (chat session start, coworker run trigger) consult the guard whenever
  the caller is runtime-originated and persist the child depth on the spawned run.
- **Schema change.** Spawned conversations and coworker runs persist their Spawn Depth (default
  zero). Provisioning for a Generation reads the persisted depth of its conversation/run when
  minting the platform token, which is how depth propagates across sandbox boundaries without
  trusting the agent.
- **oRPC accepts managed tokens (modified module).** The oRPC auth middleware accepts a managed
  MCP token as a Bearer credential: verify signature and expiry, resolve the acting user and
  workspace into the same authenticated context a logged-in user gets, and mark the context
  runtime-originated with the caller's Spawn Depth. Canonical Service Events and Audit Records
  for these calls carry the runtime-originated marker. Workspace scoping comes from the token,
  not from request parameters.
- **Bap MCP server accepts managed auth (modified module).** The server's client factory
  accepts the managed auth type with internal key `bap` in addition to the existing hosted
  OAuth path with audience `bap` (which remains for external agents). In the managed case it
  forwards the same managed token as the Bearer credential to oRPC — no token exchange.
- **Refusal contract.** When the guard refuses a run beyond maximum depth, the chat.run and
  coworker.run tools return a structured, agent-relayable error naming Spawn Depth and the
  limit; it is a tool-level refusal, not a Generation failure.
- **Session pipeline and reconciliation (modified, minimal).** The platform server entry is
  appended to the session's desired MCP servers for every Generation. Existing per-generation
  reconciliation, the Redis config cache, and MCP runtime warnings handle connection, reuse, and
  failure surfacing unchanged — a Bap MCP connection failure appears as a Runtime Warning
  like any other server's.
- **No rate limiting or token budgets in v1.** Spawn Depth alone removes the unbounded case
  (per ADR-0013).

## Testing Decisions

A good test exercises external behavior through the module's public interface — inputs in,
observable outcome out — and never asserts on internals or duplicates production logic. Per
repo policy, avoid mocks where possible and colocate tests as `*.test.ts`.

- **Spawn depth guard:** unit tests for depth extraction from claims (absent → zero), refusal
  exactly at the maximum, child depth computation, and the structured refusal shape.
- **Platform MCP server provisioning:** unit tests asserting the produced server entry (URL,
  header shape) and token claims (user, workspace, internal key `bap`, depth, expiry), and
  that provisioning needs no workspace MCP server rows. Prior art: the managed MCP auth tests
  in core (`managed-mcp-auth.test.ts`).
- **oRPC managed-token auth:** integration tests that a valid managed token resolves to the
  acting user's context with the runtime-originated marker set, and that expired, bad-signature,
  wrong-internal-key, and cross-workspace tokens are rejected.
- **Bap MCP server auth acceptance:** tests that the client factory accepts managed claims
  with internal key `bap`, still accepts hosted OAuth with audience `bap`, and returns
  needs-auth otherwise.
- **Reconciliation:** extend the existing opencode MCP reconciliation tests to assert the
  platform server is always present in the desired set and that its failure surfaces as a
  runtime warning. Prior art: `opencode-mcp-reconciliation.test.ts`.

## Out of Scope

- New tools on the Bap MCP server (e.g. coworker.update, coworker.delete, MCP
  server/credential management). The v1 surface is exactly the existing tools.
- Rate limiting, token budgets, or per-workspace spend controls on runtime-originated runs.
- Any Toolbox UI for platform servers — by decision they are invisible there.
- A scoped service principal distinct from the acting user (rejected in favor of the
  managed-token acting-user pattern; see ADR-0013).
- Changes to the external-agent OAuth flow beyond keeping it working.

## Further Notes

- The accepted risk to watch (ADR-0013): an email-triggered coworker processing untrusted mail
  can be asked to create and run coworkers as its owner, bounded by Spawn Depth and visible in
  the audit trail. If this bites, the recorded fallback is a per-coworker off switch — which is
  why the runtime-originated audit marker must land in v1.
- Spawn Depth lives in verified token claims and persisted rows, never in agent-visible
  parameters; the agent cannot lower its own depth.
- Managed tokens are short-lived; long-running generations rely on per-generation minting and
  reconciliation refresh, same as Galien/Modulr today.
