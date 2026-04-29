# Observability

CmdClaw’s local observability stack is built for direct machine querying.

## Stack

- The app sends JSON logs and OTLP metrics/traces to `Vector`.
- `Vector` fans out locally to:
  - `VictoriaLogs` for logs
  - `VictoriaMetrics` for metrics
  - `VictoriaTraces` for traces
- `Grafana` is the UI.
- `vmalert` evaluates checked-in alert rules.
- `Alertmanager` sends notifications, for example to Slack.

## Why This Matters For Agents

Agents such as Codex or Claude Code do not need a special SDK here. They can query the local backends directly over HTTP, correlate signals, and reason from the results.

Typical flow:

1. Query metrics from `VictoriaMetrics` with PromQL.
2. Query logs from `VictoriaLogs` with LogsQL.
3. Query traces from `VictoriaTraces` through its Jaeger-compatible API.
4. Correlate by service, route, job name, trace id, and timing.

## Main Endpoints

These host ports are configurable via `CMDCLAW_*_PORT` env vars in local worktrees.

- Metrics: `http://127.0.0.1:8428`
- Logs: `http://127.0.0.1:9428`
- Traces: `http://127.0.0.1:10428`
- Grafana: `http://127.0.0.1:3400`
- Alert rules: `http://127.0.0.1:8428/api/v1/rules`

## Staging And Production Debugging

For staging and production incidents, use the hosted Victoria endpoints together with Render cli. The Victoria endpoints provide application metrics, logs, traces; Render provides deployment state, service status, and platform/runtime logs.

Staging endpoints:

- Grafana: `https://ops.staging.cmdclaw.ai`
- Metrics: `https://victoria-metrics.ops.staging.cmdclaw.ai`
- Logs: `https://victoria-logs.ops.staging.cmdclaw.ai`
- Traces: `https://victoria-traces.ops.staging.cmdclaw.ai`

Production endpoints:

- Grafana: `https://ops.prod.cmdclaw.ai`
- Metrics: `https://victoria-metrics.ops.prod.cmdclaw.ai`
- Logs: `https://victoria-logs.ops.prod.cmdclaw.ai`
- Traces: `https://victoria-traces.ops.prod.cmdclaw.ai`

Render: `render ...`

## Agent Query Examples

Metrics:

```bash
curl -s --get 'http://127.0.0.1:8428/api/v1/query' \
  --data-urlencode 'query=max(cmdclaw_runtime_up{service_name="cmdclaw-web"})'
```

Logs:

```bash
curl -s http://127.0.0.1:9428/select/logsql/query \
  -d 'query=service:cmdclaw-web OR service:cmdclaw-worker' \
  -d 'limit=20'
```

Traces:

```bash
curl -s http://127.0.0.1:10428/select/jaeger/api/services
```

Rules:

```bash
curl -s http://127.0.0.1:8428/api/v1/rules
```

## Recommended Agent Workflow

When debugging a local issue:

1. Check `cmdclaw_runtime_up` and queue metrics in `VictoriaMetrics`.
2. Check recent logs in `VictoriaLogs`.
3. If the issue crosses web and worker boundaries, inspect traces in `VictoriaTraces`.
4. Make the code change, restart the app, rerun the workload, and query again.

That is the intended loop: query, correlate, reason, change, rerun.
