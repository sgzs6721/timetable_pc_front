#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ "${TIMETABLE_PC_FRONT_AUTO_DEPLOY:-1}" = "0" ]; then
  exit 0
fi

REMOTE_TARGET="${1:?Missing remote name or URL}"
shift

master_targets=()
for target in "$@"; do
  remote_ref="${target%%:*}"
  if [ "$remote_ref" = "refs/heads/master" ]; then
    master_targets+=("$target")
  fi
done

if [ "${#master_targets[@]}" -eq 0 ]; then
  echo "No master branch updates to confirm; skipping deployment."
  exit 0
fi

set -- "${master_targets[@]}"

TIMEOUT_SECONDS="${TIMETABLE_PC_FRONT_PUSH_DEPLOY_TIMEOUT_SECONDS:-300}"
POLL_SECONDS="${TIMETABLE_PC_FRONT_PUSH_DEPLOY_POLL_SECONDS:-2}"
DEADLINE=$((SECONDS + TIMEOUT_SECONDS))

echo "Waiting for push confirmation on $REMOTE_TARGET..."
for target in "$@"; do
  remote_ref="${target%%:*}"
  local_oid="${target#*:}"
  echo "  $remote_ref -> $local_oid"
done

while [ "$SECONDS" -le "$DEADLINE" ]; do
  all_confirmed=1

  for target in "$@"; do
    remote_ref="${target%%:*}"
    local_oid="${target#*:}"
    remote_oid="$(git -C "$PROJECT_DIR" ls-remote "$REMOTE_TARGET" "$remote_ref" | awk 'NR == 1 { print $1 }')"

    if [ "$remote_oid" != "$local_oid" ]; then
      all_confirmed=0
      break
    fi
  done

  if [ "$all_confirmed" = "1" ]; then
    echo "Push confirmed; deploying timetable pc front..."
    "$PROJECT_DIR/scripts/deploy-frontend.sh"
    exit 0
  fi

  sleep "$POLL_SECONDS"
done

echo "Push was not confirmed within ${TIMEOUT_SECONDS}s; deployment skipped." >&2
exit 1
