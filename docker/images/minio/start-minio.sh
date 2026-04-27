#!/bin/sh
set -eu

export MINIO_ROOT_USER="${MINIO_ROOT_USER:-${AWS_ACCESS_KEY_ID:-}}"
export MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-${AWS_SECRET_ACCESS_KEY:-}}"

exec minio server /data --address :10000
