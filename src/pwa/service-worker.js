/* Daynest service worker.
 *
 * Built by the `daynest-sw` plugin in vite.config.ts, which replaces
 * __DAYNEST_VERSION__ and __DAYNEST_PRECACHE__ with the build's hash and its
 * list of emitted files.
 *
 * Strategy
 *  - App shell + every hashed build asset (JS, CSS, fonts, icons) are
 *    precached on install, so the app starts fully offline.
 *  - Navigations: network first (fresh deploys win), falling back to the
 *    cached shell when offline. All routes are client-side.
 *  - Same-origin static GETs: cache first (hashed names never change).
 *  - Nothing else is cached: Daynest has no API; user data lives in
 *    IndexedDB, never in the HTTP cache.
 *  - A new version waits until the page asks it to take over
 *    ("A new version is ready → Reload"), then old caches are deleted.
 */

const VERSION = '__DAYNEST_VERSION__'
const CACHE = `daynest-${VERSION}`
const PRECACHE = __DAYNEST_PRECACHE__
const SHELL = '/index.html'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })))),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k.startsWith('daynest-') && k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          // Not cached: the precached shell must stay matched to this
          // version's precached assets, or an offline start could break.
          return await fetch(req)
        } catch {
          const cached = await caches.match(SHELL, { cacheName: CACHE, ignoreVary: true })
          return cached || new Response('Daynest is offline and has not been cached yet.', { status: 503, headers: { 'Content-Type': 'text/plain' } })
        }
      })(),
    )
    return
  }

  event.respondWith(
    (async () => {
      // ignoreVary: servers often send `Vary: Origin`, and module/CSS
      // preloads carry an Origin header the precache request did not.
      const cached = await caches.match(req, { cacheName: CACHE, ignoreVary: true, ignoreSearch: url.pathname === '/manifest.webmanifest' })
      if (cached) return cached
      try {
        const res = await fetch(req)
        // Cache later-loaded static files (e.g. a lazily requested icon).
        if (res.ok && res.type === 'basic' && /\.(?:js|css|woff2?|png|svg|webmanifest)$/.test(url.pathname)) {
          const cache = await caches.open(CACHE)
          cache.put(req, res.clone())
        }
        return res
      } catch {
        return new Response('', { status: 504, statusText: 'Offline' })
      }
    })(),
  )
})

/* Clicking a reminder notification focuses Daynest (or opens it). */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/today'
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const c of all) {
        if ('focus' in c) {
          await c.focus()
          if ('navigate' in c) c.navigate(target).catch(() => {})
          return
        }
      }
      await self.clients.openWindow(target)
    })(),
  )
})
