# Glossary

This proposal uses fewer names than proposal one. Each name is intended to map
to a deep module, not to a file-per-method split.

## Generation Turn

A user-visible CmdClaw turn. A turn starts from chat or coworker input, runs a
runtime, streams product events, and eventually completes, fails, pauses, or is
cancelled.

The generation turn layer owns product meaning: status, ownership,
conversation state, coworker run state, terminal assistant message persistence,
usage counters, cancellation, and user-visible events.

## Turn Intake

The setup before runtime execution can be queued. Intake owns conversation
creation or lookup, model and auth validation, user message persistence,
attachment persistence, coworker metadata updates, execution policy creation,
generation record creation, runtime binding, and queueing the first run job.

Intake does not own streaming runtime events or completing a turn.

## Lifecycle Store

The transactional owner of product state for a turn.

One lifecycle operation may update `generation`, `conversation`, `coworkerRun`,
interrupts, runtime binding, usage counters, queued messages, and terminal
messages. Callers describe the product transition they need; the lifecycle store
decides the rows and side effects required to make that transition consistent.

No other generation module should write `generation.status`,
`conversation.generationStatus`, `coworkerRun.status`, `resumeInterruptId`,
`remainingRunMs`, `suspendedAt`, `completedAt`, or `messageId` directly.

## Decision Flow

The lifecycle of external input required before a turn can continue. Current
decisions include plugin write approval, runtime permission approval, runtime
questions, and auth completion.

Decision flow owns interrupt persistence, expiry, resolution, content-part
projection for resolved decisions, resume eligibility, and applying the resolved
decision to a runtime when the runtime needs it.

## Runtime Driver

The adapter for an agent engine. Today the adapter is OpenCode.

The runtime driver owns runtime protocol details: sessions, subscriptions,
cumulative text delta conversion, tool state tracking, permission and question
requests, prompt submission, idle/error reconciliation, usage capture, session
restore, reattach, and abort behavior.

The generation layer should see normalized runtime turn events, not OpenCode
event names or OpenCode-shaped part objects.

## Execution Environment

The machine-like place where runtime commands execute. Today this can be Docker,
Daytona, or E2B.

The execution environment owns acquiring, restoring, preparing, snapshotting,
and releasing a sandbox. It does not own why a turn is paused, completed, or
cancelled.

## Event Log

The product event stream for a generation turn. It owns publish, subscribe,
cursor replay, DB fallback, stream counters, terminal recovery events, and
coworker run mirroring.

