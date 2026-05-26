## Problem Statement

CmdClaw currently treats Galien as a single managed MCP integration, but Galien has separate production and preproduction deployments. Some users need to run Galien tools against preproduction while most users should run against production by default.

Today the Galien integration is hard-coded to preproduction for credential validation and tool execution. This makes production the exception instead of the default, gives admins no explicit control over each user's **Galien Target Environment**, and risks validating or invoking Galien against the wrong deployment.

Prepared Linear issue:

- Title: Galien: add admin-selected target environments
- Team: `cmdlaw`
- Suggested label/status: `ready-for-agent`

## Solution

Admins can select each allowed user's **Galien Target Environment** from the Galien MCP access UI. New Galien access entries default to production. Admins can change an existing access entry between production and preproduction without removing access or deleting credentials.

CmdClaw validates **Galien Credentials** against the selected **Galien Target Environment** for the active workspace. Runtime Galien MCP tool calls use the same target environment that the web app authorizes for that user and workspace.

**Galien Credentials** are stored per **User** and per **Galien Target Environment**. A credential validated against production is not assumed valid for preproduction, and a credential validated against preproduction is not assumed valid for production.

## User Stories

1. As an admin, I want newly added Galien users to default to production, so that normal users use the live Galien deployment without extra configuration.
2. As an admin, I want to select preproduction for a Galien user, so that test users can safely use the preproduction Galien deployment.
3. As an admin, I want to see each Galien user's selected target environment, so that workspace access policy is visible at a glance.
4. As an admin, I want to change an existing Galien access entry between production and preproduction, so that I do not need to remove and re-add access.
5. As an admin, I want changing a Galien access entry to preserve the user's access row, so that audit-relevant access metadata remains stable.
6. As an admin, I want changing a Galien access entry to preserve saved credentials, so that credentials for the other environment are not destroyed.
7. As an admin, I want Galien environment choices to be scoped by workspace, so that the same **User** can target different deployments in different workspaces.
8. As a Galien user, I want my connection form to validate against my workspace's selected **Galien Target Environment**, so that a successful connection means my tools will work in that workspace.
9. As a Galien user assigned to production, I want my credentials validated against production, so that I do not accidentally save preproduction-only credentials.
10. As a Galien user assigned to preproduction, I want my credentials validated against preproduction, so that I can connect with preproduction-only credentials.
11. As a Galien user, I want my production credential and preproduction credential to be stored separately, so that connecting to one environment does not overwrite the other.
12. As a Galien user, I want switching workspaces to reflect the selected workspace's Galien access policy, so that the connection status matches the active workspace.
13. As a Galien user, I want the toolbox Galien status to indicate whether credentials are connected for the selected environment, so that I know when I need to reconnect.
14. As a Galien user, I want disconnecting Galien credentials to remove only the relevant saved credential behavior agreed for the active environment, so that unrelated workspace access is not confused with credential state.
15. As a Galien user, I want Galien tool calls to use the same environment used during validation, so that I do not pass setup and fail at runtime because of an environment mismatch.
16. As a Galien user, I want retained credentials to remain unusable without workspace access, so that credentials alone do not grant tool access.
17. As an MCP runtime, I want to receive the authorized target environment and API base URL with Galien credentials, so that I do not re-derive workspace policy.
18. As an MCP runtime, I want Galien request URL construction to use an explicit API base URL, so that production and preproduction calls are routed correctly.
19. As a developer, I want a single domain helper to resolve Galien target environment metadata, so that validation and runtime calls cannot drift.
20. As a developer, I want Galien target environment values constrained to production and preproduction, so that unsupported deployments cannot be persisted accidentally.
21. As a developer, I want admin updates to invalidate Galien status and executor-source queries, so that UI state refreshes after an environment change.
22. As a developer, I want tests proving production is the default for new access entries, so that future changes do not regress the default.
23. As a developer, I want tests proving credentials are unique per user and target environment, so that preproduction saves do not overwrite production saves.
24. As a developer, I want tests proving the internal MCP credential endpoint returns the authorized target environment and base URL, so that runtime behavior is explicit.
25. As a developer, I want tests proving Galien tool requests use the returned base URL, so that the MCP server no longer depends on a hard-coded preproduction URL.

## Implementation Decisions

- Add **Galien Target Environment** to workspace Galien access policy. The value is selected per allowed user per workspace.
- New Galien workspace access entries default to production.
- Do not implement a compatibility migration for existing Galien rows. Current live Galien usage is disposable, and the existing access can be recreated.
- Store **Galien Credentials** per **User** and **Galien Target Environment**, not globally per **User**.
- Credential validation uses the target environment selected by the active workspace's Galien access entry.
- Runtime Galien MCP calls use the same target environment selected by workspace access policy.
- The web app remains the policy owner. The internal Galien credential endpoint returns username, password, display name, Galien user id, target environment, and resolved API base URL.
- The MCP server consumes the target environment/base URL returned by the web app rather than independently looking up or guessing policy.
- Removing Galien workspace access does not delete saved **Galien Credentials**. Workspace access and credential lifecycle stay separate.
- Credentials retained after access removal are not usable because the internal credential endpoint must check workspace access before returning any credential.
- Admins can update the target environment on an existing Galien access entry without deleting the entry.
- Admin UI should present the environment control only for Galien access, not for Modulr access.
- Use production and preproduction as user-facing labels. Use stable internal enum values such as `prod` and `preprod`.
- Extract a deep Galien target environment module or helper that owns the allowed values and base URL mapping. This gives validation, internal API responses, and MCP requests a shared interface.
- Keep environment selection out of the user's credential identity. A **Galien Credential** belongs to a target environment, but the workspace access entry chooses which credential is relevant.

## Testing Decisions

- Tests should assert external behavior: selected environment affects login URL, saved credential lookup, internal credential payloads, and MCP request URLs.
- Tests should not duplicate Galien URL mapping logic in assertions beyond checking the observable production/preproduction base URL used by the request.
- Add service-level tests for target environment resolution, production default on access creation, admin target updates, and per-user-per-environment credential lookup.
- Add router/API tests where existing patterns allow it, proving connect validates against the active workspace's target environment and admin update accepts only supported values.
- Add MCP client tests proving URL building and login requests use an explicit Galien API base URL.
- Add web/admin component tests proving the Galien access panel shows an environment selector and sends the chosen target environment when adding or updating access.
- Prior art exists in the Galien service helper tests, Galien MCP client tests, admin page tests, and workspace executor source tests.
- Follow the repo testing rule: avoid mocks where practical, test actual implementation, and rerun the failing or targeted command until the underlying issue is fixed.
- Run focused tests for changed Galien service, Galien MCP client, admin UI, and any router/API tests added.
- Run the web app check command for type and lint coverage after implementation.

## Out of Scope

- Migrating existing Galien production data.
- Automatically copying credentials between production and preproduction.
- Supporting arbitrary/custom Galien base URLs.
- Adding non-admin user controls for selecting Galien deployment.
- Creating or updating Linear issues directly.
- Changing Modulr MCP access behavior.
- Changing hosted MCP OAuth semantics beyond preserving the existing Galien access check.
- Auditing or backfilling historical Galien tool calls by environment.

## Further Notes

- Current code hard-codes Galien to preproduction in the shared Galien service and MCP Galien client.
- The existing database model has Galien workspace access and Galien credentials as separate concepts, which matches the desired permission/credential split.
- `CONTEXT.md` now defines **Galien Target Environment** and **Galien Credential** for this feature.
- The implementation should be safe as a Big Bang Rewrite for Galien environment handling because existing live Galien usage can be recreated.
