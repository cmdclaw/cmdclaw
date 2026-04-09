# Definition: "Close the Loop"

**"Close the loop"** means designing a workflow where an AI agent can not only generate code, but also **run it, verify results, and continue iterating without manual handoffs**.

Practically, this usually starts with a CLI interface because it gives fast, testable feedback. When every step (prompt -> code -> execution -> validation -> next change) is connected, progress is limited more by model inference speed and decision quality than by human glue work.

## Key idea

A loop is "closed" when the agent can:
1. Produce an implementation.
2. Execute it in a real environment.
3. Check output against expected behavior.
4. Apply follow-up fixes immediately.

## Why it matters

Closing the loop reduces idle handoffs and repetitive manual steps, making software delivery faster and more continuous.

## CmdClaw example

In this codebase, an example of"closing the loop" is:
1. Keep the web, worker, and WS runtimes running (`bun run dev`, with worker/server visible in tmux logs).
2. Make a change.
3. Read the workflow guide directly from the repo when needed: `bun run cat close-the-loop-definition.md`.
4. Validate behavior via `bun run cmdclaw -- chat` (real prompt, real execution path).
   Example: `bun run cmdclaw -- chat --message "send a message on slack saying hi" --model openai/gpt-5.4-mini`
   In a real terminal, `--message` seeds the first turn and then keeps the same chat open at `followup>` so you can continue iterating without restarting the CLI.
   Debug deadline example: `bun run cmdclaw -- chat --chaos-run-deadline 60s --message "<long repro>" --model openai/gpt-5.4-mini`
   Defer approval example: `bun run cmdclaw -- chat --chaos-approval defer --message "<write-tool repro>" --model openai/gpt-5.4-mini`
   Attach to a run example: `bun run cmdclaw -- chat --attach <generation-id>`
5. Read tmux logs to confirm server + worker behavior and catch regressions.
6. Iterate immediately until the prompt result matches expected behavior.

That is a closed loop because implementation, runtime execution, and verification happen continuously in one workflow.

## Coworker debug loop

For coworker debugging, the equivalent runner is `bun run cmdclaw -- coworker`, not `bun run cmdclaw -- chat coworker`.

Use this loop when you want to reproduce a coworker issue and watch it live:

1. Start a fresh coworker run from the current saved definition and monitor it in one session:
   `cd /Users/baptiste/Git/cmdclaw && bun run cmdclaw -- coworker run <coworker-id>`
2. If you already have a run id, tail only that run:
   `cd /Users/baptiste/Git/cmdclaw && bun run cmdclaw -- coworker logs <run-id> --watch`
3. Run a chat control case through the same runtime to compare behavior:
   `cd /Users/baptiste/Git/cmdclaw && bun run cmdclaw -- chat --message "<repro prompt>" --model openai/gpt-5.4 --auto-approve`
4. Inspect the persisted DB state directly if you want a separate raw query:
   `cd /Users/baptiste/Git/cmdclaw/apps/web && bun -e 'import { db } from "@cmdclaw/db/client"; import { coworkerRun } from "@cmdclaw/db/schema"; import { eq } from "drizzle-orm"; const id = "<run-id>"; console.log(JSON.stringify(await db.query.coworkerRun.findFirst({ where: eq(coworkerRun.id, id), with: { generation: true } }), null, 2)); process.exit(0);'`

### Current stuck-run repro

For the Slack failure investigated here:

- Coworker id:
  `483b3289-ee99-48f4-b43f-31741d1c890b`
- Existing stuck run:
  `36196da2-7cb1-4971-ab42-fc1317226107`
- Chat control prompt:
  `Send the word test to Slack channel C0AN8M0VA75 as bot using the Slack tool. Do not use any fallback. If it fails, explain the failure.`

Expected signal for the bug:

1. The coworker stream shows a failed Slack `send` tool result.
2. No approval is pending.
3. No final assistant text is produced.
4. The coworker run and linked generation remain `running`.

Expected signal for the control:

1. Chat shows the same Slack error.
2. Chat produces a final explanation.
3. The chat generation finishes normally.
