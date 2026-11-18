import { computed, ref, shallowRef } from 'vue'

/**
 * PWA runtime state shared across the app: service worker registration and
 * updates, the install prompt, and online/offline status. Module-level
 * singletons — `initPwa()` is called once from main.ts.
 */

export const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine)
export const updateReady = ref(false)
export const installed = ref(false)
const installEvent = shallowRef(null)
let registration = null
let reloading = false
let updateRequested = false

export const canInstall = computed(() => !!installEvent.value && !installed.value)

export const isStandalone = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true)

export const isIOS = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)

export const swSupported = () => typeof navigator !== 'undefined' && 'serviceWorker' in navigator

export function initPwa() {
  if (typeof window === 'undefined') return
  installed.value = isStandalone()

  window.addEventListener('online', () => (online.value = true))
  window.addEventListener('offline', () => (online.value = false))

  // Chromium: keep the install prompt for a deliberate "Install" click.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    installEvent.value = e
  })
  window.addEventListener('appinstalled', () => {
    installed.value = true
    installEvent.value = null
  })

  // After a deploy the old hashed chunks are gone from the server, so an
  // old page opening a not-yet-loaded route fails to import it. Reload once
  // to get the new version instead of showing a broken screen.
  window.addEventListener('vite:preloadError', (e) => {
    const KEY = 'daynest:chunk-reload'
    let last = 0
    try { last = Number(sessionStorage.getItem(KEY)) || 0 } catch {}
    if (Date.now() - last < 10_000) return // already tried: avoid a reload loop
    e.preventDefault()
    try { sessionStorage.setItem(KEY, String(Date.now())) } catch {}
    window.location.reload()
  })

  // The service worker is production-only: in development it would cache
  // modules and fight with hot reloading.
  if (import.meta.env.PROD && swSupported()) void register()
}

async function register() {
  try {
    registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  } catch (e) {
    console.warn('[daynest] service worker registration failed', e)
    return
  }
  const watch = (worker) => {
    if (!worker) return
    worker.addEventListener('statechange', () => {
      // "installed" while another worker controls the page = an update.
      if (worker.state === 'installed' && navigator.serviceWorker.controller) onUpdateReady()
    })
  }
  if (registration.waiting && navigator.serviceWorker.controller) onUpdateReady()
  watch(registration.installing)
  registration.addEventListener('updatefound', () => watch(registration.installing))

  // Coming back to the app is treated like a fresh launch: phones rarely
  // close installed apps, so "resume" is the moment users expect the new
  // version. Leaving the app is tried too, but the OS often freezes the
  // page before that finishes, so resume is the reliable path.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      resumedAt = Date.now()
      if (updateReady.value) void autoApply()
    } else if (updateReady.value) void autoApply()
  })
  // bfcache restores (iOS standalone apps) don't always fire visibilitychange.
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return
    resumedAt = Date.now()
    check()
    if (updateReady.value) void autoApply()
  })

  // Reload only for an update the user accepted — not when the very first
  // worker claims the page on a first visit.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!updateRequested || reloading) return
    reloading = true
    window.location.reload()
  })

  // Look for new versions when the app comes back into view, and hourly.
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
  setInterval(check, 60 * 60 * 1000)
}

const check = () => registration?.update().catch(() => {})

/**
 * Installed apps on phones are rarely fully closed, so a waiting update
 * would otherwise never activate. Apply it automatically when it is safe:
 *  - shortly after the app was opened OR brought back to the foreground
 *    (the user hasn't started working yet; downloading the new version can
 *    take a while on mobile, hence the generous window), or
 *  - when the app goes to the background,
 * and only if nothing is being typed and every change is saved.
 * Otherwise the "new version is ready → Reload" toast stays as before.
 */
const RESUME_WINDOW_MS = 60_000
let resumedAt = Date.now()

function onUpdateReady() {
  updateReady.value = true
  if (Date.now() - resumedAt < RESUME_WINDOW_MS || document.visibilityState === 'hidden') void autoApply()
}

/** True only when the user is actually typing something (an autofocused empty field doesn't count). */
function isEditing() {
  const el = document.activeElement
  if (!el) return false
  if (el.isContentEditable) return (el.textContent ?? '').trim() !== ''
  const typing = el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(el.type))
  return typing && String(el.value ?? '') !== ''
}

async function autoApply() {
  if (updateRequested || isEditing()) return
  try {
    // Make sure every local change is written before the page reloads.
    const { persistence } = await import('@/services/persistence')
    await persistence.flush()
    if (persistence.unsavedCount() > 0 || isEditing()) return
  } catch {
    return // unsure whether everything is saved: leave it to the toast
  }
  applyUpdate()
}

/** Activates the waiting version; the page reloads on controllerchange. */
export function applyUpdate() {
  updateRequested = true
  const waiting = registration?.waiting
  if (waiting) waiting.postMessage({ type: 'SKIP_WAITING' })
  else window.location.reload()
}

export async function promptInstall() {
  const e = installEvent.value
  if (!e) return false
  await e.prompt()
  const { outcome } = await e.userChoice
  installEvent.value = null
  return outcome === 'accepted'
}

/**
 * Shows a system notification. Prefers the service worker (required on
 * Android, and lets a click focus the app). Returns false when not allowed
 * or not supported, so callers can fall back to an in-app toast.
 */
export async function showNotification(title, body, url = '/today') {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false
  const opts = { body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { url }, tag: `${title}|${body}` }
  try {
    const reg = registration ?? (swSupported() ? await navigator.serviceWorker.getRegistration() : undefined)
    if (reg) {
      await reg.showNotification(title, opts)
      return true
    }
    new Notification(title, opts)
    return true
  } catch {
    return false
  }
}
