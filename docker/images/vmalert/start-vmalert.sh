#!/bin/sh
set -eu

: "${CMDCLAW_VICTORIA_METRICS_HOSTPORT:?cmdclaw victoria metrics hostport is required}"
: "${CMDCLAW_ALERTMANAGER_HOSTPORT:?cmdclaw alertmanager hostport is required}"

exec vmalert \
  -rule=/etc/vmalert/rules/*.yml \
  -datasource.url="http://${CMDCLAW_VICTORIA_METRICS_HOSTPORT}" \
  -remoteWrite.url="http://${CMDCLAW_VICTORIA_METRICS_HOSTPORT}" \
  -remoteRead.url="http://${CMDCLAW_VICTORIA_METRICS_HOSTPORT}" \
  -notifier.url="http://${CMDCLAW_ALERTMANAGER_HOSTPORT}" \
  -evaluationInterval=30s \
  -rule.evalDelay=30s \
  -httpListenAddr=:8880
