#!/usr/bin/env bash
#
# Hearth host updater (issue #81, Phase 2b). Runs on the HOST — via a systemd
# timer or cron (see deploy/hearth-updater.{service,timer}) — NOT in a container.
# It is the only thing with Docker access; the Hearth app has none.
#
# Each run it touches a heartbeat (so the app knows managed updates are live) and,
# if the app has written an update-request file, pulls the new image and recreates
# the container, then writes a result file the app can read back.
#
# Config via env:
#   HEARTH_PROJECT_DIR   dir holding the compose file + ./data   (default: $PWD)
#   HEARTH_COMPOSE_FILE  compose file to drive   (default: docker-compose.ghcr.yml)
#   HEARTH_UPDATE_DIR    control-file dir   (default: $HEARTH_PROJECT_DIR/data/updates)
#
# Run as a user in the `docker` group. Keep it to this one job.

set -uo pipefail

PROJECT_DIR="${HEARTH_PROJECT_DIR:-$(pwd)}"
COMPOSE_FILE="${HEARTH_COMPOSE_FILE:-docker-compose.ghcr.yml}"
UPDATE_DIR="${HEARTH_UPDATE_DIR:-$PROJECT_DIR/data/updates}"

HEARTBEAT="$UPDATE_DIR/.updater-heartbeat"
REQUEST="$UPDATE_DIR/update-request.json"
RESULT="$UPDATE_DIR/update-result.json"

log() { echo "[hearth-updater] $*"; }
now_ms() { echo $(( $(date +%s) * 1000 )); }

mkdir -p "$UPDATE_DIR"

# Liveness: the app treats a fresh heartbeat as "managed updates available".
touch "$HEARTBEAT"

# Nothing to do unless the app requested an update.
[ -f "$REQUEST" ] || exit 0

cd "$PROJECT_DIR" || { log "project dir $PROJECT_DIR not found"; exit 1; }

# Write {ok, version, at, error} atomically. Version is left null — the app
# re-derives its own version from the new image when it restarts.
write_result() { # $1=true|false  $2=error-or-empty
  local err_json='null'
  [ -n "${2:-}" ] && err_json="\"$2\""
  printf '{"ok":%s,"version":null,"at":%s,"error":%s}\n' "$1" "$(now_ms)" "$err_json" \
    > "$RESULT.tmp" && mv "$RESULT.tmp" "$RESULT"
}

log "update requested — pulling ($COMPOSE_FILE)"
if docker compose -f "$COMPOSE_FILE" pull && docker compose -f "$COMPOSE_FILE" up -d; then
  log "update applied"
  write_result true ""
else
  log "update failed"
  write_result false "docker compose pull/up failed — see the hearth-updater log"
fi

# Clear the request last, so a crash mid-update leaves it to retry next tick.
rm -f "$REQUEST"
