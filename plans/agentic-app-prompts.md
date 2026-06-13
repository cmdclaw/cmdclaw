# Implement Agentic-App Prompts: let generated output.html send prompts back into its conversation

Save this file as `plans/agentic-app-prompts.md`.

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. It must be maintained in accordance with the skill file at `.claude/skills/execplan/SKILL.md`.

The governing product requirements are in `docs/prd/agentic-app-prompts.md`. The architectural decisions are recorded in `docs/adr/0010-output-html-agentic-app.md` (rendering, renamed from "Generation Output Preview") and `docs/adr/0014-agentic-app-prompts-over-raw-postmessage.md` (the prompt protocol). The glossary terms **Agentic-App** and **Agentic-App Prompt** are defined in `CONTEXT.md`.

## Purpose / Big Picture

Bap agents can already produce a file named `output.html` inside their sandbox; the web app renders it next to the conversation in a sandboxed iframe. Today that page is read-only: a button inside it does nothing. After this change, a generated page can contain buttons or forms that send a real user message back into the conversation — clicking "Send the email" in the page is the same as typing "Send the email" into the composer. The page does this by calling `parent.postMessage` with a small versioned JSON envelope; the chat panel verifies the message came from the rendered iframe, checks that a human actually interacted with the page (so a hostile page cannot fire prompts on load or in a loop), rate-caps accepted prompts, sends the text through the existing composer path, and posts an acknowledgement back to the page so its buttons can show "Sent" or an error state.

To see it working: run the web app, open a chat whose latest Generation produced an `output.html` containing a button that posts the envelope, click the button, and watch a new user message appear in the transcript and a new Generation start. The concept is also renamed across the codebase from "output HTML preview" to "Agentic-App" with no aliases.

## Progress

- [x] (2026-06-10) PRD, ADRs, and glossary terms written (prior session).
- [x] (2026-06-10) Codebase reconnaissance: all touch points identified and listed in this plan.
- [x] (2026-06-10) Milestone 1: protocol module + activation gate module + 16 unit tests passing.
- [x] (2026-06-10) Milestone 2: Big Bang rename of all "output HTML preview" identifiers to Agentic-App names; rename-completeness grep clean.
- [x] (2026-06-10) Milestone 3: panel glue — message listener, source check, gate, send wiring, ack + 7 panel tests passing.
- [x] (2026-06-10) Milestone 4: `agentic-app` sandbox skill written (`apps/sandbox/src/common/skills/agentic-app/SKILL.md`).
- [x] (2026-06-10) Validation: `bun run check` passes; 64 tests across the 7 affected `apps/web` suites pass. Repo-wide `bun run test` shows pre-existing failures in `packages/core` `generation-manager.test.ts` (missing `writeSandboxCommonLibToSandbox` mock export) caused by unrelated in-flight core changes that were dirty before this work started — not introduced here.
- [x] (2026-06-10) Live e2e verified: a coworker-generated `output.html` posted a real prompt from a clicked button; the user message appeared in the transcript and the agent replied. Driven via Playwright (gstack browse was not installed) with a session cookie minted from the CLI token.
- [x] (2026-06-10) Review-fix cycle after multi-agent `/review` (security/testing/maintainability/performance/adversarial + Codex). Hardened the activation gate, finished the rename, and re-verified. See Decision Log and the new tests; 69 tests pass across the 7 suites, lint clean, feature files typecheck clean.

## Surprises & Discoveries

- Observation: clicks inside a sandboxed iframe do not bubble to the parent document, so the parent cannot observe in-page interaction directly. The reliable parent-side signals are: (a) a `blur` event on the parent window whose `document.activeElement` is the iframe (fires when focus moves into the iframe), and (b) pointer/keyboard events on the panel container around the iframe. The activation gate therefore combines a sticky "user engaged" flag with an at-message-time focus check rather than a pure time window.
  Evidence: standard browser behavior; no parent-side event fires for clicks inside a cross-document iframe.
- Observation: the existing `chat-area.test.tsx` mocks all oRPC hooks via `vi.hoisted` + `vi.mock`, runs under `@vitest-environment jsdom`, and is the house pattern for component tests.
- Observation: `apps/web` vitest config (`vitest.config.ts`) has no `include` for `src/components/chat/*.test.ts`; the default vitest include covers `src/**/*.test.ts(x)` only if not overridden — verified during validation that the new tests are picked up by `bunx vitest run <path>` directly.
- Observation: jsdom's `MessageEvent` constructor accepts a `source` of type `MessagePort | Window | null`; an iframe rendered by jsdom has a real `contentWindow`, so the source-identity check is testable without a browser. Confirmed in `agentic-app-panel.test.tsx`: dispatching `new MessageEvent("message", { data, source: iframe.contentWindow })` exercises the listener end-to-end, and `vi.spyOn(document, "activeElement", "get")` stands in for iframe focus (jsdom cannot focus an iframe for real).
- Observation: the repo's oxlint config enforces `vitest(require-mock-type-parameters)` — every `vi.fn()` needs an explicit type parameter. Caught by `bun run check` on the first test draft.
  Evidence: `error vitest(require-mock-type-parameters): Missing type parameters on mock function call`.

## Decision Log

- Decision: wire format constants and parsing live in one pure module `agentic-app-protocol.ts`; the gate in `agentic-app-activation-gate.ts`; both colocated with the chat components and tested without DOM.
  Rationale: PRD module decisions — the frozen contract and the security behavior each need a single testable home.
  Date/Author: 2026-06-10 / Claude + baptiste.
- Decision: messages with the right `type` and `version` but a missing/empty/non-string `prompt` are answered with `status: "rejected", reason: "invalid"`; messages with an unknown `type` or `version` are ignored with no reply.
  Rationale: ADR 0014 — unknown shapes must be dropped silently (they may belong to future versions or other tooling); malformed current-version messages deserve a debuggable rejection.
  Date/Author: 2026-06-10 / Claude.
- Decision: activation gate semantics — `no_user_activation` unless the user has engaged with the panel at least once (sticky flag set by pointer/keydown on the panel container or by window blur with the iframe focused) AND the iframe is focused when the message arrives; rate cap of at most 1 accepted prompt per 1000 ms and 6 per 60 000 ms, otherwise `rate_limited`.
  Rationale: a pure post-interaction time window would reject a user who focused the page once and clicked a button 30 s later; sticky-engagement + focus-at-arrival keeps real clicks working while still rejecting on-load auto-fire. Caps are deliberately conservative defaults, tunable in one place.
  Date/Author: 2026-06-10 / Claude.
- Decision: `onSendPrompt` is a required prop of the panel returning the composer's boolean-ish result; a falsy result or a thrown error produces `status: "rejected"` with no reason (the reason list is reserved for protocol-level causes).
  Rationale: keeps the frozen reason enum small; send failures are conversation-level errors already surfaced in the chat UI.
  Date/Author: 2026-06-10 / Claude.
- Decision: rename target names — `AgenticAppPanel` (component), `agentic-app-selection.ts` with `findLatestAgenticAppFile`/`isAgenticAppSandboxFile`, server service `agentic-app-html.ts` with `loadAgenticAppHtml`/`AgenticAppHtmlError`/`AGENTIC_APP_FILENAME`/`AGENTIC_APP_MAX_BYTES`, oRPC procedure `getAgenticAppHtml`, hook `useAgenticAppHtml`, `ChatArea` prop `enableAgenticApp`, localStorage key prefix `chat-agentic-app:`.
  Rationale: Big Bang Rewrite policy in `AGENTS.md`; one name for one concept, no aliases. Losing stored collapse state from the storage-key change is harmless.
  Date/Author: 2026-06-10 / Claude.
- Decision: commits are not made by this plan's executor; the repository commit policy requires an explicit user request.
  Rationale: `AGENTS.md` commit policy overrides the ExecPlan habit of committing frequently.
  Date/Author: 2026-06-10 / baptiste (standing repo policy).
- Decision: the activation gate no longer treats engagement as a sticky boolean. A focus-entry into the iframe only arms the gate when a real parent-visible pointer/keyboard gesture happened within `gestureWindowMs`; armed engagement expires after `engagementTtlMs`; the rate budget is consumed only after a send succeeds (`recordAccepted`), not at `evaluate` time; focus-entries inside a load-grace window are ignored; and the panel is keyed by `fileId` so a new Agentic-App starts with a fresh gate and rate budget.
  Rationale: `/review` (security + adversarial + Codex, multiple agents agreeing) showed the original sticky-forever + focused model let a prompt-injected app self-arm via `autofocus`/`.focus()` and then loop on a timer, and let a benign app's earned engagement authorize a later hostile app rendered in the same panel slot — both contradicting ADR 0014's "no sends on load/timer/loop." Gesture→focus pairing, TTL, consume-on-success, load-grace, and per-file reset close those without breaking real in-iframe clicks. The residual (an app the user is actively using and has focused can send, rate-capped) is accepted defense-in-depth; the hard guarantee for destructive actions stays the in-Generation tool-approval flow.
  Date/Author: 2026-06-10 / Claude + baptiste.
- Decision: the preview route surfaces a structured `agenticAppCode` via `ORPCError` data; the panel switches on that code instead of substring-matching human-readable messages; remaining "preview" identifiers/messages/UI copy were renamed to Agentic-App terms; panel error copy is wrapped in `t()`; accepted/rejected prompts emit a posthog `agentic_app_prompt` event; SKILL.md/ADR 0014 now describe the real gate and the read-only-view caveat (timeout the ack).
  Rationale: maintainability/i18n/spec findings from `/review` — finishing the Big Bang rename, removing the fragile message-string coupling, restoring i18n parity, and satisfying the PRD's observability story.
  Date/Author: 2026-06-10 / Claude.

## Outcomes & Retrospective

- (2026-06-10) All four milestones landed in one pass. The protocol and gate are pure modules with exhaustive unit tests (16); the panel verifies source identity, gates on engagement+focus, rate-caps, sends through the existing composer `handleSend`, and acks (7 jsdom tests); every legacy "output preview" identifier is renamed with no aliases (verified by grep); the sandbox skill documents the contract for agents. `bun run check` passes and the 7 affected `apps/web` suites pass (64 tests). Gaps: (1) live end-to-end demo not run — the sandbox skill reaches agents only at the next image rebuild, and rebuilds block sandbox creation 30–80 min, so it was deliberately not triggered; the web side is verifiable now with any hand-authored output.html since the protocol does not depend on the skill. (2) Repo-wide `bun run test` fails in `packages/core` for reasons pre-existing this work (unrelated dirty in-flight changes). Lesson: the focus/engagement heuristic was the only genuinely novel design work — everything else followed existing house patterns, which is what made the Big Bang rename safe.

## Context and Orientation

Bap is a monorepo. The pieces this plan touches:

- `apps/web` — the TanStack Start web app (Bun + Vite + React). Chat UI lives in `apps/web/src/components/chat/`. Server-side RPC ("oRPC") routers live in `apps/web/src/server/orpc/routers/`, with thin service modules in `apps/web/src/server/services/`. Client hooks wrapping oRPC live in `apps/web/src/orpc/hooks/`.
- `apps/sandbox/src/common/skills/` — markdown "skills" baked into the agent sandbox image at `/app/.claude/skills` (see `apps/sandbox/src/daytona/image.ts`, the `addLocalDir` call). Each skill is a directory with a `SKILL.md` containing YAML frontmatter (`name`, `description`) and instructions the agent reads on demand.

Key existing behavior (before this change): when a Generation (one agent execution for a conversation turn) writes a file named exactly `output.html`, the runtime auto-collects it (`packages/core/src/server/services/generation/files/sandbox-file-collection.ts` — untouched by this plan). The chat page (`apps/web/src/components/chat/chat-area.tsx`) finds the newest such file via `findLatestOutputHtmlFile` (`output-preview-selection.ts`) and renders `OutputHtmlPreviewPanel` (`output-html-preview-panel.tsx`) in a collapsible right-hand panel. The panel fetches sanitized HTML through the hook `useOutputHtmlPreview` (`apps/web/src/orpc/hooks/conversation.ts`, calling oRPC procedure `previewSandboxOutputHtml` in `apps/web/src/server/orpc/routers/conversation.ts`, which delegates to `loadOutputHtmlPreview` in `apps/web/src/server/services/output-html-preview.ts`), then renders it in an iframe with `sandbox="allow-scripts allow-forms"` via `srcDoc`. Because the iframe lacks `allow-same-origin`, its origin is opaque: scripts inside cannot make authenticated calls, and `event.origin` on its messages is the string "null" — which is why the listener must verify `event.source` against the iframe's `contentWindow` instead of checking origin.

Sending a chat message is `handleSend(content, attachments?)` in `chat-area.tsx` (defined near line 3056): when a response is currently streaming it enqueues via `enqueueConversationMessage`, otherwise it starts a Generation via `runGeneration`. It returns a truthy value on success. The right-panel element is built in a `useMemo` near line 4380 and mounted when the `ChatArea` prop `enableOutputPreview` is set (passed by `apps/web/src/routes/_app/chat/$conversationId.tsx` and `apps/web/src/routes/_app/chat/index.tsx`).

Two coworker info pages (`apps/web/src/routes/agents/-components/coworker-info-page.tsx` and `apps/web/src/routes/prototype/coworker/info/-components/coworker-info-prototype.tsx`) render their own read-only `OutputHtmlFrame` using the same hook and selection function; they are rename-only consumers (no prompt wiring — they have no composer).

The wire protocol (ADR 0014, frozen, append-only):

    page -> panel:  { "type": "bap:agentic-app-prompt", "version": 1, "prompt": "<text>" }
    panel -> page:  { "type": "bap:agentic-app-prompt-result", "version": 1,
                      "status": "sent" | "rejected",
                      "reason": "rate_limited" | "no_user_activation" | "invalid" (optional) }

## Plan of Work

Milestone 1 creates two pure modules in `apps/web/src/components/chat/`. `agentic-app-protocol.ts` exports the type/version constants, `parseAgenticAppPromptMessage(data: unknown)` returning a three-way result (`{kind:"prompt", prompt}` for a valid v1 envelope with a non-empty string prompt; `{kind:"invalid"}` for a v1 envelope with a malformed prompt; `{kind:"ignored"}` for everything else including unknown type/version), and `buildAgenticAppPromptResult(status, reason?)`. `agentic-app-activation-gate.ts` exports `createActivationGate(options?)` returning `{ recordEngagement(now), evaluate(now, focused) }` with the semantics in the Decision Log. Colocated tests `agentic-app-protocol.test.ts` and `agentic-app-activation-gate.test.ts` cover acceptance, rejection reasons, unknown-shape silence, extra-field tolerance, sticky engagement, focus requirement, min-interval and windowed caps — all with explicit numeric timestamps (no real clock).

Milestone 2 performs the rename with `git mv` plus content edits, no aliases: panel file → `agentic-app-panel.tsx` (`AgenticAppPanel`), selection → `agentic-app-selection.ts` (+ test file), service → `agentic-app-html.ts` (+ test file), oRPC procedure → `getAgenticAppHtml` (router + its test + hook), hook → `useAgenticAppHtml` (query key `agentic-app-html`), `ChatArea` prop → `enableAgenticApp` (chat-area + its test + the two chat routes), internal chat-area identifiers and storage key, and the two coworker pages' imports/local frame component. After this milestone `git grep -i "outputhtmlpreview\|output-preview\|output-html-preview\|enableOutputPreview"` in `apps/web/src` returns nothing.

Milestone 3 adds the glue to `agentic-app-panel.tsx`: a required `onSendPrompt: (prompt: string) => Promise<unknown>` prop wired from `chat-area.tsx` as `(prompt) => handleSend(prompt)`; refs for the container and iframe; engagement capture (`onPointerDownCapture`/`onKeyDownCapture` on the container, window `blur` handler checking `document.activeElement` is the iframe); a window `message` listener that ignores messages whose `event.source` is not the iframe's `contentWindow`, parses with the protocol module, acks `invalid` for malformed v1 envelopes, evaluates the gate with `Date.now()` and focus state, acks gate rejections, otherwise awaits `onSendPrompt` and acks `sent` (truthy result) or `rejected` (falsy/throw). A jsdom test `agentic-app-panel.test.tsx` (mocking the conversation hooks, following `chat-area.test.tsx` patterns) proves: wrong-source messages are ignored; a valid message after engagement + focus calls `onSendPrompt` and posts a `sent` ack to the iframe's `contentWindow`; a message with no engagement posts `rejected/no_user_activation`; a malformed v1 envelope posts `rejected/invalid`.

Milestone 4 adds `apps/sandbox/src/common/skills/agentic-app/SKILL.md` documenting: write a single self-contained `/app/output.html` (auto-collected, ~2 MB cap, inline CSS/JS only); the exact envelope and ack shapes with an indented example button + script; the rules (text-only, prompts work only after real user interaction — never on load or timers; conversation defaults apply; listen for the result ack to show button state). No registry change is needed — the image build copies the whole skills directory.

## Concrete Steps

All commands run from the repository root unless noted.

Create/edit files per Plan of Work. Then validate from `apps/web`:

    cd apps/web
    bunx vitest run src/components/chat/agentic-app-protocol.test.ts src/components/chat/agentic-app-activation-gate.test.ts src/components/chat/agentic-app-panel.test.tsx src/components/chat/agentic-app-selection.test.ts
    bun run check

Expected: all vitest files pass (the protocol/gate suites are pure unit tests; the panel suite runs under jsdom); `bun run check` (typecheck + lint) exits 0. Also re-run the renamed server suites:

    bunx vitest run src/server/services/agentic-app-html.test.ts src/server/orpc/routers/conversation.test.ts src/components/chat/chat-area.test.tsx

Expected: pass, proving the rename did not change server behavior and the chat area still mounts the panel.

## Validation and Acceptance

Acceptance, phrased as behavior (mirrors PRD user stories):

1. Unit: `parseAgenticAppPromptMessage` accepts `{type:"bap:agentic-app-prompt", version:1, prompt:"hi", extra:"x"}` (extra fields tolerated) and returns kind `prompt`; returns `ignored` for `version: 2`, a different `type`, or non-object data; returns `invalid` for a v1 envelope with `prompt: ""` or `prompt: 42`.
2. Unit: the gate rejects with `no_user_activation` before any engagement even when focused, and when engaged but unfocused; accepts when engaged + focused; a second accept within 1000 ms and a seventh within 60 s are `rate_limited`.
3. Component (jsdom): a `MessageEvent` whose `source` is not the panel iframe's `contentWindow` produces no send and no ack; after `pointerdown` on the panel and focusing the iframe, a valid envelope calls `onSendPrompt("...")` once and posts `{type:"bap:agentic-app-prompt-result", version:1, status:"sent"}` to the iframe window; without engagement the ack is `rejected`/`no_user_activation`.
4. Rename completeness: `git grep -iE "outputhtmlpreview|output-html-preview|output-preview-selection|enableOutputPreview|previewSandboxOutputHtml" -- apps/web/src` prints nothing.
5. Manual end-to-end (when a dev server and sandbox are available): start the web app, open a chat, have a Generation produce an `output.html` whose button runs `parent.postMessage({type:"bap:agentic-app-prompt",version:1,prompt:"Send the weekly email"},"*")`; clicking the button makes "Send the weekly email" appear as a user message and a Generation start; reloading the page and not touching the panel while the page tries to auto-fire on load produces no message.

## Idempotence and Recovery

All steps are file edits and renames; re-running an edit is a no-op once content matches. If a `git mv` was already done, skip it. If validation fails midway, the working tree is still consistent because renames and their reference updates happen within the same milestone — finish the milestone's edits before re-running checks. Nothing here touches the database, queues, or the sandbox image build (the skill file is picked up at the next scheduled image rebuild; do not trigger a rebuild from this plan — dev snapshot rebuilds block sandbox creation for 30–80 minutes).

## Artifacts and Notes

The example the SKILL.md teaches (indented, single self-contained page):

    <button id="send">Send the weekly email</button>
    <script>
      const btn = document.getElementById("send");
      btn.addEventListener("click", () => {
        btn.disabled = true;
        parent.postMessage({ type: "bap:agentic-app-prompt", version: 1, prompt: "Send the weekly email" }, "*");
      });
      window.addEventListener("message", (event) => {
        const data = event.data;
        if (!data || data.type !== "bap:agentic-app-prompt-result") return;
        btn.textContent = data.status === "sent" ? "Sent ✓" : "Failed: " + (data.reason ?? "try again");
        btn.disabled = data.status === "sent";
      });
    </script>

## Interfaces and Dependencies

No new dependencies. End-state interfaces (all in `apps/web` unless noted):

In `src/components/chat/agentic-app-protocol.ts`:

    export const AGENTIC_APP_PROMPT_TYPE = "bap:agentic-app-prompt";
    export const AGENTIC_APP_PROMPT_RESULT_TYPE = "bap:agentic-app-prompt-result";
    export const AGENTIC_APP_PROMPT_VERSION = 1;
    export type AgenticAppPromptRejectionReason = "rate_limited" | "no_user_activation" | "invalid";
    export type ParsedAgenticAppPromptMessage =
      | { kind: "prompt"; prompt: string }
      | { kind: "invalid" }
      | { kind: "ignored" };
    export function parseAgenticAppPromptMessage(data: unknown): ParsedAgenticAppPromptMessage;
    export function buildAgenticAppPromptResult(
      status: "sent" | "rejected",
      reason?: AgenticAppPromptRejectionReason,
    ): { type: string; version: number; status: "sent" | "rejected"; reason?: AgenticAppPromptRejectionReason };

In `src/components/chat/agentic-app-activation-gate.ts`:

    export type ActivationGate = {
      recordEngagement(now: number): void;
      evaluate(now: number, focused: boolean):
        | { allowed: true }
        | { allowed: false; reason: "no_user_activation" | "rate_limited" };
    };
    export function createActivationGate(options?: {
      minIntervalMs?: number;   // default 1000
      maxAccepted?: number;     // default 6
      windowMs?: number;        // default 60000
    }): ActivationGate;

In `src/components/chat/agentic-app-panel.tsx`: `export function AgenticAppPanel(props: { outputFile: SandboxFileData; onClose: () => void; onSendPrompt: (prompt: string) => Promise<unknown> })`.

Renamed server service `src/server/services/agentic-app-html.ts`: `loadAgenticAppHtml`, `AgenticAppHtmlError`, `AgenticAppHtmlErrorCode`, `AGENTIC_APP_FILENAME`, `AGENTIC_APP_MAX_BYTES` (same behavior as the old `loadOutputHtmlPreview` family). oRPC procedure `getAgenticAppHtml` on the conversation router; client hook `useAgenticAppHtml(fileId, enabled?)`.

New sandbox skill: `apps/sandbox/src/common/skills/agentic-app/SKILL.md` (frontmatter `name: agentic-app`).

---

Revision note (2026-06-10): initial version, written before implementation began; updated same day with implementation outcomes, the jsdom MessageEvent discovery, and final validation results.
