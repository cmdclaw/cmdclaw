#!/usr/bin/env bash
set -euxo pipefail

TAILSCALE_VERSION=${TAILSCALE_VERSION:-1.96.4}
TS_FILE="tailscale_${TAILSCALE_VERSION}_amd64.tgz"
tmpdir=$(mktemp -d)

wget -q -O "${tmpdir}/${TS_FILE}" "https://pkgs.tailscale.com/stable/${TS_FILE}"
tar xzf "${tmpdir}/${TS_FILE}" -C "${tmpdir}" --strip-components=1
cp "${tmpdir}/tailscale" "${tmpdir}/tailscaled" /render/
rm -rf "${tmpdir}"

mkdir -p /var/run/tailscale /var/cache/tailscale /var/lib/tailscale
