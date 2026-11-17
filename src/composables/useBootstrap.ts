import { ref } from 'vue'
import { persistence } from '@/services/persistence'
import { useTaskStore } from '@/stores/tasks'
import { useCollectionsStore } from '@/stores/collections'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import { useToast } from './useToast'

const status = ref<'loading' | 'ready' | 'error'>('loading')
const error = ref<string | null>(null)
let listening = false

/** Loads everything from IndexedDB once and hydrates the stores. */
export function useBootstrap() {
  async function load() {
    status.value = 'loading'
    error.value = null
    const toast = useToast()
    let lastErrorToast = 0
    persistence.setErrorHandler((e) => {
      console.error(e)
      // Changes are kept and retried; tell the user once, not on every retry.
      if (Date.now() - lastErrorToast > 60_000) {
        lastErrorToast = Date.now()
        toast.error('Couldn’t save your latest change. Daynest will keep retrying.')
      }
    })
    if (!listening) {
      listening = true
      // Another window/tab of Daynest saved something: refresh just that.
      persistence.onRemoteChange((c) => {
        useTaskStore().applyExternal(c.tasks, c.deletedTasks)
        if (c.calendars || c.lists) {
          const col = useCollectionsStore()
          col.hydrate(c.calendars ?? col.calendars, c.lists ?? col.lists)
        }
        if (c.settings) useSettingsStore().hydrate(c.settings)
      })
      // This window's write met newer data and was merged instead of overwriting it.
      persistence.onConflict(({ tasks, deleted, messages }) => {
        useTaskStore().applyExternal(tasks, deleted)
        toast.show(messages[0], { timeout: 7000 })
      })
    }
    try {
      const t0 = performance.now()
      const snap = await persistence.loadAll()
      const settings = useSettingsStore()
      const collections = useCollectionsStore()
      settings.hydrate(snap.settings)
      if (!snap.calendars.length) collections.seedDefaults()
      else collections.hydrate(snap.calendars, snap.lists)
      useTaskStore().hydrate(snap.tasks)
      useUiStore().calendarView = settings.settings.calendarView
      if (import.meta.env.DEV) console.info(`[daynest] loaded ${snap.tasks.length} tasks in ${(performance.now() - t0).toFixed(1)}ms`)
      status.value = 'ready'
    } catch (e) {
      console.error(e)
      error.value = e instanceof Error ? e.message : String(e)
      status.value = 'error'
    }
  }
  return { status, error, load }
}
