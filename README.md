# Daynest

**Make room for what matters.** A calm todo list and calendar planner: month, week, day and agenda views, Quick Add with natural language, recurring tasks, search, and an installable offline-first PWA. With Supabase configured it becomes a multi-user app with secure accounts and sync across devices.

Live site: https://daynest-web-app.vercel.app

## Technology used

| Part | Tool | What it does |
|---|---|---|
| App | **Vue 3** + **JavaScript** | Builds the screens |
| Build | **Vite** | Runs the app while coding and builds it for the web |
| State | **Pinia** | Keeps tasks, lists and settings in one place |
| Pages | **Vue Router** | Moves between pages and protects sign-in pages |
| Style | **Plain CSS** | Colours, light and dark themes (no CSS framework) |
| Font and icons | **Plus Jakarta Sans**, **Lucide** | Text and icons |
| Data on device | **IndexedDB** | Saves tasks in the browser, so the app works offline |
| Accounts | **Supabase Auth** | Sign up, sign in, reset password |
| Database | **Supabase PostgreSQL** | Stores each user's data; Row Level Security keeps users apart |
| Live sync | **Supabase Realtime** | Shows changes on your other devices right away |
| Files | **Supabase Storage** | Profile pictures (private) |
| Install and offline | **Service worker** + **manifest** (PWA) | Install on phone or computer and open without internet |
| Tests | **Vitest**, **ESLint** | Check that the code works and is clean |
| Hosting | **Vercel** + **GitHub** | Puts the app online; every push to `master` updates the site |

## Quick start

Requires Node 20.19+ or 22.12+.

```bash
npm install
cp .env.example .env.local   # optional: add Supabase keys for accounts and sync
npm run dev                  # http://localhost:5181
```

Without the Supabase variables, Daynest runs in **local-only mode**: no accounts, and data stays in this browser.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server (no service worker in dev) |
| `npm run build` | Production build into `dist/` (includes `dist/sw.js`) |
| `npm run preview` | Serve the build on http://localhost:4181 (to test the PWA) |
| `npm test` | Unit, store, persistence and sync tests (Vitest + fake IndexedDB) |
| `npm run lint` | ESLint (JS and Vue) |
| `npm run test:db` | Database security and sync tests against the local Supabase stack |
| `npm run db:reset` | Rebuild the local database from `supabase/migrations` |
| `npm run icons` | Re-render PNG icons from `public/icons/*.svg` |

## Accounts and sync (Supabase)

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (see `.env.example`). Full guide for hosted and local setup, migrations and tests: **[docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)**.

- **Auth:** email sign-up with confirmation, sign-in, password reset (PKCE), change password (re-checks the current one), profile name and picture.
- **Offline-first:** each user has their own local database (`daynest-user-<id>`). The UI reads and writes it instantly, and every change is also written to a persistent outbox in the same transaction, so nothing is lost if the tab closes.
- **Sync engine** (`src/services/sync.js`):
  - **Pull:** keyset paging by server-set `updated_at`.
  - **Push:** sends the outbox in order, with optimistic concurrency on `rev` and a 3-way merge on conflict.
  - **Realtime:** updates through Supabase Realtime.
  - **Single pusher:** only one tab pushes at a time (Web Locks).
  - **Local changes win:** server data never overwrites a local change that hasn't been pushed yet.

## Security

- **Row Level Security** is on for every table, with owner-only policies using `(select auth.uid())`. The anonymous role has no table access.
- **User ids** come from the database (`default auth.uid()`). The client never sends `user_id`, and a trigger blocks changing a row's owner.
- **Composite foreign keys** `(id, user_id)` stop a task from referencing another user's list or category.
- **Avatars** are in a private bucket limited to the user's own folder, served with short-lived signed URLs.
- **Keys:** only the public anon/publishable key is used in the frontend. The service-role key is never used in app code (only by `npm run test:db` locally). `.env*` files are git-ignored, except `.env.example`.
- **Password reset:** the reset form only unlocks for a session created by the reset email link, so an open signed-in device can't change the password without the current one.
- **Sign-out** deletes the account's local copy when everything is synced. If not, it warns first.
- **Pre-account data:** tasks saved in this browser before signing in are offered to an account only once.
- `npm run test:db` checks all of this against a real database with two users.

## Project structure

```
src/
  components/   brand/, ui/ (primitives), task/, calendar/, layout/, auth/
  composables/  bootstrap (workspace load/unload), account, task actions, drag & drop, dialogs, toasts…
  constants/    brand and app constants
  layouts/      AppShell (signed-in app), AuthLayout (sign-in pages)
  pages/        Today, Tasks, Calendar, Upcoming, Completed, Search, More, Account, auth/*
  pwa/          service worker source, registration, install and update prompts
  router/       routes and auth guard
  services/     db (IndexedDB), persistence (write queue, cross-tab sync), sync (Supabase),
                supabase client, mappers (row <-> model), backup, legacyImport
  stores/       Pinia: tasks (indexed by day), collections, settings, ui, auth
  types/        JSDoc type definitions (models.js)
  utils/        pure logic: dates, recurrence, Quick Add parser, calendar layout, filters, validation, merge
supabase/       config.toml and SQL migrations (schema, RLS, server timestamps)
tests/          Vitest unit tests        tests-db/  database tests (local Supabase)
scripts/        icon generator, sample data, DB test runner
```

## Design notes

- **Dates** are local calendar dates (`YYYY-MM-DD`) and wall-clock times (`HH:mm`). Timestamps are UTC ISO strings.
- **Recurring tasks** are one record with a rule; occurrences are calculated only for the visible range. Single-occurrence edits live in `task.overrides`; "this and following" splits the series and keeps any "N times" limit.
- **Performance:** tasks live in a `shallowRef(Map)` of immutable objects with a per-day index; views read only their visible range; long lists render incrementally; writes are coalesced into one IndexedDB transaction. Tests cover 5,000 tasks.
- **Multiple windows** share the database and update each other (BroadcastChannel). A write based on an older `rev` is merged, not overwritten.
- **PWA:** the service worker precaches the app shell; its cache name is a hash of the build, so each deploy shows an update prompt.
- **Brand:** the Lavender & Cream palette and Plus Jakarta Sans tokens are in `src/assets/styles/tokens.css`, with light and dark themes. All text pairs meet WCAG AA.

## Sample data

`node scripts/make-sample-data.mjs` writes `samples/daynest-sample-data.json` (about 35 tasks around today). In local-only mode, load it with **Settings → Your data → Import backup** (this replaces existing data).

## Known limitations

- Reminders fire while Daynest is open or running in the background. Delivery when it is fully closed would need server push.
- Restoring a JSON backup is available only in local-only mode. With an account, data comes from the server.
- The events, habits and reminders tables exist in the database, but their screens are not built yet.
