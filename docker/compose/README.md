# Local Docker

```bash
docker compose --env-file .env -f docker/compose/dev.yml up -d --remove-orphans
```

For a worktree-local stack, export the worktree overrides first so Compose gets a
unique project name, ports, and volumes for that checkout:

```bash
bun run worktree:docker-up
```

In the current worktree flow, `worktree:docker-up` reuses the repo-global
`cmdclaw-local` services from `docker/compose/dev.yml` for Postgres, Redis,
MinIO, Grafana, and Alertmanager, and starts the worktree-local observability
services from `docker/compose/worktree-observability.yml`.

The main checkout `docker/compose/dev.yml` remains the full local stack.

The default observability endpoints are:

- `Vector` on `http://127.0.0.1:4318` for OTLP/HTTP, `127.0.0.1:4317` for OTLP/gRPC, and `http://127.0.0.1:8686/logs` for JSON logs
- `VictoriaMetrics` on `http://127.0.0.1:8428`
- `VictoriaLogs` on `http://127.0.0.1:9428`
- `VictoriaTraces` on `http://127.0.0.1:10428`
- `Grafana` on `http://127.0.0.1:3400`
- `Alertmanager` on `http://127.0.0.1:9093`
- `vmalert` on `http://127.0.0.1:8880`

All observability host ports follow the same worktree override pattern as the rest of the stack. The defaults are:

- `CMDCLAW_VECTOR_OTLP_GRPC_PORT=4317`
- `CMDCLAW_VECTOR_OTLP_HTTP_PORT=4318`
- `CMDCLAW_VECTOR_LOG_PORT=8686`
- `CMDCLAW_VICTORIA_METRICS_PORT=8428`
- `CMDCLAW_VICTORIA_LOGS_PORT=9428`
- `CMDCLAW_VICTORIA_TRACES_PORT=10428`
- `CMDCLAW_GRAFANA_PORT=3400`
- `CMDCLAW_ALERTMANAGER_PORT=9093`
- `CMDCLAW_VMALERT_PORT=8880`

Grafana is provisioned in code with the VictoriaMetrics, VictoriaLogs, VictoriaTraces, and Alertmanager datasources plus the `CmdClaw Local Observability` dashboard. `vmalert` rules also live in the repo under `docker/compose/observability/vmalert/rules/`.

To send Slack notifications from local alerts, set:

```bash
export SLACK_BOT_TOKEN='xoxb-...'
```

Alertmanager will post directly to `#ops-telemetry-alerts` using Slack's `chat.postMessage` API.

Useful direct queries after `bun run dev` is producing traffic:

```bash
curl -s http://127.0.0.1:9428/select/logsql/query -d 'query=service:cmdclaw-web OR service:cmdclaw-worker' -d 'limit=20'
```

```bash
curl -s 'http://127.0.0.1:8428/api/v1/query?query=cmdclaw_rpc_requests_total'
```

```bash
curl -s http://127.0.0.1:10428/select/jaeger/api/services
```

```bash
curl -s http://127.0.0.1:8428/api/v1/rules
```
