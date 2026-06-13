# PRD: Agentic-App Prompts

## Problem Statement

A Generation can already produce an `output.html` that Bap renders next to the conversation, but the rendered page is a dead end: the User can look at it, yet nothing in it can talk back to the conversation. When an agent builds a page with a "Send the email" button, clicking it does nothing — the User has to leave the page, retype their intent into the composer, and send it manually. The artifact looks like an app but cannot act like one.

## Solution

Rename the concept from **Generation Output Preview** to **Agentic-App** and give it a voice: an Agentic-App can send an **Agentic-App Prompt** — a real user message — into its conversation. The agent authors `output.html` with buttons or forms that call `parent.postMessage` using a small, versioned, frozen envelope. The chat panel verifies the message came from the mounted Agentic-App iframe, enforces a parent-verified user-activation gate and a rate cap (so a page can never send prompts on load, on a timer, or in a loop), then auto-sends the prompt exactly as if the User had typed it: it appears in the transcript and starts a Generation when the conversation is idle or queues when one is running. The panel replies to the page with a sent/rejected ack so buttons can show honest state. A new sandbox skill teaches agents both the `output.html` convention and the protocol.

## User Stories

1. As a User, I want a button inside an Agentic-App to send a prompt into the conversation, so that I can act on the result without retyping my intent in the composer.
2. As a User, I want the Agentic-App Prompt to appear in the transcript as a normal user message, so that the conversation remains the complete record of what the agent was asked.
3. As a User, I want a clicked prompt to start a Generation immediately when the conversation is idle, so that the button feels like a real action and not a draft.
4. As a User, I want a clicked prompt to queue when a Generation is already running, so that my click is never lost and behaves like a queued composer message.
5. As a User, I want prompts to fire only after I actually interact with the Agentic-App, so that a page can never send messages on my behalf just by being rendered.
6. As a User, I want repeated rapid clicks to be rate-capped, so that a misbehaving page cannot flood my conversation with Generations.
7. As a User, I want a form inside an Agentic-App whose values are interpolated into the prompt, so that I can parameterize the agent's next action (recipient, subject, dates) without typing a full sentence.
8. As a User, I want the conversation's existing defaults (model, toolbox, skills) to apply to an Agentic-App Prompt, so that a page cannot escalate or change how the agent runs.
9. As a User, I want a rejected send to be observable in the page (a disabled button, an error hint), so that I am not left wondering whether my click did anything.
10. As an agent authoring an Agentic-App, I want a documented, versioned message envelope, so that the page I generate keeps working after Bap evolves.
11. As an agent authoring an Agentic-App, I want a result ack telling me whether the prompt was sent or rejected and why, so that I can write honest button UX (pending, sent, slow-down states).
12. As an agent, I want a sandbox skill that teaches the `output.html` convention and the prompt protocol, so that I produce working Agentic-Apps without guessing the wire format.
13. As a security-conscious operator, I want the Agentic-App iframe to remain sandboxed without same-origin access, so that generated HTML can never make authenticated API calls or read app state.
14. As a security-conscious operator, I want the panel to accept messages only from the mounted Agentic-App iframe, so that other windows or nested frames cannot inject prompts.
15. As a security-conscious operator, I want a prompt-injected Generation that emits a self-firing Agentic-App to be inert, so that rendering hostile HTML is never equivalent to executing its prompt.
16. As a security-conscious operator, I want chained-Generation loops (a page that re-prompts every time it renders) to be impossible by design, so that runaway agent recursion cannot start from an Agentic-App.
17. As a User, I want unknown or malformed messages from the page to be ignored without breaking the panel, so that a buggy Agentic-App degrades gracefully.
18. As a future developer, I want the wire protocol isolated in one pure module, so that the frozen contract has a single home and cannot drift between call sites.
19. As a future developer, I want the activation gate and rate cap isolated in one deterministic module, so that the security behavior is testable without a browser.
20. As a future developer, I want the glossary terms **Agentic-App** and **Agentic-App Prompt** used across code, docs, and UI copy, so that "preview", "canvas", and "mini-app" stop accumulating as synonyms.
21. As a future developer, I want the old "output HTML preview" identifiers fully renamed rather than aliased, so that the codebase has one name for one concept.
22. As a User on a conversation with an older Agentic-App, I want its buttons to keep working after Bap updates, so that stored artifacts do not silently rot.
23. As a User, I want sends from an Agentic-App to respect the same auth and ownership checks as the composer, so that the page cannot post into conversations I do not own.
24. As an operator, I want rejected and accepted Agentic-App Prompts to be observable in telemetry, so that I can detect abuse patterns and debug "the button does nothing" reports.

## Implementation Decisions

Decisions below were settled in a grilling session and recorded in the Agentic-App ADRs (the renamed `output.html` ADR and the new Agentic-App Prompt protocol ADR); the glossary terms are in `CONTEXT.md`.

- **Raw postMessage, no injection.** The agent writes the `parent.postMessage` call itself. Bap never mutates or augments the generated HTML (no injected bootstrap script, no declarative `data-*` wiring). Consequence: the envelope is a frozen public contract — append-only, version 1 accepted forever.
- **Wire format.** Inbound: `{ type: "bap:agentic-app-prompt", version: 1, prompt: string }`. Outbound ack: `{ type: "bap:agentic-app-prompt-result", version: 1, status: "sent" | "rejected", reason?: "rate_limited" | "no_user_activation" | "invalid" }`. Unknown extra fields are ignored; unknown `type` or `version` values are dropped silently.
- **Auto-send with composer semantics.** An accepted prompt is submitted as a visible user message: start a Generation when idle, enqueue when one is running. No composer prefill, no hidden or synthetic messages. Text only in v1 — no attachments, skill selection, or model override; conversation defaults apply.
- **Parent-verified user-activation gate.** The panel cannot see clicks inside the iframe, so it tracks pointer/keyboard events targeting the iframe element and accepts a prompt only within a short window after such interaction. Plus a rate cap on accepted prompts. Both checks live in one pure, clock-injected module.
- **Trust check is source identity, not origin.** The sandboxed iframe (no `allow-same-origin`) has an opaque origin, so the listener verifies `event.source` against the mounted iframe's content window and ignores everything else.
- **Module shape.** Two new deep modules: a pure protocol module (envelope validation in, ack construction out) and a pure activation-gate module (interaction recording, allow/reject evaluation). The existing panel becomes glue: listener, source check, gate + protocol, forward to the existing send path, post the ack.
- **Big Bang rename.** All "output HTML preview" identifiers — panel component, selection module, web service, oRPC endpoint — are renamed to Agentic-App terms in this change, with no backward-compatible aliases, per the repository's Big Bang Rewrite policy.
- **Agent education via sandbox skill.** A new `agentic-app` sandbox skill documents the `output.html` convention (exact basename, single self-contained document), the envelope, the ack, and the rule that prompts only work from real user interaction. The always-on runtime prompt is not extended.
- **Rendering pipeline unchanged.** Auto-collection of `output.html`, storage through the sandbox file path, the authenticated serving route, the 2 MB cap, and the `srcDoc` sandboxed iframe (`allow-scripts allow-forms`) all stay as shipped in the original ADR.

## Testing Decisions

A good test exercises external behavior through the module's public interface — what messages are accepted, what acks are produced, what the user observes — never internal state or implementation details. Both new modules are pure and deterministic, so they need no mocks, matching the repository's no-mocks testing policy.

- **Protocol module** (tested): valid v1 envelope accepted; wrong `type`, wrong `version`, missing/non-string `prompt` rejected as `invalid`; unknown extra fields tolerated; ack construction for each status/reason.
- **Activation gate** (tested): prompt with no prior interaction rejected as `no_user_activation`; prompt within the window accepted; prompt after the window rejected; rapid accepted prompts hit `rate_limited`; window and cap behavior fully deterministic via injected clock.
- **Panel glue** (tested): integration-style test that a message from the iframe's source passes the listener, reaches the send path, and an ack is posted back; messages from other sources are ignored. Prior art: existing colocated component tests in the web app and the existing output-preview selection tests.
- Sandbox skill content and the rename sweep get no dedicated tests; type-checking and the existing selection tests (updated names) cover the rename.

## Out of Scope

- Prompts carrying attachments, skill selections, model overrides, or any non-text payload.
- Any injected helper script, declarative `data-prompt` wiring, or `window.bap` API inside the Agentic-App.
- Autonomous sends: prompts on load, timers, or background loops remain impossible; any future autonomous capability must be a new, explicitly approved mechanism, not a relaxation of the activation gate.
- Serving multi-file Agentic-Apps (relative asset bundles); `output.html` remains a single self-contained document.
- Surfaces other than the normal web chat routes (CLI, mobile-specific layouts, coworker-specific surfaces).
- Bidirectional state sync (pushing conversation or Generation state into the page); the only channel is prompt-in, ack-out.
- Rewriting historical documents (the original preview PRD and plan) that mention the old term.

## Further Notes

- The rename means the original `output.html` ADR was edited in place to use **Agentic-App** terminology, with a note explaining the rename; the protocol decisions live in their own ADR.
- The gesture-gate heuristic (focus/pointer proximity window) is deliberately conservative; if legitimate UX patterns emerge that it blocks (e.g., keyboard-driven forms), tune the window in the gate module — its isolation exists precisely so this can change without touching the protocol.
- The ack makes silent drops debuggable for page authors, but operator-side observability (telemetry counters for accepted/rejected prompts and reasons) should ride the existing canonical service event patterns when the send path is invoked.
- Discoverability risk accepted: agents that build HTML without loading the `agentic-app` skill may hand-roll broken postMessage calls; the rejection ack is the safety net, and the skill is the fix.
