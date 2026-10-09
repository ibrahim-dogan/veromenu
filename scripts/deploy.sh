#!/usr/bin/env bash
# Deploys the current working tree to the production server (ssh host "myserver", app in /opt/veromenu).
# Builds the amd64 image locally (the 2 GB server is too small for `next build`), streams it over SSH,
# and restarts the app container. Migrations + seed run automatically in the container entrypoint.
#   ./scripts/deploy.sh            # build + deploy
#   SKIP_BUILD=1 ./scripts/deploy.sh
set -euo pipefail
HOST="${DEPLOY_HOST:-myserver}"
DIR="${DEPLOY_DIR:-/opt/veromenu}"
cd "$(dirname "$0")/.."

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  echo "→ building linux/amd64 image"
  docker buildx build --platform linux/amd64 -t veromenu:latest --load .
fi

echo "→ uploading image to $HOST"
docker save veromenu:latest | gzip -1 | ssh "$HOST" 'gunzip | docker load'

echo "→ syncing compose files"
scp -q docker-compose.yml "$HOST:$DIR/"
scp -q docker/entrypoint.sh docker/Caddyfile "$HOST:$DIR/docker/"

echo "→ restarting"
ssh "$HOST" "cd $DIR && docker compose up -d --no-build && docker image prune -f >/dev/null"
sleep 15
ssh "$HOST" "cd $DIR && docker compose ps --format '{{.Name}} {{.Status}}' && curl -fsS -o /dev/null -w 'app -> %{http_code}\n' http://127.0.0.1:3000/"
echo "✔ deployed → https://veromenu.de"
