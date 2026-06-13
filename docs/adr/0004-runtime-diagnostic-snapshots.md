# Runtime Diagnostic Snapshots Are Stored As Debug Artifacts

Bap stores full Runtime Diagnostic Snapshots as object-storage artifacts,
referenced from the Generation debug index and terminal Canonical Service Event.
Runtime-boundary stalls such as `runtime_no_progress_after_prompt` and
`runtime_progress_stalled` capture this artifact so operators can distinguish
missing initial runtime progress from progress that later stopped. Postgres
`debugInfo` stays bounded and queryable with the snapshot id, storage key,
failure code, phase, and core counters, while the full artifact can contain
nested runtime state, event counters, bounded probe responses, and log tails
needed to debug runtime-boundary failures.

Runtime Diagnostic Snapshots are privileged debug artifacts, not Operational
Logs or Canonical Service Events. They intentionally preserve bounded raw probe
values, including runtime message fields, provider errors, and log snippets,
because field-name redaction hid the exact failure evidence needed during
incidents. Operators must treat snapshot storage access as sensitive production
debug access. Do not emit these raw snapshot values into VictoriaLogs or
Postgres; keep public telemetry and product state on the stricter redacted
observability boundary.

**Considered Options**

- Store full snapshots in Postgres: simple to query, but risks unbounded nested diagnostic data in the primary product database.
- Store full snapshots in VictoriaLogs: easy to grep, but violates the boundary between operational events and larger debug artifacts.
- Store full snapshots in object storage with Postgres/log pointers: keeps product state bounded while preserving enough detail for post-incident debugging.
