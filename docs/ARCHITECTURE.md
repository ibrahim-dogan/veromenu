# VeroMenu – Architecture

QR menu SaaS for restaurants, Germany-first (German is the source and default language).

## Stack

| Layer | Choice | Why |
|---|---|---|
| App | **Next.js 16 (App Router) + React 19 + TypeScript** | One deployable for landing, dashboard, admin, guest menu and API. Server components + server actions keep the code small. |
| DB | **PostgreSQL 17 + Drizzle ORM** | Typed schema in code, SQL migrations, LISTEN/NOTIFY for realtime orders. |
| i18n | **next-intl** | UI in `de` (default, no URL prefix), `en`, `tr`; guest menu in 16 languages. |
| Styling | Tailwind CSS v4 | App design tokens in `globals.css`; guest themes bring their own CSS variables. |
| AI | Own provider layer (`src/core/ai`) | Any OpenAI-compatible provider (OpenRouter, NVIDIA NIM, OpenAI, Groq, Ollama…). Model per task, switchable at runtime in Admin → AI. |
| Files | Storage driver (`src/core/storage`) | Local disk volume by default; S3-compatible driver can be added. Images → webp variants via sharp. |
| Deploy | Docker Compose (app + postgres [+ Caddy for TLS]) | Runs on any VPS (Hetzner etc.). |

## Layout

```
src/
  app/
    [locale]/                 UI with locale prefix (de has none)
      page.tsx                landing        (marketing module)
      (auth)/…                login, register, forgot/reset password, verify email, invite
      dashboard/              restaurant picker + /dashboard/[rid]/<module> screens
      admin/                  platform admin
    m/[slug]/                 PUBLIC guest menu (own root layout, no locale prefix; ?t=<tableToken>&lang=xx)
    api/                      route handlers (public guest APIs, SSE, uploads, QR images)
    media/[...key]            serves stored files
  core/                       framework-level, no business logic
    db/schema/*.ts            ALL tables (auth, tenancy, menu, operations, ai)
    auth/                     session (argon2 + DB sessions), guards, permissions
    ai/                       provider adapters, task routing, credits, usage log, aiJson/aiImage/aiTranscribe
    i18n/                     locales catalog, routing, message loading (src/messages/<locale>/<namespace>.json)
    storage/                  storage driver + media service (saveMedia, mediaSrc)
    http/                     action() wrapper, AppError, rate limit
    events/                   Postgres LISTEN/NOTIFY pub/sub
    modules/nav.ts            module navigation registry (sidebar generated from it)
  modules/<name>/             business modules: service.ts (server), actions.ts ("use server"), components/
  themes/<id>/                guest menu themes (plugin-style, see themes/README.md)
  components/ui               design-system primitives;  components/shell = app chrome
  messages/<locale>/<ns>.json one file per namespace, owned by its module
scripts/                      migrate, seed, demo seed, ai smoke test, i18n check
docs/                         this folder
```

## Core concepts

- **Tenancy**: `restaurants` ← `memberships` (user, role) → `roles` (named permission sets). Default roles: owner, manager, service, kitchen, editor; owners can create custom roles. Platform admins (`users.is_platform_admin`) can enter any restaurant with full rights (yellow banner).
- **Permissions**: `src/core/auth/permissions.ts`. Pages use `requireRestaurant(rid, perm)`, server actions use `assertRestaurantPermission(rid, perm)`.
- **Plans** (`src/modules/billing/plans.ts`): limits (items, menus, languages, tables, users, AI credits) + features (ordering, tables, ai_agent, ai_images …). Sidebar shows locked features; services enforce limits (`AppError("planLimit")`).
- **Source language + translations**: entity tables hold the source text (restaurant `default_locale`, normally `de`). `translations` holds other locales with `status` (machine / needs_review / approved / stale), `source_hash`, AI `quality_score`, `review_notes`, and a **back-translation** into the source language so a German owner can verify meaning without speaking the target language.
- **Guest languages**: only `restaurants.enabled_locales` are offered to guests (owner decides, plan limits count).
- **Allergens (LMIV)**: only *confirmed* allergens are shown to guests. AI suggestions are just suggestions; ambiguous cases create `review_tasks`. Changing a confirmed item's recipe text puts it back to `needs_review`. Unconfirmed items show "Allergen information available from staff".
- **AI never writes directly**: the agent produces a change set → server validates and renders a diff (dry run) → user approves → applied in one transaction with undo data (`agent_changesets`).
- **Analytics** are cookie-less (daily-rotating hashed visitor id) → no consent banner needed for the guest menu.
- **Realtime orders** via Postgres LISTEN/NOTIFY → works with multiple app instances.

## Conventions

- Server-only modules start with `import "server-only"`. Scripts run with `--conditions=react-server`.
- Mutations = server actions wrapped in `action(zodSchema, handler)` returning `ActionResult`; client calls via `useAction()` (toasts + refresh). Errors are i18n keys in `messages/*/errors.json`.
- Every user-visible string goes through next-intl. German first, then English and Turkish. Don't hard-code text.
- Inside `[locale]` use `Link/redirect/useRouter` from `@/core/i18n/navigation`.
- Writes to menu data go through `src/modules/menu/service.ts` (keeps translation/allergen invariants).
- Audit important changes with `audit()`.
