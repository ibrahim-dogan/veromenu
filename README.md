# VeroMenu

QR-Speisekarten für Restaurants – mehrsprachig, mit KI-Übersetzung, Allergen-Prüfung, Bestellungen und Statistiken.

## Quick start (development)

```bash
pnpm install
cp .env.example .env            # set APP_SECRET (openssl rand -hex 32) and OPENROUTER_API_KEY
docker compose -f docker-compose.dev.yml up -d   # Postgres on :5433
pnpm db:migrate && pnpm db:seed # creates the platform admin from ADMIN_EMAIL / ADMIN_PASSWORD
pnpm dev                        # http://localhost:3000
```

See `docs/ARCHITECTURE.md`.
