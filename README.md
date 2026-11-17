# Daynest

**Make room for what matters.** A calm planner for your tasks and calendar — installable, works offline, and keeps your data on your device.

Vue 3 · TypeScript · Vite · Pinia · Lucide icons · Plus Jakarta Sans · IndexedDB · hand-written service worker (no PWA framework).

```bash
npm install
npm run dev        # http://localhost:5181 (no service worker in dev)
npm test           # unit, store, persistence and sync tests (Vitest)
npm run typecheck
npm run lint
npm run build      # typecheck + production build into dist/ (includes dist/sw.js)
npm run preview    # serve the production build on http://localhost:4181 to test the PWA
node scripts/generate-icons.mjs   # re-render PNG icons from public/icons/*.svg
```

## Brand — Lavender & Cream

| Token | Colour | Used for |
|---|---|---|
| Soft Cream | `#F7F4FA` | main background |
| Light Lavender | `#E8DFF2` | secondary backgrounds, selected states |
| Muted Lilac | `#B9A3D1` | soft accents |
| Soft Purple | `#8B72A8` | brand colour: logo tile, icons, accents. Buttons and active fills use it deepened with a touch of Deep Plum (≈`#7B6595`) so white text meets WCAG AA (5.07:1) |
| Deep Plum | `#443750` | main text and headings |
| White | `#FFFFFF` | cards and surfaces |

Semantic: success `#8BAF91`, warning `#E6C477`, error `#D68C91`, info `#91B5D3`. These are used as fills, dots and icons; small text in those hues is deepened with Deep Plum so it stays readable. Calendar categories use only these colours.

All tokens live in `src/assets/styles/tokens.css` (light: cream, lavender and white; dark: deep plum and dark purple surfaces). Theme follows the system by default and can be set to Light/Dark in Settings (saved).

Typography is **Plus Jakarta Sans** only, with system fallbacks: titles 700, section headings / buttons / navigation 600, calendar dates and secondary labels 500, body 400.

The logo (`src/components/brand/DaynestLogo.vue`, `public/favicon.svg`, `public/icons/`) is a warm-yellow sun resting in a cream nest on a soft-purple tile.

## Architecture

```
src/
  types/        data model (Task, TaskInstance, RecurrenceRule, …)
  utils/        pure logic: dates, recurrence, quick-add parser, calendar layout, filters, validation, 3-way merge
  services/     IndexedDB wrapper, write queue + cross-window sync, JSON backup
  stores/       Pinia: tasks (with date index), collections (calendars + lists), settings, ui
  composables/  task actions (undo/toasts/scope prompts), drag & drop, reorder, stats, reminders…
  pwa/          service worker source, registration/updates/install/notifications
  components/   brand/, ui/ (primitives), task/, calendar/, layout/
  pages/        Today, My Tasks, Calendar, Upcoming, Completed, Search, More (mobile)
```

- **Dates** are local calendar dates (`YYYY-MM-DD`) and wall-clock times (`HH:mm`) — "floating" time, as in most planners. Timestamps are UTC ISO strings.
- **Recurring tasks** are one record with a rule; occurrences are calculated for the visible range only. Per-occurrence edits live in `task.overrides`; "this and following" splits the series.
- **Performance:** tasks live in a `shallowRef(Map)` of immutable objects with a per-day index; views read only their visible range; long lists render incrementally.

## Offline, PWA and sync

- **Installable:** `public/manifest.webmanifest` (standalone, theme/background colours, 192/512/maskable icons, "New task" and "Calendar" shortcuts). Chromium browsers show an **Install Daynest** button in the sidebar and Settings; iOS gets Add-to-Home-Screen instructions.
- **Service worker** (`src/pwa/service-worker.js`, generated into `dist/sw.js` by the `daynest-sw` plugin in `vite.config.ts`): precaches the app shell and every hashed asset; navigations are network-first with the cached shell as offline fallback; static files are cache-first. The cache name is a hash of the build, so each deploy installs a new version, shows **"A new version is ready → Reload"**, and deletes old caches. No user data is ever put in the HTTP cache.
- **Offline-first data:** everything is in IndexedDB, so creating, editing and completing tasks work the same with or without a connection. The sidebar shows *Saved on this device / Saving / Offline / Couldn’t save — retrying*.
- **Reliable saves:** writes are coalesced and committed in one transaction; failures are kept and retried with backoff (1 s → 30 s).
- **Sync between windows:** browser tabs and the installed app on the same device share the database and update each other live (BroadcastChannel). Every task has a `rev`; a write based on an older revision is **3-way merged** instead of overwriting newer data (different fields combine; the same field keeps the latest edit and the user is told). A delete of a task edited elsewhere is refused.
- **Reminders:** opt-in in Settings (permission is requested only when you switch it on), with a default reminder for new timed tasks. Shown as system notifications via the service worker where allowed, otherwise in-app.

## Sample data

`node scripts/make-sample-data.mjs` writes `samples/daynest-sample-data.json`: about 35 realistic tasks dated around *today* (today’s plan, two overdue, next week, a multi-day trip, recurring routines, completed history, descriptions and subtasks). Load it with **Settings → Your data → Import backup** (this replaces existing data).

## Dev helpers

In development only, the console has `__daynest.seed(2000)` (synthetic tasks for performance testing) and `__daynest.clear()`.

## Known limitations

- **No server.** Data stays on one device; "sync" means between windows/tabs/the installed app on that device. Moving devices uses Settings → Export/Import backup. Multi-device sync needs a backend and accounts — `services/persistence.ts` is the single place to add one.
- **No sign-in.** There are no accounts, so there is no login screen to brand.
- Reminders fire while Daynest is open or kept alive in the background; delivery when fully closed would need server push.
- Attachments are not implemented.
- Recurring occurrences in the past are not counted as "overdue".
- Technical identifiers from the original project name are kept on purpose: the IndexedDB name (`bloom-planner`, so existing data stays readable) and the project folder. Old `bloom-planner` backups still import.
