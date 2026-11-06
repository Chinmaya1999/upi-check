#!/usr/bin/env bash
# Runs ON the server. Usage: deploy.sh <image:tag>. Backs up, swaps the container, health-checks, rolls back on failure.
set -euo pipefail
IMAGE="${1:?usage: deploy.sh <image:tag>}"
APP="$HOME/paisa"; cd "$APP"
log() { printf '\n==> %s\n' "$*"; }

PREV=$(docker inspect -f '{{.Config.Image}}' paisa-api 2>/dev/null || true)
LEGACY=false; systemctl is-active --quiet paisa-api && LEGACY=true
log "previous: ${PREV:-none}  legacy-systemd-service: $LEGACY"

log "Snapshot database"
if $LEGACY; then sudo systemctl stop paisa-api; fi   # releases port 80 and checkpoints the WAL
bash "$APP/backup-db.sh"

log "Pull $IMAGE"
docker pull "$IMAGE"

log "Start container"
if $LEGACY; then sudo systemctl disable paisa-api >/dev/null 2>&1 || true; fi
IMAGE="$IMAGE" docker compose -f "$APP/docker-compose.yml" up -d --remove-orphans

log "Health check"
ok=false
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3000/health >/dev/null 2>&1; then ok=true; break; fi
  sleep 2
done
if $ok; then
  echo "healthy: $(curl -fsS http://127.0.0.1:3000/health)"
  docker image prune -af --filter "until=72h" >/dev/null || true
  exit 0
fi

log "UNHEALTHY — container logs"
docker logs --tail 60 paisa-api || true
log "Rolling back"
if [ -n "$PREV" ]; then
  IMAGE="$PREV" docker compose -f "$APP/docker-compose.yml" up -d
elif $LEGACY; then
  docker rm -f paisa-api >/dev/null 2>&1 || true; sudo systemctl enable --now paisa-api
fi
exit 1
