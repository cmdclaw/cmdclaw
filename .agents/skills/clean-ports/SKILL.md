---
name: clean-ports
description: stop processes blocking my ports
---

Stop my ports so I can start `bun run dev` from root.

Run this command from the repository root:

```sh
bash -lc 'PORTS="${PORTS:-3000 3001 3010 3399 4097 4101 4102 4103 4104 4317 4318 5318 5432 6379 8428 8686 8880 9000 9001 9093 9428 10428}"; for port in $PORTS; do pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"; [ -z "$pids" ] && continue; echo "port $port: stopping $pids"; kill $pids 2>/dev/null || true; sleep 0.5; pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"; [ -n "$pids" ] && { echo "port $port: force stopping $pids"; kill -9 $pids 2>/dev/null || true; }; done'
```

To clean a specific set of ports, prefix with `PORTS`, for example:

```sh
PORTS="3000 4097" bash -lc 'for port in $PORTS; do pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"; [ -z "$pids" ] && continue; echo "port $port: stopping $pids"; kill $pids 2>/dev/null || true; sleep 0.5; pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"; [ -n "$pids" ] && { echo "port $port: force stopping $pids"; kill -9 $pids 2>/dev/null || true; }; done'
```

If asking for tmux, do not create a new session; attach to the existing `bap` one.
