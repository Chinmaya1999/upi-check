#!/usr/bin/env bash
# Consistent snapshot of the Paisa database into ~/paisa/backups (keeps the newest 14).
set -euo pipefail
APP="$HOME/paisa"; TS=$(date -u +%Y%m%dT%H%M%SZ); OUT="$APP/backups/paisa-$TS.db"
mkdir -p "$APP/backups"
if docker ps --format '{{.Names}}' | grep -qx paisa-api; then
  # Online snapshot via SQLite VACUUM INTO (safe while the API is serving requests).
  docker exec paisa-api node -e "new (require('node:sqlite').DatabaseSync)('/data/paisa.db').exec(\"VACUUM INTO '/backups/paisa-$TS.db'\")"
elif [ -f "$APP/data/paisa.db" ]; then
  cp "$APP/data/paisa.db" "$OUT"; [ -f "$APP/data/paisa.db-wal" ] && cp "$APP/data/paisa.db-wal" "$OUT-wal" || true
else
  echo "no database yet, nothing to back up"; exit 0
fi
echo "backup: $OUT"
ls -1t "$APP"/backups/paisa-*.db 2>/dev/null | tail -n +15 | xargs -r rm -f
