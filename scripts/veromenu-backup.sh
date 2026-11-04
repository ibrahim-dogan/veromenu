#!/bin/sh
# VeroMenu daily backup (installed 2026-11-04). DB dump + uploads + .env, 14 days kept.
set -eu
umask 077
APP=/opt/veromenu
DEST=/var/backups/veromenu
D=$(date +%F)
mkdir -p "$DEST"
cd "$APP"
. ./.env 2>/dev/null || true
docker compose exec -T db pg_dump -U "${POSTGRES_USER:-veromenu}" -d "${POSTGRES_DB:-veromenu}" --format=custom > "$DEST/db-$D.dump.tmp"
mv "$DEST/db-$D.dump.tmp" "$DEST/db-$D.dump"
tar -czf "$DEST/data-$D.tar.gz" data
cp .env "$DEST/env-$D"
find "$DEST" -type f \( -name 'db-*.dump' -o -name 'data-*.tar.gz' -o -name 'env-*' \) -mtime +14 -delete
echo "$(date -Is) ok" >> "$DEST/backup.log"
