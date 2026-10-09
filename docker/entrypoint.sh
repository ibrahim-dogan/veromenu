#!/bin/sh
# VeroMenu container entrypoint: wait for Postgres → migrate → seed (idempotent) → start server.
#   SKIP_MIGRATIONS=1   skip migrations (e.g. when several replicas start at once and one migrates)
#   SKIP_SEED=1         skip the seed (platform admin from ADMIN_EMAIL / ADMIN_PASSWORD, AI defaults)
#   SEED_DEMO=1         additionally seed the demo restaurant
#   DB_WAIT_SECONDS=60  how long to wait for the database
set -eu
cd /app

if [ -z "${DATABASE_URL:-}" ]; then
  echo "✖ DATABASE_URL is not set" >&2
  exit 1
fi

# Uploads directory must be writable by the non-root user (bind mount ./data → /app/data).
UPLOADS="${STORAGE_LOCAL_DIR:-/app/data/uploads}"
mkdir -p "$UPLOADS" 2>/dev/null || true
if ! [ -w "$UPLOADS" ]; then
  echo "✖ $UPLOADS is not writable by uid $(id -u). On the host run: sudo chown -R $(id -u):$(id -g) ./data" >&2
  exit 1
fi

max="${DB_WAIT_SECONDS:-60}"
waited=0
echo "→ waiting for database"
until node -e "const u=new URL(process.env.DATABASE_URL);const s=require('net').connect(Number(u.port)||5432,u.hostname);s.setTimeout(2000);s.on('connect',()=>{s.end();process.exit(0)}).on('error',()=>process.exit(1)).on('timeout',()=>process.exit(1))"; do
  if [ "$waited" -ge "$max" ]; then
    echo "✖ database not reachable after ${max}s" >&2
    exit 1
  fi
  sleep 2
  waited=$((waited + 2))
done

if [ "${SKIP_MIGRATIONS:-0}" != "1" ]; then
  echo "→ applying database migrations"
  # Migrations run in a transaction, so retrying until the DB accepts connections is safe.
  until node dist-scripts/migrate.cjs; do
    if [ "$waited" -ge "$max" ]; then
      echo "✖ database not reachable / migrations failed after ${max}s" >&2
      exit 1
    fi
    echo "  database not ready yet – retrying in 3s"
    sleep 3
    waited=$((waited + 3))
  done
fi

if [ "${SKIP_SEED:-0}" != "1" ]; then
  echo "→ seeding (idempotent)"
  if [ "${SEED_DEMO:-0}" = "1" ]; then
    node dist-scripts/seed.cjs --demo
  else
    node dist-scripts/seed.cjs
  fi
fi

echo "→ starting VeroMenu on ${HOSTNAME:-0.0.0.0}:${PORT:-3000}"
exec "$@"
