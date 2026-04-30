#!/bin/sh
set -eu

: "${CMDCLAW_VICTORIA_METRICS_HOST:?cmdclaw victoria metrics host is required}"
: "${CMDCLAW_ALERTMANAGER_HOST:?cmdclaw alertmanager host is required}"

alert_env="${CMDCLAW_ALERT_ENV:-staging}"
case "${alert_env}" in
  staging | prod) ;;
  *)
    echo "Unsupported alert environment ${alert_env}. Use staging or prod." >&2
    exit 1
    ;;
esac

rules_dir="/tmp/vmalert-rules"
mkdir -p "${rules_dir}"
sed "s/__CMDCLAW_ALERT_ENV__/${alert_env}/g" \
  /etc/vmalert/templates/cmdclaw-runtime.rules.yml.tpl \
  > "${rules_dir}/cmdclaw-runtime.rules.yml"

exec /vmalert-prod \
  -rule="${rules_dir}/*.yml" \
  -datasource.url="http://${CMDCLAW_VICTORIA_METRICS_HOST}:8428" \
  -remoteWrite.url="http://${CMDCLAW_VICTORIA_METRICS_HOST}:8428" \
  -remoteRead.url="http://${CMDCLAW_VICTORIA_METRICS_HOST}:8428" \
  -notifier.url="http://${CMDCLAW_ALERTMANAGER_HOST}:9093" \
  -evaluationInterval=30s \
  -rule.evalDelay=30s \
  -httpListenAddr=:8880
