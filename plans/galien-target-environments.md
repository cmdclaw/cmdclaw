# Implement Galien Target Environments

Save this file as `plans/galien-target-environments.md`.

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. It follows the repository skill at `.agents/skills/execplan/SKILL.md`.

## Purpose / Big Picture

Bap currently validates and invokes Galien against Galien preproduction only. After this change, an admin can grant Galien MCP access to a user and select whether that user uses Galien production or Galien preproduction in that workspace. New Galien access defaults to production, while preproduction remains available for test users. A user can store separate Galien credentials for production and preproduction, and runtime MCP calls use the same environment that was selected by the workspace access policy.

The behavior is visible in three places: the admin MCP page shows an environment control for Galien access entries, the Galien connection flow validates credentials against the active workspace's selected environment, and Galien MCP tool requests use the API base URL returned by the web app's internal credential endpoint.

## Progress

- [x] (2026-05-26T15:20:03Z) Read the PRD and relevant Galien service, MCP client, schema, hooks, and admin UI files.
- [x] (2026-05-26T15:24:29Z) Add schema fields and core Galien target environment helpers.
- [x] (2026-05-26T15:24:29Z) Thread target environment through Galien credential validation, storage, status, deletion, and internal runtime credential payloads.
- [x] (2026-05-26T15:24:29Z) Update ORPC hooks and admin UI to add and update Galien target environments.
- [x] (2026-05-26T15:24:29Z) Update the MCP Galien client to use explicit API base URLs from managed credentials.
- [x] (2026-05-26T15:24:29Z) Add and update focused tests for Galien service, MCP client, Galien tools, and admin MCP UI.
- [x] (2026-05-26T15:27:53Z) Run package checks and focused tests, then record outcomes.

## Surprises & Discoveries

- Observation: The working tree already contains unrelated SLO, skill, and schema changes.
  Evidence: `git status --short` shows modified SLO files and untracked SLO tests before this implementation began.

- Observation: Existing Galien code hard-codes `https://api.frontline.galien.preprod.webhelpmedica.com` in both the core service and MCP client.
  Evidence: `packages/core/src/server/galien/service.ts` and `apps/mcp/servers/galien/src/lib/galien-client.ts` each define a preproduction `GALIEN_BASE_URL`.

- Observation: Focused Galien service and MCP tests pass after introducing explicit target environments.
  Evidence: `bun test packages/core/src/server/galien/service.test.ts` reports 8 pass, and `bun test apps/mcp/servers/galien/src/lib/galien-client.test.ts apps/mcp/servers/galien/src/test/get_clients_by_client_id_appointments.test.ts apps/mcp/servers/galien/src/test/get_users_by_user_id_appointments.test.ts` reports 12 pass.

- Observation: The admin MCP UI behavior is covered by a new focused Vitest file.
  Evidence: `bunx vitest run src/app/admin/mcp/page.test.tsx src/app/admin/page.test.tsx` from `apps/web` reports 2 files passed and 6 tests passed.

- Observation: A direct root `bun test apps/web/src/app/admin/page.test.tsx` invocation is not the right runner for web React tests.
  Evidence: Running from the repo root failed to resolve the `@/` alias; running via Vitest from `apps/web` with test env values passed.

- Observation: The local database schema push completed after editing `packages/db/src/schema.ts`.
  Evidence: `bun run --cwd apps/web db:push` ended with `[✓] Changes applied`.

## Decision Log

- Decision: Do not commit during this implementation.
  Rationale: The repository `AGENTS.md` says not to commit unless the user explicitly asks, which overrides the generic ExecPlan advice to commit frequently.
  Date/Author: 2026-05-26 / Codex

- Decision: Implement a clean schema shape without a compatibility migration.
  Rationale: The user confirmed there is only one current Galien user and they will recreate access if needed. This avoids fallback logic and matches the repository preference for Big Bang Rewrite during larger refactors.
  Date/Author: 2026-05-26 / Codex

- Decision: Store target environment on Galien workspace access and on Galien credentials.
  Rationale: Workspace access owns policy, while credentials are environment-specific and must not overwrite each other across production and preproduction.
  Date/Author: 2026-05-26 / Codex

## Outcomes & Retrospective

Implemented. Admins can select `prod` or `preprod` when adding Galien access and can update existing Galien access rows in place. The web app resolves the selected target environment before validating credentials or returning runtime credentials. Galien credentials are scoped by user and target environment. The MCP Galien client now uses the API base URL supplied by the web app and defaults direct environment-variable usage to production. Focused tests, package checks, and local `db:push` passed.

## Context and Orientation

The root `CONTEXT.md` defines two terms used by this plan. A **Galien Target Environment** is the Galien deployment selected by workspace access policy for a specific Bap user in a specific workspace. A **Galien Credential** is the username and password a user stores for one Galien Target Environment.

The database schema lives in `packages/db/src/schema.ts`. The existing `galien_workspace_access` table grants one email access to Galien inside one workspace. The existing `galien_credential` table stores one encrypted username/password per Bap user. This plan changes that to one credential per user and target environment.

The core Galien service lives in `packages/core/src/server/galien/service.ts`. It currently validates credentials against a hard-coded preproduction URL, lists and mutates access rows, and decrypts credentials for runtime.

The web ORPC router lives in `apps/web/src/server/orpc/routers/galien.ts`. ORPC is the typed remote procedure call layer used by the web UI. The router currently exposes status, connect, disconnect, admin list, admin add, and admin remove operations.

The internal MCP credential endpoint lives in `apps/web/src/app/api/internal/mcp/galien-credentials/route.ts`. The MCP runtime calls this endpoint with a user id and workspace id. It should remain the policy owner and return both credentials and the resolved Galien API base URL.

The MCP Galien client lives in `apps/mcp/servers/galien/src/lib/galien-client.ts`. It currently builds login and request URLs from a hard-coded preproduction base URL. Managed runtime credentials are fetched through `apps/mcp/shared/control-plane.ts`, then used by Galien tool helpers in `apps/mcp/servers/galien/src/lib/tool-helpers.ts`.

The admin UI for MCP access lives in `apps/web/src/app/admin/mcp/page.tsx`, with React Query hooks in `apps/web/src/orpc/hooks.ts`. The UI currently renders Galien and Modulr access panels with email add/remove controls. This plan adds environment controls only to Galien.

## Plan of Work

First, update `packages/db/src/schema.ts` so `galien_workspace_access` has a `targetEnv` text column defaulting to `prod`, and `galien_credential` has a `targetEnv` text column defaulting to `prod`. Change the Galien credential unique index from user-only to user plus target environment.

Second, update `packages/core/src/server/galien/service.ts` to define a stable `GalienTargetEnv` type with values `prod` and `preprod`, a parser for untrusted values, and a resolver that maps those values to `https://api.frontline.galien.webhelpmedica.com` and `https://api.frontline.galien.preprod.webhelpmedica.com`. Update credential validation to accept a target environment and post to the corresponding login URL. Update access lookup to return the access entry, not only a boolean, because status and runtime credentials need the selected environment. Update add and update functions so admins can set and later edit the access row target environment. Update credential status, set, get, and delete operations to be scoped to a target environment.

Third, update `apps/web/src/server/orpc/routers/galien.ts` so status and connect resolve the active workspace's Galien access entry and use its target environment. Add an admin update operation that accepts an access id and target environment. Make admin add accept an optional target environment while still defaulting to production.

Fourth, update `apps/web/src/app/api/internal/mcp/galien-credentials/route.ts` and `apps/mcp/shared/control-plane.ts` so the internal response includes `targetEnv` and `apiBaseUrl`. The endpoint must check workspace access before returning credentials, then fetch credentials for the selected environment only.

Fifth, update `apps/mcp/servers/galien/src/lib/galien-client.ts` so credential objects may include `apiBaseUrl`. Every login and request URL should use the explicit base URL when supplied, falling back to the production API base URL for direct environment-variable credentials. Update tests to prove preproduction can be selected by managed credentials.

Sixth, update `apps/web/src/orpc/hooks.ts` and `apps/web/src/app/admin/mcp/page.tsx`. Add a Galien update hook. Extend the Galien access panel to show a production/preproduction selector for new entries and for existing rows. Invalidate Galien admin access, Galien status, and executor source queries after add, update, and remove.

Seventh, add focused tests. Service tests should cover URL selection for validation and basic helper behavior. MCP client tests should cover default production and explicit preproduction. UI tests should cover admin Galien environment selection if the existing test harness supports this page cleanly. Run focused tests first, then `bun run --cwd apps/web check` because `apps/web/AGENTS.md` requires it after web changes.

## Concrete Steps

Run commands from `/Users/baptiste/Git/bap`.

Inspect the current state:

    git status --short
    rg -n "GALIEN_BASE_URL|galienWorkspaceAccess|galienCredential|adminAddAccess|requestGalienForCurrentUser" packages apps

Apply code edits with `apply_patch`, keeping unrelated working tree changes intact.

Run focused tests as the relevant files are changed:

    bun test packages/core/src/server/galien/service.test.ts
    bun test apps/mcp/servers/galien/src/lib/galien-client.test.ts

Run web validation after UI and router changes:

    bun run --cwd apps/web check

If a command fails, fix the underlying issue and rerun the same command until it passes or a genuine external blocker is found.

## Validation and Acceptance

Acceptance is met when a human can observe these behaviors through tests and type checks:

New Galien workspace access defaults to `prod`, and admin add/update can persist `preprod`.

Galien credential validation posts to the production login URL for `prod` and preproduction login URL for `preprod`.

Galien credentials are looked up and stored by `(userId, targetEnv)`, so saving preproduction credentials cannot overwrite production credentials.

The Galien status for a workspace reports whether credentials are connected for that workspace access entry's target environment.

The internal MCP Galien credential endpoint returns `targetEnv` and `apiBaseUrl` only after verifying workspace access.

The MCP Galien client uses the supplied `apiBaseUrl` for login and tool requests.

The admin MCP page can add Galien access with production/preproduction selection and change the target environment on existing Galien access rows.

Focused tests pass, and `bun run --cwd apps/web check` passes or any failure is documented as unrelated to the edited files.

## Idempotence and Recovery

All code edits are ordinary source changes and can be re-applied or adjusted safely. The plan intentionally avoids a live data migration because the user will recreate the current Galien access. If schema application is needed locally, follow `apps/web/AGENTS.md` and run `bun run db:push` from `apps/web` after reviewing the schema diff. Do not run destructive database commands.

The working tree was dirty before this plan. Do not revert unrelated modified or untracked files. Use `git diff -- <path>` for files touched by this plan before final reporting.

## Artifacts and Notes

The PRD that drives this plan is `docs/prd/galien-target-environments.md`.

Current hard-coded preproduction URLs:

    packages/core/src/server/galien/service.ts: const GALIEN_BASE_URL = "https://api.frontline.galien.preprod.webhelpmedica.com";
    apps/mcp/servers/galien/src/lib/galien-client.ts: const GALIEN_BASE_URL = "https://api.frontline.galien.preprod.webhelpmedica.com";

## Interfaces and Dependencies

In `packages/core/src/server/galien/service.ts`, expose these stable interfaces:

    export type GalienTargetEnv = "prod" | "preprod";
    export const DEFAULT_GALIEN_TARGET_ENV: GalienTargetEnv = "prod";
    export function parseGalienTargetEnv(value: unknown): GalienTargetEnv;
    export function getGalienApiBaseUrl(targetEnv: GalienTargetEnv): string;

Access operations should accept and return `targetEnv`. Credential operations should accept `targetEnv` for validation, status, set, get, and delete behavior.

In `apps/mcp/shared/control-plane.ts`, `getManagedGalienCredentials` should return:

    {
      username: string;
      password: string;
      displayName: string | null;
      galienUserId: number | null;
      targetEnv: "prod" | "preprod";
      apiBaseUrl: string;
    }

In `apps/mcp/servers/galien/src/lib/galien-client.ts`, `GalienCredentials` should include optional `apiBaseUrl?: string`, and request helpers should use that value for both login and subsequent Galien API requests.

Revision note 2026-05-26: Initial plan created from `docs/prd/galien-target-environments.md` after inspecting current Galien service, schema, MCP client, hooks, and admin UI.

Revision note 2026-05-26: Implementation completed and validation results recorded. The plan now reflects that the admin MCP UI test was added and that direct Bun test execution is not suitable for the existing web Vitest files.
