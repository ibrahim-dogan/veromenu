# VeroMenu – Deployment

> 🇩🇪 Deutsch zuerst · 🇬🇧 [English summary below](#english-summary)

VeroMenu läuft als **ein Docker-Container** (Next.js standalone) neben **PostgreSQL 17**. Für HTTPS
kann optional **Caddy** mitgestartet werden (automatische Let's-Encrypt-Zertifikate). Das Setup
funktioniert auf jedem Linux-Server mit Docker – empfohlen: Hetzner Cloud (Standort Deutschland,
z. B. CX22/CAX11 mit 2 vCPU / 4 GB RAM reicht für viele Restaurants).

```
Internet ──► Caddy :80/:443 (TLS) ──► app :3000 (Next.js) ──► db :5432 (Postgres 17)
                                         │
                                         └── ./data/uploads (Bilder, PDFs)
```

---

## 1. Server vorbereiten

```bash
# Als root auf einem frischen Ubuntu 24.04 / Debian 12
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh          # Docker Engine + Compose-Plugin
adduser --disabled-password veromenu && usermod -aG docker veromenu
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable   # optional, empfohlen
```

Hetzner: In der Cloud-Konsole zusätzlich eine Firewall mit eingehend 22, 80, 443 (TCP) und 443 (UDP, HTTP/3)
anlegen. Automatische Backups/Snapshots des Servers aktivieren (zusätzlich zu den DB-Backups unten).

## 2. DNS

Beim Domain-Anbieter für die gewünschte (Sub-)Domain, z. B. `menu.example.de`:

| Typ  | Name   | Wert                |
|------|--------|---------------------|
| A    | `menu` | IPv4 des Servers    |
| AAAA | `menu` | IPv6 des Servers    |

Erst wenn der Name auf den Server zeigt (`dig +short menu.example.de`), kann Caddy ein Zertifikat holen.

## 3. Code & Konfiguration

```bash
su - veromenu
git clone <repo-url> vero-menu && cd vero-menu
cp .env.example .env
mkdir -p data/uploads && sudo chown -R 1000:1000 data    # Container läuft als uid 1000 (node)
nano .env
```

### Umgebungsvariablen (`.env`)

| Variable | Pflicht | Beschreibung |
|---|---|---|
| `DOMAIN` | ja (mit Caddy) | z. B. `menu.example.de` – Caddy holt dafür das Zertifikat |
| `APP_URL` | ja | Öffentliche URL **mit** `https://`, ohne Slash am Ende: `https://menu.example.de`. Wird für Links in E-Mails, Sitemap, Canonical-URLs und QR-Codes genutzt. |
| `APP_SECRET` | ja | `openssl rand -hex 32` – verschlüsselt gespeicherte KI-API-Keys. **Nie verlieren** (siehe Rotation). |
| `POSTGRES_PASSWORD` | ja | `openssl rand -hex 24` (nur URL-sichere Zeichen verwenden) |
| `POSTGRES_USER` / `POSTGRES_DB` | nein | Standard `veromenu` |
| `DATABASE_URL` | – | Wird von `docker-compose.yml` automatisch auf den `db`-Service gesetzt; der Wert in `.env` gilt nur für die lokale Entwicklung. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | ja (erster Start) | Erster Plattform-Admin; wird beim Start idempotent angelegt. Passwort danach im Admin ändern. |
| `SMTP_URL` | empfohlen | z. B. `smtps://user:pass@smtp.example.de:465` – ohne SMTP werden Mails nur ins Log geschrieben (Passwort-Reset funktioniert dann nicht für Nutzer!). |
| `MAIL_FROM` | empfohlen | `"VeroMenu <no-reply@example.de>"` – Absenderdomain mit SPF/DKIM einrichten |
| `OPENROUTER_API_KEY` | optional | Legt beim ersten Start einen OpenRouter-Provider inkl. Standard-Modellen an. Später in **Admin → KI-Anbieter** änderbar. |
| `LEGAL_NAME` | ja | Betreiber für das Impressum, z. B. `Muster GmbH, vertreten durch Max Muster` |
| `LEGAL_ADDRESS` | ja | `Musterstraße 1, 20095 Hamburg` |
| `LEGAL_EMAIL` | ja | Kontakt-E-Mail (Impressum, Kontaktseite) |
| `LEGAL_PHONE` | ja | Telefonnummer |
| `LEGAL_VAT_ID` | falls vorhanden | USt-IdNr. `DE123456789` |
| `APP_PORT` | nein | Host-Port der App (nur 127.0.0.1), Standard `3000` |
| `STORAGE_DRIVER` / `STORAGE_LOCAL_DIR` | nein | Im Container fest auf `local` / `/app/data/uploads` |
| `SEED_DEMO` | nein | `1` legt zusätzlich ein Demo-Restaurant an |
| `SKIP_MIGRATIONS` / `SKIP_SEED` | nein | `1` überspringt Migrationen bzw. Seed beim Start |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | nur Multi-Instanz | siehe unten |

> ⚖️ **Rechtstexte** (Impressum, Datenschutz, AGB, AVV) sind **Vorlagen** und auf den Seiten entsprechend
> markiert. Vor dem Livegang juristisch prüfen lassen und `LEGAL_*` vollständig setzen – fehlende Angaben
> werden im Impressum als gut sichtbare Platzhalter angezeigt.

## 4. Starten

```bash
docker compose --profile https up -d --build     # App + Postgres + Caddy (HTTPS)
docker compose logs -f app                       # Migrationen, Seed, Serverstart beobachten
```

Beim Start führt der Container automatisch aus: auf DB warten → Migrationen (`drizzle/`) → Seed
(Admin, KI-Standards; idempotent) → Server. Danach `https://<DOMAIN>/login` öffnen und mit
`ADMIN_EMAIL` / `ADMIN_PASSWORD` anmelden → **Admin** im Benutzermenü.

Ohne Caddy (eigener Reverse-Proxy, z. B. nginx/Traefik): `docker compose up -d --build` – die App lauscht
dann nur auf `127.0.0.1:3000`. Der Proxy muss `X-Forwarded-For`/`X-Forwarded-Proto` setzen und darf
Server-Sent Events (`/api/...`) nicht puffern (nginx: `proxy_buffering off;`).

Status prüfen:

```bash
docker compose ps            # app sollte "healthy" sein
curl -I https://<DOMAIN>/    # 200 + Security-Header
```

## 5. Backups

**Datenbank** – täglicher Dump mit 14 Tagen Aufbewahrung (`crontab -e` als Benutzer `veromenu`):

```cron
30 3 * * * cd ~/vero-menu && mkdir -p backups && docker compose exec -T db pg_dump -U veromenu -d veromenu --format=custom | gzip > backups/db-$(date +\%F).dump.gz && find backups -name 'db-*.dump.gz' -mtime +14 -delete
```

**Uploads** – das Verzeichnis `./data` (Bilder, PDFs) mitsichern, z. B.:

```cron
45 3 * * * cd ~/vero-menu && tar -czf backups/data-$(date +\%F).tar.gz data && find backups -name 'data-*.tar.gz' -mtime +14 -delete
```

Backups zusätzlich **außerhalb des Servers** ablegen (z. B. Hetzner Storage Box via `rsync`/`restic`/`borg`).
Die `.env` (insbesondere `APP_SECRET`) separat sicher verwahren – ohne sie sind gespeicherte KI-Keys unlesbar.

**Wiederherstellen:**

```bash
docker compose stop app
gunzip -c backups/db-2026-10-01.dump.gz | docker compose exec -T db pg_restore -U veromenu -d veromenu --clean --if-exists
tar -xzf backups/data-2026-10-01.tar.gz            # stellt ./data wieder her
docker compose start app
```

## 6. Updates

```bash
cd ~/vero-menu
git pull
docker compose --profile https up -d --build       # Migrationen laufen automatisch beim Start
docker image prune -f                              # alte Images aufräumen
```

Vor größeren Updates ein Backup ziehen (siehe oben). Bei kurzen Downtimes von wenigen Sekunden während
des Neustarts liefert Caddy kurzzeitig `502`.

## 7. Geheimnisse rotieren

| Was | Vorgehen |
|---|---|
| `APP_SECRET` | Neuen Wert setzen, `docker compose up -d`. **Achtung:** In der DB verschlüsselte KI-API-Keys sind danach nicht mehr entschlüsselbar → Keys in **Admin → KI-Anbieter** neu eintragen. |
| Sessions aller Nutzer beenden | `docker compose exec db psql -U veromenu -d veromenu -c 'DELETE FROM sessions;'` |
| Admin-Passwort | Über „Passwort vergessen“ oder in **Admin → Nutzer** einen Reset-Link senden. `ADMIN_PASSWORD` in `.env` wirkt nur, wenn der Admin noch nicht existiert. |
| `POSTGRES_PASSWORD` | `docker compose exec db psql -U veromenu -c "ALTER USER veromenu PASSWORD 'neu';"`, dann `.env` anpassen und `docker compose up -d`. |
| KI-API-Keys | In **Admin → KI-Anbieter** ersetzen (alter Key beim Anbieter widerrufen). |
| SMTP-Passwort | `SMTP_URL` anpassen, `docker compose up -d`. |

## 8. E-Mail (SMTP)

`SMTP_URL` nutzt das Nodemailer-URL-Format:

```bash
SMTP_URL=smtps://user%40example.de:passwort@smtp.example.de:465      # TLS (Port 465)
SMTP_URL=smtp://user:passwort@smtp.example.de:587                    # STARTTLS (Port 587)
# Beispiele: Brevo smtp-relay.brevo.com:587 · Mailjet in-v3.mailjet.com:587 · Postmark smtp.postmarkapp.com:587
```

Sonderzeichen in Benutzer/Passwort URL-kodieren (`@` → `%40`). Für gute Zustellbarkeit SPF, DKIM und
DMARC für die Absenderdomain einrichten. Test: „Passwort vergessen“ auf `/login` auslösen und
`docker compose logs app` prüfen.

## 9. KI-Anbieter wechseln

Alle KI-Funktionen laufen über OpenAI-kompatible APIs. In **Admin → KI-Anbieter**:

1. Anbieter hinzufügen (Name, Base-URL, API-Key) – z. B. OpenRouter `https://openrouter.ai/api/v1`,
   OpenAI `https://api.openai.com/v1`, Mistral (EU) `https://api.mistral.ai/v1`, NVIDIA NIM,
   Groq oder ein eigener Ollama/vLLM-Server.
2. Pro Aufgabe (Übersetzen, Prüfen, Allergene, Import, Bilder, Assistent, Transkription) Modell und
   Fallback-Modell zuweisen. Änderungen wirken sofort, ohne Neustart.

`OPENROUTER_API_KEY` in `.env` legt **nur beim ersten Start** einen Anbieter an; danach ist die Datenbank
maßgeblich. Bei einem Wechsel zu einem Anbieter außerhalb der EU die Datenschutzerklärung/AVV
(Unterauftragsverarbeiter) anpassen.

## 10. Mehrere Instanzen / Skalierung

Für mehr als einen App-Container (Load-Balancer, Rolling Updates):

- `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` (`openssl rand -base64 32`) in `.env` setzen – wird als Build-Arg
  ins Image übernommen und muss für alle Instanzen identisch sein.
- Uploads auf gemeinsamen Speicher legen (gemeinsames Volume oder künftig S3-Treiber).
- Nur eine Instanz migrieren lassen, die anderen mit `SKIP_MIGRATIONS=1` starten.
- Echtzeit-Bestellungen laufen über Postgres LISTEN/NOTIFY und funktionieren instanzübergreifend.

## 11. Fehlerbehebung

| Problem | Lösung |
|---|---|
| `… /app/data/uploads is not writable` | `sudo chown -R 1000:1000 ./data` auf dem Host |
| Caddy bekommt kein Zertifikat | DNS prüfen, Ports 80/443 offen? `docker compose logs caddy` |
| `database not reachable` | `docker compose ps db`, `POSTGRES_PASSWORD` geändert? (das Volume behält das alte Passwort) |
| Links in E-Mails zeigen auf localhost | `APP_URL` korrekt setzen, `docker compose up -d` |
| Mails kommen nicht an | `SMTP_URL` prüfen; ohne SMTP stehen Mails nur im Log (`docker compose logs app`) |
| KI-Fehler „nicht konfiguriert“ | Anbieter + Modelle in **Admin → KI-Anbieter** hinterlegen |
| Container „unhealthy“ | `docker compose logs app --tail=100`; Healthcheck ruft `/robots.txt` auf |

Lokaler Test des Produktions-Images: `docker build -t veromenu .` und danach
`docker compose up -d` mit `APP_URL=http://localhost:3000`.

---

## English summary

VeroMenu ships as a single Docker image (Next.js standalone output) plus PostgreSQL 17, with optional
Caddy for automatic HTTPS.

1. **Server**: any Linux VPS with Docker (`curl -fsSL https://get.docker.com | sh`), e.g. Hetzner Cloud in
   Germany. Open ports 22, 80, 443 (TCP) and 443/UDP.
2. **DNS**: `A`/`AAAA` records for your domain pointing to the server.
3. **Config**: `git clone …`, `cp .env.example .env`, `mkdir -p data/uploads && sudo chown -R 1000:1000 data`.
   Set at least `DOMAIN`, `APP_URL` (https, no trailing slash), `APP_SECRET` (`openssl rand -hex 32`),
   `POSTGRES_PASSWORD` (`openssl rand -hex 24`), `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SMTP_URL`, `MAIL_FROM`,
   `LEGAL_NAME`, `LEGAL_ADDRESS`, `LEGAL_EMAIL`, `LEGAL_PHONE`, `LEGAL_VAT_ID`; optionally `OPENROUTER_API_KEY`.
   `DATABASE_URL` is set by compose. The legal pages are templates – have them reviewed by a lawyer.
4. **Start**: `docker compose --profile https up -d --build`. The entrypoint waits for the DB, runs
   migrations, seeds the first platform admin (idempotent) and starts the server. Log in at `/login`.
   Without Caddy: `docker compose up -d --build` (app on `127.0.0.1:3000` only).
5. **Backups**: nightly `docker compose exec -T db pg_dump -U veromenu -d veromenu --format=custom | gzip`
   plus a tarball of `./data`; copy off-site; keep `.env` (esp. `APP_SECRET`) safe. Restore with
   `pg_restore --clean --if-exists` and by extracting `./data`.
6. **Updates**: `git pull && docker compose --profile https up -d --build` – migrations run automatically.
7. **Rotating secrets**: changing `APP_SECRET` makes stored AI keys unreadable → re-enter them in
   Admin → AI. Kill all sessions with `DELETE FROM sessions;`. `ADMIN_PASSWORD` only applies when the admin
   does not exist yet – use a reset link afterwards.
8. **SMTP**: `smtps://user:pass@host:465` or `smtp://user:pass@host:587` (URL-encode special characters).
9. **AI providers**: Admin → AI accepts any OpenAI-compatible API (OpenRouter, OpenAI, Mistral, NVIDIA NIM,
   Groq, Ollama…), with a model per task. `OPENROUTER_API_KEY` only seeds the first provider.
10. **Multiple instances**: share `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` (build arg), shared uploads storage,
    and run migrations from one instance only (`SKIP_MIGRATIONS=1` elsewhere).
