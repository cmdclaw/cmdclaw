#!/bin/sh
set -eu

mkdir -p /etc/alertmanager/secrets
printf '%s' "${SLACK_BOT_TOKEN:-}" > /etc/alertmanager/secrets/slack_bot_token

alert_env="${CMDCLAW_ALERT_ENV:-staging}"
case "${alert_env}" in
  staging)
    receiver="slack-staging"
    username="CmdClaw Staging"
    ;;
  prod)
    receiver="slack-prod"
    username="CmdClaw Prod"
    ;;
  *)
    echo "Unsupported alert environment ${alert_env}. Use staging or prod." >&2
    exit 1
    ;;
esac

sed \
  -e "s/__CMDCLAW_ALERT_RECEIVER__/${receiver}/g" \
  -e "s/__CMDCLAW_ALERT_USERNAME__/${username}/g" \
  -e "s/__CMDCLAW_ALERT_ENV__/${alert_env}/g" \
  /etc/alertmanager/alertmanager.yml.tpl \
  > /tmp/alertmanager.yml

exec /bin/alertmanager \
  --config.file=/tmp/alertmanager.yml \
  --storage.path=/alertmanager \
  --web.listen-address=:9093
