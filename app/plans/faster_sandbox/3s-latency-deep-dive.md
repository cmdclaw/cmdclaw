# 3s Latency Target Deep Dive

## Goal
Reach a reliable `<= 3s` response for a simple `"hi"` prompt from CLI.

## What was added
- New CLI profiler command: `bun run profiler`
- Script file: `scripts/profiler.ts`
- It reuses a cached conversation and reports per-run phase timings (`sandbox`, `pre_prompt`, `model`, etc.)

Example:
```bash
bun run profiler -- --message "hi" --model openai/gpt-5.2-codex --warmups 1 --runs 5
```

## Measurements observed (Mar 3, 2026)
Using `openai/gpt-5.2-codex`:

- Cold run:
  - end-to-end generation: ~13.8s to ~14.7s
  - major costs: `opencode_ready` (~5.6s), `pre_prompt_setup` (~3.1s to ~4.0s)
- Warm reused run:
  - generation: best ~3.49s (often ~4.0s to ~5.0s)
  - main costs:
    - `sandbox_connect_or_create (reused)`: ~0.37s to ~2.26s (high variance)
    - `model_stream`: ~1.2s to ~3.1s
    - `post_processing`: ~0.4s
- User-visible total from `bun run chat` is higher than generation timing due stream completion lag (polling/backoff behavior).

## Root-cause breakdown
### 1. Cold start cannot hit 3s with current architecture
Cold path includes sandbox creation + OpenCode server startup + first-turn prep. This is currently >10s.

### 2. Warm path still dominated by 3 items
- Reused sandbox reconnect/check variance (`0.3s` to `2.2s`)
- Model streaming latency (`1.2s` to `3.1s`) for Sonnet
- Stream completion lag on DB-poll based subscription

### 3. Extra overhead in first turn
- Skill/custom integration sync and pre-prompt preparation
- Integration token refresh work before agent execution

## Code-level changes done in this pass
### A) Added profiler tool
- `package.json`: script `"profiler": "bun scripts/profiler.ts"`
- `scripts/profiler.ts`:
  - Supports `--message`, `--model`, `--warmups`, `--runs`, `--reset-conversation`
  - Persists cached conversation in `~/.cmdclaw/profiles/chat-profiler.<server>.json`
  - Prints p50/p90/best for elapsed + generation

### B) Reduced completion lag for chat subscriptions
- `src/server/services/generation-manager.ts`
  - `maxPollIntervalMs` for chat subscriptions reduced from `3000ms` to `1000ms`

### C) Skipped unnecessary sandbox file collection work
- `src/server/services/generation-manager.ts`
  - Only run `collectNewSandboxFiles(...)` when tools actually ran or uploads were staged

## Why 3s is still not met consistently
Even after improvements, warm generation commonly lands around `3.5s+` with Sonnet because:
- `model_stream` + `post_processing` + sandbox/session checks still exceed budget
- End-user completion includes additional stream polling delay

## Recommended plan to actually hit <=3s
## P0 (highest impact)
1. Replace DB polling subscription with push delivery (Redis pub/sub or queue-driven event fanout)
- Target gain: `-0.7s` to `-2.0s` on user-visible completion
- Rationale: removes poll/backoff latency and reduces completion jitter

2. Keep a warm sandbox/session pool for chat turns
- Target gain on cold start: `-6s` to `-9s`
- Rationale: under current design, cold start can never meet 3s

3. Route profiler target to a faster model for latency SLO testing
- Target gain: `-0.8s` to `-2.0s` on `model_stream`
- Rationale: Sonnet response time alone can exceed the remaining budget

## P1 (next)
1. Short-circuit pre-prompt work when cache is known fresh
- Persist cache fingerprint outside sandbox (DB) and avoid repeated DB + sandbox checks per turn
- Expected gain: `-0.1s` to `-0.5s`

2. Minimize fallback assistant fetch path
- Avoid extra `messages()` fetch when stream already has final text
- Expected gain: `-0.1s` to `-0.4s`

3. Reduce sandbox health-check overhead on recently-used sessions
- Use very short TTL trust window before full readiness check
- Expected gain: `-0.2s` to `-1.0s` on warm path variance

## Suggested performance acceptance gates
- Warm SLO:
  - `generation_p50 <= 2.5s`
  - `generation_p90 <= 3.0s`
  - `user-visible completed_p90 <= 3.2s`
- Cold SLO (separate):
  - explicit target (ex: `<8s`) unless prewarmed pool is enabled

## Practical next experiment order
1. Implement push stream delivery (remove DB poll bottleneck)
2. Add warm sandbox/session pooling strategy
3. Re-run `bun run profiler` 20+ runs and compare p50/p90 before/after
4. If still above target, change latency SLO model for `hi` benchmark
