# Single Redis Event Stream Plan (`client_generation_to_first_visible_output`)

## Summary
Move generation event delivery to a single durable Redis Streams path for multi-instance correctness and lower user-visible streaming latency.

## Implemented in this pass
- Added Redis event bus at `src/server/redis/generation-event-bus.ts`.
- Generation manager now publishes streamed events to Redis from `broadcast(...)`.
- `subscribeToGeneration(...)` now consumes Redis stream events with cursor support.
- Added recovery fallback: when stream is absent and generation is terminal, recover terminal output from DB.
- Added optional `cursor` input in RPC `subscribeGeneration`.
- Added cursor metadata to stream events emitted via RPC.

## Notes
- DB polling is no longer the primary stream path.
- DB is still used for ownership checks and terminal-state fallback recovery.
- Local subscriber callback fanout is still kept for compatibility with existing tests and workflow event side effects.

