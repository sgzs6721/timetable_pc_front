#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_DIR/.env.deploy"
DIST_DIR="$PROJECT_DIR/dist"
EXPECTED_DEPLOY_DIR="/root/lesson/timetable_front_miniapp"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing deploy config: $ENV_FILE" >&2
  echo "Create it from .env.deploy.example first." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

require_env() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "Missing required deploy config: $name" >&2
    exit 1
  fi
}

require_env TIMETABLE_PC_FRONT_DEPLOY_HOST
require_env TIMETABLE_PC_FRONT_DEPLOY_USER
require_env TIMETABLE_PC_FRONT_SSH_PORT
require_env TIMETABLE_PC_FRONT_DEPLOY_DIR
require_env TIMETABLE_PC_FRONT_SSH_KEY_CONTENT

DEPLOY_USER="$TIMETABLE_PC_FRONT_DEPLOY_USER"
SSH_PORT="$TIMETABLE_PC_FRONT_SSH_PORT"
DEPLOY_DIR="$TIMETABLE_PC_FRONT_DEPLOY_DIR"
REMOTE="${DEPLOY_USER}@${TIMETABLE_PC_FRONT_DEPLOY_HOST}"

if [ "$DEPLOY_DIR" != "$EXPECTED_DEPLOY_DIR" ]; then
  echo "Refusing to clear unexpected directory: $DEPLOY_DIR" >&2
  echo "Expected: $EXPECTED_DEPLOY_DIR" >&2
  exit 1
fi

SSH_OPTS=(-p "$SSH_PORT")

SSH_KEY_CONTENT="$TIMETABLE_PC_FRONT_SSH_KEY_CONTENT"
TEMP_SSH_KEY=""

if [ -n "$SSH_KEY_CONTENT" ]; then
  TEMP_SSH_KEY="$(mktemp)"
  SSH_KEY_CONTENT="${SSH_KEY_CONTENT//\\n/$'\n'}"
  printf '%s\n' "$SSH_KEY_CONTENT" > "$TEMP_SSH_KEY"
  chmod 600 "$TEMP_SSH_KEY"
  trap 'rm -f "$TEMP_SSH_KEY"' EXIT
  SSH_KEY_PATH="$TEMP_SSH_KEY"
fi

if [ -n "${SSH_KEY_PATH:-}" ]; then
  SSH_OPTS+=(-i "$SSH_KEY_PATH")
fi

quote_shell() {
  printf "%q" "$1"
}

remote_env() {
  printf "DEPLOY_DIR=%s" "$(quote_shell "$DEPLOY_DIR")"
}

echo "Building frontend dist..."
(
  cd "$PROJECT_DIR"
  npm run build
)

test -f "$DIST_DIR/index.html"

echo "Clearing remote directory $DEPLOY_DIR..."
ssh "${SSH_OPTS[@]}" "$REMOTE" "$(remote_env) bash -s" <<'REMOTE_SCRIPT'
set -euo pipefail

case "$DEPLOY_DIR" in
  /root/lesson/timetable_front_miniapp)
    ;;
  *)
    echo "Refusing to clear unexpected directory: $DEPLOY_DIR" >&2
    exit 1
    ;;
esac

mkdir -p "$DEPLOY_DIR"
find "$DEPLOY_DIR" -mindepth 1 -delete
REMOTE_SCRIPT

echo "Uploading dist..."
tar -C "$DIST_DIR" -cf - . | ssh "${SSH_OPTS[@]}" "$REMOTE" "tar -C $(quote_shell "$DEPLOY_DIR") -xf -"

echo "Deployment finished: $REMOTE:$DEPLOY_DIR"
