# Replace Executor with Native OpenCode MCP

Suggested Linear label/status: `ready-for-agent`

## Problem Statement

Bap's current workspace integration runtime is built around Executor, a separate daemon and tool catalog abstraction that does not match the foundation Bap wants long term. This creates extra runtime preparation, duplicated MCP concepts, Executor-specific product language, OpenAPI support that Bap no longer wants, and a wrapper tool path that hides OpenCode's native MCP capabilities.

## Solution

Remove Executor as a product and runtime foundation in a Big Bang refactor. Bap will model workspace runtime integrations as **Workspace MCP Servers**, keep **Workspace MCP Authorization** owned by Bap, and configure allowlisted servers through OpenCode's native MCP support before each **Generation**. The **Toolbox** remains the user-facing selection surface, while OpenCode exposes only successfully connected MCP tools to the model.

## User Stories

1. As a chat user, I want my selected Toolbox tools to be exposed directly through OpenCode MCP, so that tool use does not depend on an extra Executor daemon.
2. As a chat user, I want unavailable selected tools to appear as a visible Runtime Warning, so that I understand degraded tool access without the whole Generation failing.
3. As a chat user, I want Runtime Warnings to persist at the top of the run, so that refreshing the conversation does not hide missing tool availability.
4. As a chat user, I want the model to see only tools that are actually connected, so that it does not try to use unavailable MCP servers.
5. As a coworker owner, I want each coworker run to use the coworker's current Toolbox configuration, so that changed tool access takes effect on the next Generation.
6. As a coworker owner, I want removed tools to be disconnected before a reused session starts, so that old MCP access does not leak into later runs.
7. As a workspace admin, I want managed integrations and custom MCP endpoints represented by the same Workspace MCP Server model, so that access policy is consistent.
8. As a workspace admin, I want Bap to continue owning Workspace MCP Authorization, so that credentials, grants, revocation, and policy remain durable product state.
9. As a workspace admin, I want OpenCode to own only the per-generation MCP connection attempt, so that runtime behavior uses OpenCode's MCP support without moving auth state out of Bap.
10. As a workspace admin, I want custom OpenAPI/Executor sources removed, so that unsupported source formats do not remain as confusing product options.
11. As a developer, I want non-MCP future integrations wrapped as first-party MCP servers, so that MCP remains the single runtime integration boundary.
12. As a developer, I want no generic replacement discovery catalog, so that the refactor does not recreate Executor under a different name.
13. As a developer, I want OpenCode MCP state reconciled before every Generation, so that the runtime's connected servers match the current Workspace MCP Server Allowlist.
14. As a developer, I want per-generation MCP configuration to use OpenCode's native MCP configuration and status API, so that runtime access is configured explicitly before the first prompt.
15. As a developer, I want Executor-specific prompt sections removed, so that model behavior is based on native MCP tools rather than `executor_execute`.
16. As a developer, I want Executor-specific telemetry phases renamed or removed, so that traces describe the current MCP preparation path accurately.
17. As a developer, I want the sandbox image to stop installing Executor, so that runtime images are smaller and no longer trust or invoke the Executor package.
18. As a developer, I want schema and API names to use Workspace MCP Server language, so that code matches the domain glossary.
19. As a developer, I want hosted MCP OAuth to remain separate from Workspace MCP Authorization, so that inbound client authorization is not conflated with outbound runtime server auth.
20. As a support operator, I want Runtime Warnings to include which requested tools were unavailable, so that I can diagnose user reports without reading sandbox logs first.
21. As a support operator, I want Operational Logs and Canonical Service Events to record MCP reconciliation outcomes, so that production issues are observable without exposing secrets.
22. As a product user, I want UI copy to say tools or integrations in the Toolbox, so that I do not need to understand MCP unless I am in technical settings.
23. As a technical admin, I want settings surfaces to name Workspace MCP Servers clearly, so that I can manage exact endpoints and access.
24. As a migration operator, I want existing custom Executor/OpenAPI records deleted intentionally, so that stale unsupported configuration does not silently survive.
25. As a migration operator, I want managed Modulr and Galien access recreated as Workspace MCP Servers, so that existing managed workflows continue through native MCP.
26. As a test author, I want the new MCP reconciliation logic isolated behind a deep module, so that access-control behavior can be tested without launching full Generations.

## Implementation Decisions

- Perform a Big Bang refactor. Do not keep Executor compatibility shims, fallback code, or old product terminology.
- Replace the old Executor source model with **Workspace MCP Server** and **Workspace MCP Authorization** language.
- Drop OpenAPI support completely. Workspace runtime integrations are MCP-only.
- Delete existing custom Executor and OpenAPI source records during migration. Do not attempt automatic conversion.
- Recreate managed Modulr and Galien access as Workspace MCP Servers using their existing managed MCP endpoints.
- Preserve the first-party MCP server deployment layout. This refactor changes how runtimes consume those servers, not how those servers are packaged.
- Keep hosted MCP OAuth as a separate inbound authorization concern. Do not merge it with outbound Workspace MCP Authorization.
- Rename `allowedExecutorSourceIds` concepts to **Workspace MCP Server Allowlist** concepts across generation policy, coworker configuration, client types, control-plane contracts, and Toolbox APIs.
- Configure per-generation MCP access through OpenCode's native MCP configuration before the first prompt, and verify connection outcomes through OpenCode's MCP status API. Write the allowlisted servers into sandbox-local OpenCode config and restart OpenCode when that config changes.
- Build a deep OpenCode MCP reconciliation module with a small interface: given the current allowlist and resolved server configs, make OpenCode's connected MCP state match it and return connection outcomes.
- Reconcile MCP state before every Generation, including reused sessions, so stale tools are removed when Toolbox settings change between turns.
- Start the Generation with successfully connected MCP servers even if some requested servers fail to connect.
- Persist failed MCP configuration or connection outcomes as **Runtime Warnings** in the conversation surface as top-of-run warning messages.
- Do not inject Runtime Warnings into the model prompt. The model receives only the tools OpenCode successfully exposes.
- Remove Executor prompt sections and `executor_execute`-specific display behavior. Tool display should be based on native OpenCode MCP tool calls.
- Remove Executor daemon bootstrap, config writing, source refresh, secret injection, and OAuth reconcile code paths.
- Remove Executor package installation and trust steps from sandbox images and sandbox debug scripts.
- Replace Executor preparation metrics and trace spans with MCP reconciliation metrics that describe server resolution, state reconciliation, connection attempts, and warning creation.
- Keep Toolbox UI selectable based on Bap access policy. Do not pre-hide servers just because a runtime connection may fail.
- Use user-facing copy such as "tools" or "integrations" in Toolbox surfaces, while technical/admin surfaces can say "MCP server".
- Treat Runtime Warnings as visible product state, distinct from Operational Logs.
- Redact credentials and headers in logs, warnings, traces, and diagnostics.

## Testing Decisions

- Test external behavior and access-control outcomes. Do not duplicate OpenCode internals or assert implementation-only call sequences beyond the public reconciliation contract.
- Unit test the Workspace MCP Server registry/resolution module for managed servers, custom MCP servers, access policy filtering, and deleted OpenAPI support.
- Unit test Workspace MCP Authorization for credential hydration, redaction, missing credential handling, and separation from hosted MCP OAuth.
- Unit test the OpenCode MCP reconciliation module with a fake OpenCode MCP client for add, connect, disconnect, stale server removal, partial failure, and idempotent reruns.
- Test reused-session behavior: a later Generation with a narrower Toolbox must remove previously connected MCP servers before prompt start.
- Test partial failure behavior: one failed allowlisted server creates a Runtime Warning while other servers remain available and the Generation starts.
- Test that Runtime Warnings persist as top-of-run conversation messages and are restored after reload/history reads.
- Test that Runtime Warnings are not included in prompt composition.
- Test coworker configuration and control-plane contracts using the renamed Workspace MCP Server Allowlist fields.
- Test Toolbox UI behavior for selectable servers, warning display, and user-facing copy.
- Test destructive migration behavior against sample old Executor/OpenAPI records and managed Modulr/Galien records.
- Update existing OpenCode MCP session tests as prior art for native MCP configuration and status verification.
- Update existing executor source tests into Workspace MCP Server tests where they still test useful behavior; delete tests that only preserve Executor behavior.
- Update Perfetto/trace tests to assert the new MCP reconciliation spans rather than old Executor preparation spans.
- Acceptance requires the live Linear CLI E2E command to pass: `bun run test:e2e:cli:live` for the Linear scenario.
- Run focused tests for changed modules as they are implemented, then run `bun run check`; after the large refactor, run the full test suite.

## Out of Scope

- Changing the first-party MCP server app layout.
- Adding a new generic discovery/search catalog for tools.
- Supporting OpenAPI sources directly.
- Automatically converting custom Executor/OpenAPI sources into MCP servers.
- Moving Bap-owned Workspace MCP Authorization into OpenCode's local auth store.
- Merging hosted MCP OAuth with outbound Workspace MCP Authorization.
- Building new first-party MCP wrappers for future non-MCP integrations.
- Changing unrelated coworker behavior beyond Toolbox and Workspace MCP Server Allowlist semantics.
- Changing lint rules.

## Further Notes

This PRD follows ADR 0009, **Replace Executor with native OpenCode MCP**. `CONTEXT.md` now defines **Workspace MCP Server**, **Workspace MCP Authorization**, **Workspace MCP Server Allowlist**, **Toolbox**, and **Runtime Warning** for this refactor.
