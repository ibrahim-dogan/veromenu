# VeroMenu – Status (2026-10-09)

## Built (MVP, all modules)

| Area | What works |
|---|---|
| Landing & legal | German-first marketing site (de/en/tr), pricing from `plans.ts`, SEO (hreflang, JSON-LD, sitemap), Impressum / Datenschutz / AGB / AVV **templates** |
| Accounts | Self sign-up for restaurant owners, login, email verification, password reset, invitations |
| Team & roles | Default roles (Inhaber, Manager, Service, Küche, Redakteur), custom roles with a permission matrix, invitations, "last owner" protection |
| Menu | Several menus, categories, items, variants, drag & drop, sold-out, tags, images, plan limits, PDF/photo menu mode |
| AI import | Photos / PDF of a paper menu → editable preview → apply |
| AI translations | Translation + independent review by a second model + back-translation into German + rule checks + glossary; uncertain texts go to review |
| Allergens | AI suggestion (14 EU allergens + additives, questions for the chef) → **human confirmation**; guests only see confirmed data (LMIV) |
| AI assistant | Text or voice instruction → change set preview (dry run) → apply → undo |
| AI images | From a prompt or a reference photo; labelled "KI-generiertes Symbolbild" for guests (AI Act) |
| Guest menu | `/m/{slug}`, 3 plugin themes (classic, modern, bistro), 16 languages (owner decides which), search/filters, cart, order + live status, Impressum |
| Tables & QR | Generic QR + one per table, PNG/SVG, printable A4 sheet / A6 table tent PDF |
| Orders | Public order API, manual or automatic acceptance, realtime board (SSE via Postgres LISTEN/NOTIFY), history |
| Statistics | Restaurant: views, visitors, QR scans per table, top items, languages, peak hours, revenue. Admin: platform KPIs, MRR estimate, AI cost. Cookie-less. |
| Platform admin | Restaurants (create, plan, suspend, open dashboard), users & admins, AI providers + model per task + usage/cost, audit log |
| Deploy | Dockerfile, docker-compose (app + Postgres + optional Caddy HTTPS), entrypoint with migrate + seed, `docs/DEPLOYMENT.md` |

Verified end-to-end in the browser: guest menu → cart → order → status page (tr) → order board (realtime) → accept; menu editor; translations run on the demo menu (82 texts, ~0.02 $, the reviewer caught "Preiselbeeren" mistranslated as "cranberries" and sent it to review).

## Local test accounts (dev only)

- Platform admin: `admin@veromenu.local` / `ChangeMe123!` (from `.env`)
- Demo owner: `demo@veromenu.local` / `Demo1234!` → restaurant "Gasthaus Zur Linde", guest menu `/m/zur-linde`
- Test restaurants created by the build agents: Test AI Quality, Test AI Studio, Test Guest, Test Ops (can be deleted)

## Known gaps / next steps

1. **Payments**: no Stripe/Mollie integration yet – plans are assigned by the admin. This is needed before earning money.
2. **Legal**: legal texts are templates → have them checked by a lawyer; fill in the `LEGAL_*` env vars.
3. **QR PDF fonts**: Turkish/Polish special characters are transliterated, non-Latin scripts are left out (needs `@pdf-lib/fontkit` + a Noto font).
4. Voice recording is tested server-side only (WAV → transcription); not yet tried in a real phone browser (iOS Safari).
5. New items are not translated automatically ("Fehlende übersetzen" button); translation runs take ~1 s per text (batches could run in parallel).
6. S3 storage driver not implemented (local volume works).
7. System role names are stored in the creator's language (could be shown via i18n by role key).
8. Orders are rate-limited per IP (guests on the same restaurant WiFi share it) – watch in production.
9. Undoing an AI delete recreates items without their translations; abandoned AI image drafts need a cleanup job.

## Production (since 2026-10-09)

- Live at **https://veromenu.de** (veromenu.com / .org / .store and www.* redirect there).
- Server `myserver` (Ubuntu 24.04, 2 vCPU, 1.8 GB RAM): Docker Compose stack in `/opt/veromenu` (app + Postgres 17, uploads in `/opt/veromenu/data`), existing nginx + Let's Encrypt in front (`/etc/nginx/sites-available/veromenu`, proxy to 127.0.0.1:3000, SSE location for the order board).
- Secrets live only in `/opt/veromenu/.env` on the server (APP_SECRET, POSTGRES_PASSWORD, ADMIN_PASSWORD, OPENROUTER_API_KEY).
- Platform admin: `admin@veromenu.de` (password in the server `.env`, change it after first login).
- Deploy updates: `./scripts/deploy.sh` (builds amd64 locally, streams the image over SSH, restarts; migrations run on start).
- The old Laravel app was removed; backups: `/root/backups/` on the server and `~/Documents/private_coding/veromenu-server-backup/` locally. php8.3-fpm and redis-server were stopped/disabled (packages still installed).
- No SMTP configured yet → verification / invitation / reset mails only appear in `docker compose logs app`. Set `SMTP_URL` in the server `.env`.
- Known UX issue: on slow devices, text typed into auth forms before hydration is reset (controlled inputs) – switch those forms to uncontrolled inputs / FormData.
