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
3. Validate behavior via `bun run chat` (real prompt, real execution path).
4. Read tmux logs to confirm server + worker behavior and catch regressions.
5. Iterate immediately until the prompt result matches expected behavior.

That is a closed loop because implementation, runtime execution, and verification happen continuously in one workflow.
