#!/bin/sh
set -eu

mkdir -p /etc/alertmanager/secrets
printf '%s' "${SLACK_BOT_TOKEN:-}" > /etc/alertmanager/secrets/slack_bot_token

exec /bin/alertmanager \
  --config.file=/etc/alertmanager/alertmanager.yml \
  --storage.path=/alertmanager \
  --web.listen-address=":${PORT:-9093}"
