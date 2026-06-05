#!/usr/bin/env sh
set -eu

dry_run=0
if [ "${1:-}" = "--dry-run" ]; then
  dry_run=1
  shift
fi

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(CDPATH= cd -- "$script_dir/../../../.." && pwd)

source_dir=${1:-"$repo_root/.agents/skills"}
target_dir=${2:-"$HOME/.hermes/skills"}

if [ ! -d "$source_dir" ]; then
  printf 'source directory not found: %s\n' "$source_dir" >&2
  exit 1
fi

if [ "$dry_run" -eq 0 ]; then
  mkdir -p "$target_dir"
fi

linked=0
skipped=0
broken=0

for source_path in "$source_dir"/*; do
  [ -e "$source_path" ] || [ -L "$source_path" ] || continue

  name=${source_path##*/}
  target_path=$target_dir/$name

  if [ ! -d "$source_path" ]; then
    printf 'broken-source %s -> %s\n' "$name" "$(readlink "$source_path" 2>/dev/null || printf '')"
    broken=$((broken + 1))
    continue
  fi

  if [ -e "$target_path" ] || [ -L "$target_path" ]; then
    printf 'skip %s\n' "$name"
    skipped=$((skipped + 1))
    continue
  fi

  if [ "$dry_run" -eq 1 ]; then
    printf 'would-link %s -> %s\n' "$name" "$source_path"
  else
    ln -s "$source_path" "$target_path"
    printf 'linked %s -> %s\n' "$name" "$source_path"
  fi
  linked=$((linked + 1))
done

printf 'summary linked=%s skipped=%s broken_sources=%s\n' "$linked" "$skipped" "$broken"
