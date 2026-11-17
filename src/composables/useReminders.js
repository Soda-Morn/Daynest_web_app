import { watch } from 'vue'
import { useTaskStore } from '@/stores/tasks'
import { useUiStore } from '@/stores/ui'
import { useSettingsStore } from '@/stores/settings'
import { addDays, fromKey, timeToMinutes } from '@/utils/date'
import { isDone } from '@/utils/task'
import { showNotification } from '@/pwa/pwa'
import { useToast } from './useToast'

/**
 * Task reminders, checked on the shared 30s clock for yesterday–tomorrow
 * only (cheap). When the user has allowed notifications they are shown as
 * system notifications (through the service worker where available, which
 * Android requires); otherwise as an in-app toast.
 *
 * Honest limits: reminders fire while Daynest is open or kept alive in the
 * background by the OS. Guaranteed delivery with the app closed needs push
 * from a server, which Daynest (local-only) does not have.
 */
export function useReminders() {
  const store = useTaskStore()
  const ui = useUiStore()
  const settings = useSettingsStore()
  const toast = useToast()
  const fired = new Set()
  let lastCheck = Date.now()

  function check() {
    const now = ui.now.getTime()
    const from = lastCheck
    lastCheck = now
    if (!settings.settings.remindersEnabled) return
    for (const inst of store.instancesInRange(addDays(ui.today, -1), addDays(ui.today, 1))) {
      if (!inst.startTime || isDone(inst.status) || !inst.task.reminders.length) continue
      const start = fromKey(inst.startDate)
      start.setHours(0, timeToMinutes(inst.startTime), 0, 0)
      for (const mins of inst.task.reminders) {
        const at = start.getTime() - mins * 60_000
        const id = `${inst.key}:${mins}`
        if (at > from - 60_000 && at <= now && !fired.has(id)) {
          fired.add(id)
          void notify(inst.title, describe(mins))
        }
      }
    }
  }

  async function notify(title, body) {
    // In the foreground a toast is enough and less intrusive.
    const visible = document.visibilityState === 'visible'
    if (!visible && (await showNotification(title, body))) return
    toast.show(`${title} · ${body}`, { timeout: 8000 })
  }

  watch(() => ui.now, check)
}

function describe(mins) {
  if (mins === 0) return 'Starting now'
  if (mins % (24 * 60) === 0) return `Tomorrow at this time`
  if (mins >= 60) return `Starts in ${mins / 60} h`
  return `Starts in ${mins} min`
}

export function notificationSupport() {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

/** Only call from a user action (e.g. toggling the setting). */
export async function requestNotificationPermission() {
  if (typeof Notification === 'undefined') return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  return (await Notification.requestPermission()) === 'granted'
}
