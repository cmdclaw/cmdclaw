# New Architecture Plan For Fast Messages (<3s)

## Objective
Reach reliable latency targets for chat:
- Warm path: `p90 <= 3s` end-to-end for simple prompts.
- Cold path (no prewarm): minimize to best possible (`target p90 6-8s`, stretch lower), with strict reduction of startup variance.

## Hard constraint
- No prewarmed sandbox pool.
- No background “keep many sandboxes warm” strategy.
- Improvements must come from faster on-demand boot and less synchronous work in the critical path.

## Why current architecture misses
Current critical path still includes expensive operations before first token:
- Sandbox + runtime readiness (`opencode_ready`) is frequently multi-second.
- Session setup + auth injection adds additional startup variance.
- Pre-prompt setup (memory/skills/custom integrations) can add several seconds.
- Delivery completion still pays polling/backoff lag in subscribe path.
- Token/integration refresh work happens synchronously in generation start path.

## Principles for the refactor
- Move heavy work off the request critical path.
- Reuse runtime assets within a conversation only.
- Make all setup stages cacheable and independently measurable.
- Use durable coordination (DB/Redis), no in-memory correctness assumptions.
- Keep correctness first: no “greeting-only” or prompt-shape hacks.

## Architecture proposal

### 1) No-prewarm cold-boot acceleration (highest impact)
Make each on-demand sandbox boot materially faster and less variable.

Design:
- Split startup into measurable sub-stages: VM acquire, runtime process spawn, runtime ready, session create, auth inject.
- Remove non-essential startup work from first turn.
- Ensure runtime startup command path is minimal and deterministic.
- Harden readiness checks to avoid late/slow endpoints.

Expected gain:
- Directly lowers true cold-start latency without prewarm.
- Reduces cold p90 variance.

### 2) Strict conversation-scoped runtime reuse
Keep runtime reuse strictly within the same conversation only.

Design:
- Reuse conversation runtime when available (current behavior).
- Do not create/hold idle pools in advance.
- Fast validity checks and strict conversation ownership enforcement.

Expected gain:
- Improves subsequent-message latency for active conversations while preserving isolation.

### 3) Pre-prompt Artifact Pipeline (Build Once, Mount Fast)
Replace per-generation skill/integration file hydration with artifact snapshots.

Design:
- Build user artifact bundle (skills + integration skill files + custom CLI + permissions metadata) out-of-band.
- Persist bundle fingerprint + location (object storage or durable cache).
- On generation start: if fingerprint unchanged, mount/extract cached bundle quickly.
- Incremental rebuild only when skills/credentials/integration config changes.

Expected gain:
- Removes repeated expensive pre-prompt setup from both cold and warm paths.
- Gives stable p90 behavior.

### 4) Async Integration Token Hydration
Move token refresh from synchronous request path to background refresh workers.

Design:
- Maintain per-integration token freshness state and refresh ahead of expiry.
- Generation path reads already-valid tokens from durable cache.
- On stale/missing token, trigger refresh asynchronously and surface auth-needed only if required by tool execution.

Expected gain:
- Reduces startup blocking from token refresh bursts.
- Improves all-message latency consistency.

### 5) Push-based Generation Event Delivery
Replace poll/backoff subscription completion with push fanout.

Design:
- Generation manager publishes terminal/progress events to Redis pub/sub (or stream).
- RPC subscribers consume push stream directly, with DB polling only as fallback recovery.
- Keep replay/late subscriber semantics using last-event cursor.

Expected gain:
- Removes 0.5–2s completion lag and jitter from user-visible latency.

### 6) Runtime Readiness and Boot Contract Optimization
Improve readiness detection and startup mechanics.

Design:
- Canonical readiness endpoint contract (`/health`) across runtimes.
- Start runtime process once per sandbox lifecycle, not per generation.
- Verify image/template startup path and remove unnecessary boot-time work from first request.

Expected gain:
- Lower runtime readiness variance and faster on-demand cold start.

## Rollout plan

### Phase 0: Instrumentation hardening (1-2 days)
- Add persistent phase metrics for: sandbox create/connect, runtime ready, session attach/create, preprompt artifact fetch/mount, token fetch/refresh wait, stream delivery lag.
- Add percentile dashboards and regression alerts.

### Phase 1A: Cold boot path optimization (3-5 days)
- Minimize startup command and readiness path.
- Remove blocking/non-critical init work from first-turn path.
- Add startup variance guardrails and timeout tuning.

### Phase 1B: Push streaming MVP (3-4 days, parallel with Phase 1A)
- Add pub/sub event channel + subscriber bridge.
- Keep DB polling as guarded fallback.
- Validate no event loss on reconnect.

### Phase 2A: Artifact snapshot pipeline (4-6 days)
- Build + cache bundle by fingerprint.
- Mount cached bundle in generation path.
- Remove inline heavy pre-prompt file hydration from hot path.

### Phase 2B: Token hydration worker (2-4 days, parallel with Phase 2A)
- Pre-refresh scheduler and shared token cache.
- Generation startup becomes read-only for tokens in healthy state.

### Phase 3: Conversation-scoped reuse + consolidation (2-3 days)
- Harden same-conversation reuse only (no cross-conversation handoff).
- Standardize readiness/startup behavior across providers.
- Tune reuse safety limits and eviction policies with production-like load.

## Parallelization matrix
Work that can proceed in parallel:
- Track A: Cold boot optimization (`Phase 1A`) and readiness optimization prep.
- Track B: Push streaming (`Phase 1B`) since it mostly touches delivery path.
- Track C: Artifact pipeline (`Phase 2A`).
- Track D: Token hydration worker (`Phase 2B`).

Hard dependencies:
- `Phase 0` metrics should be in first (all other tracks depend on baseline comparability).
- `Phase 3` depends on learnings from `Phase 1A` and production traces.
- Final SLO signoff depends on all tracks merged behind flags and then enabled progressively.

Recommended team split:
- Engineer 1: cold boot + conversation-scoped reuse logic.
- Engineer 2: stream delivery push path.
- Engineer 3: artifact bundle cache/mount.
- Engineer 4: token pre-refresh worker + cache.

## Validation gates
- Cold (no prewarm) p90 target <= 8.0s initially, tighten iteratively.
- Warm p90 <= 3.0s.
- First token p90 <= 1.2s.
- Completion lag (terminal event to client done) p90 <= 200ms.
- Track cold-start variance (`p50/p90 gap`) as a primary KPI.

## Risks and mitigations
- Conversation isolation correctness:
  - Mitigate via strict conversation ownership checks and sandbox/session binding validation.
- Event delivery reliability in push model:
  - Mitigate with cursor-based replay fallback.
- Artifact cache staleness:
  - Mitigate with deterministic fingerprinting and invalidation hooks on skill/integration updates.
- Operational complexity:
  - Mitigate via phased rollout and feature flags per stage.

## Immediate next implementation order
1. Ship Phase 0 instrumentation.
2. Start `Phase 1A` and `Phase 1B` in parallel.
3. Start `Phase 2A` and `Phase 2B` in parallel once Phase 1 traces are available.
4. Run Phase 3 readiness consolidation.
5. Do staged rollout + SLO validation across all tracks.
