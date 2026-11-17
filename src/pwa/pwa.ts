import { computed, ref, shallowRef } from 'vue'

/**
 * PWA runtime state shared across the app: service worker registration and
 * updates, the install prompt, and online/offline status. Module-level
 * singletons — `initPwa()` is called once from main.ts.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine)
export const updateReady = ref(false)
export const installed = ref(false)
const installEvent = shallowRef<BeforeInstallPromptEvent | null>(null)
let registration: ServiceWorkerRegistration | null = null
let reloading = false
let updateRequested = false

export const canInstall = computed(() => !!installEvent.value && !installed.value)

export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)

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
    installEvent.value = e as BeforeInstallPromptEvent
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
  const watch = (worker: ServiceWorker | null) => {
    if (!worker) return
    worker.addEventListener('statechange', () => {
      // "installed" while another worker controls the page = an update.
      if (worker.state === 'installed' && navigator.serviceWorker.controller) updateReady.value = true
    })
  }
  if (registration.waiting && navigator.serviceWorker.controller) updateReady.value = true
  watch(registration.installing)
  registration.addEventListener('updatefound', () => watch(registration!.installing))

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

/** Activates the waiting version; the page reloads on controllerchange. */
export function applyUpdate() {
  updateRequested = true
  const waiting = registration?.waiting
  if (waiting) waiting.postMessage({ type: 'SKIP_WAITING' })
  else window.location.reload()
}

export async function promptInstall(): Promise<boolean> {
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
export async function showNotification(title: string, body: string, url = '/today'): Promise<boolean> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false
  const opts: NotificationOptions = { body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { url }, tag: `${title}|${body}` }
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
