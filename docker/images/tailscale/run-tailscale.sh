#!/usr/bin/env bash
set -euo pipefail

/render/tailscaled --tun=userspace-networking --socks5-server=localhost:1055 &
pid=$!

hostname=${TAILSCALE_HOSTNAME:-${RENDER_SERVICE_NAME}}
up_args=(up --authkey="${TAILSCALE_AUTHKEY}" --hostname="${hostname}")

if [[ -n "${ADVERTISE_ROUTES:-}" ]]; then
  up_args+=(--advertise-routes="${ADVERTISE_ROUTES}")
fi

until /render/tailscale "${up_args[@]}"; do
  sleep 0.1
done

export ALL_PROXY=socks5://localhost:1055/
tailscale_ip=$(/render/tailscale ip)
echo "Tailscale is up at IP ${tailscale_ip}"

if [[ -n "${TAILSCALE_SERVE_TARGET_HOST:-}" ]]; then
  target_scheme=${TAILSCALE_SERVE_TARGET_SCHEME:-http}
  target_port=${TAILSCALE_SERVE_TARGET_PORT:?tailscale serve target port is required}
  target_path=${TAILSCALE_SERVE_TARGET_PATH:-}
  serve_https_port=${TAILSCALE_SERVE_HTTPS_PORT:-443}
  target_url="${target_scheme}://${TAILSCALE_SERVE_TARGET_HOST}:${target_port}${target_path}"

  /render/tailscale serve reset >/dev/null 2>&1 || true
  /render/tailscale serve --yes --bg --https="${serve_https_port}" "${target_url}"
  /render/tailscale serve status
fi

wait "${pid}"
