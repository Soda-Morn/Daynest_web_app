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

  // Leaving the app (switching apps, locking the phone) is a safe moment to
  // update: the user comes back to the new version without noticing.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && updateReady.value) void autoApply()
  })

  // Reload only for an update the user accepted — not when the very first
  // worker claims the page on a first visit.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!updateRequested || reloading) return
    reloading = true
    window.location.reload()
  })

  // Look for new versions when the app comes back into view, and hourly.
  const check = () => registration?.update().catch(() => {})
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
  setInterval(check, 60 * 60 * 1000)
}

/**
 * Installed apps on phones are rarely fully closed, so a waiting update
 * would otherwise never activate. Apply it automatically when it is safe:
 *  - just after the app opened (the user hasn't started working yet), or
 *  - when the app goes to the background,
 * and only if nothing is being typed and every change is saved.
 * Otherwise the "new version is ready → Reload" toast stays as before.
 */
const STARTUP_WINDOW_MS = 15_000
const startedAt = Date.now()

function onUpdateReady() {
  updateReady.value = true
  if (Date.now() - startedAt < STARTUP_WINDOW_MS || document.visibilityState === 'hidden') void autoApply()
}

function isEditing() {
  const el = document.activeElement
  return !!el && (el.tagName === 'TEXTAREA' || el.isContentEditable || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes(el.type)))
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
