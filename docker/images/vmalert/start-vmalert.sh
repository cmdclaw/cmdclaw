#!/bin/sh
set -eu

: "${CMDCLAW_VICTORIA_METRICS_HOST:?cmdclaw victoria metrics host is required}"
: "${CMDCLAW_ALERTMANAGER_HOST:?cmdclaw alertmanager host is required}"

exec vmalert \
  -rule=/etc/vmalert/rules/*.yml \
  -datasource.url="http://${CMDCLAW_VICTORIA_METRICS_HOST}:8428" \
  -remoteWrite.url="http://${CMDCLAW_VICTORIA_METRICS_HOST}:8428" \
  -remoteRead.url="http://${CMDCLAW_VICTORIA_METRICS_HOST}:8428" \
  -notifier.url="http://${CMDCLAW_ALERTMANAGER_HOST}:9093" \
  -evaluationInterval=30s \
  -rule.evalDelay=30s \
  -httpListenAddr=:8880
