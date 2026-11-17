import { ref } from 'vue'
import { persistence } from '@/services/persistence'
import { closeDb, getAll, LOCAL_DB_NAME, useDatabase } from '@/services/db'
import { migrateLegacyLocalData } from '@/services/legacyImport'
import { cloudEnabled } from '@/services/supabase'
import { SyncEngine, hasSyncedBefore, syncStatus } from '@/services/sync'
import { useTaskStore } from '@/stores/tasks'
import { useCollectionsStore } from '@/stores/collections'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import { useToast } from './useToast'

const status = ref('idle')
const error = ref(null)
let listening = false
let engine = null
let loadedFor = null
let unloading = null
let generation = 0

/** The active sync engine (cloud mode, signed in), if any. */
export const currentSync = () => engine

/**
 * Loads a workspace into the stores.
 *  - Local-only mode: this browser's database ("daynest-local").
 *  - Cloud mode: the signed-in user's own local cache ("daynest-user-<id>"),
 *    then starts syncing with Supabase. The first sign-in on a device waits
 *    for the account's data; later ones open instantly from the cache.
 */
export function useBootstrap() {
  const toast = useToast()

  function listen() {
    if (listening) return
    listening = true
    let lastErrorToast = 0
    persistence.setErrorHandler((e) => {
      console.error(e)
      // Changes are kept and retried; tell the user once, not on every retry.
      if (Date.now() - lastErrorToast > 60_000) {
        lastErrorToast = Date.now()
        toast.error('Couldn’t save your latest change. Daynest will keep retrying.')
      }
    })
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

  function hydrate(snap, seedIfEmpty) {
    const settings = useSettingsStore()
    const collections = useCollectionsStore()
    settings.hydrate(snap.settings)
    if (!snap.calendars.length && seedIfEmpty) collections.seedDefaults()
    else collections.hydrate(snap.calendars, snap.lists)
    useTaskStore().hydrate(snap.tasks)
    useUiStore().calendarView = settings.settings.calendarView
  }

  /**
   * Opens a workspace. Each call gets a generation number; if unload() or a
   * newer load() runs meanwhile, this one stops quietly instead of finishing
   * with stale data.
   */
  async function load(userId = null) {
    const gen = ++generation
    const current = () => gen === generation
    status.value = 'loading'
    error.value = null
    listen()
    try {
      // A retry or a user switch: never leave an old engine running.
      await stopEngine()
      if (!current()) return
      const t0 = performance.now()
      if (!cloudEnabled || !userId) {
        await useDatabase(LOCAL_DB_NAME)
        await migrateLegacyLocalData()
        const snap = await persistence.loadAll()
        if (!current()) return
        hydrate(snap, true)
        loadedFor = null
      } else {
        await useDatabase(`daynest-user-${userId}`)
        const sync = new SyncEngine(userId, {
          applyTasks: (tasks, deleted) => useTaskStore().applyExternal(tasks, deleted),
          reloadCollections: async () => {
            const [cals, lists] = await Promise.all([getAll('calendars'), getAll('lists')])
            if (current()) useCollectionsStore().hydrate(cals, lists)
          },
          applySettings: (s) => current() && useSettingsStore().hydrate(s),
          notify: (m) => toast.show(m, { timeout: 7000 }),
        })
        engine = sync
        if (await hasSyncedBefore()) {
          // Open instantly from this device's cache; sync in the background.
          const snap = await persistence.loadAll()
          if (!current()) return
          hydrate(snap, false)
          sync.start().catch(() => {}) // status shows in the sync indicator
        } else {
          if (!navigator.onLine) throw new Error('Connect to the internet to load your account on this device for the first time')
          await sync.start()
          const snap = await persistence.loadAll()
          if (!current()) return
          hydrate(snap, false)
        }
        loadedFor = userId
      }
      if (import.meta.env.DEV) console.info(`[daynest] workspace ready in ${(performance.now() - t0).toFixed(1)}ms`)
      status.value = 'ready'
    } catch (e) {
      if (!current()) return
      console.error(e)
      await stopEngine()
      error.value = e instanceof Error ? e.message : String(e)
      status.value = 'error'
    }
  }

  async function stopEngine() {
    const e = engine
    engine = null
    await e?.stop()
  }

  /**
   * Clears everything user-specific from memory (sign-out / user switch) so a
   * previous user's data can never appear for the next one.
   */
  function unload() {
    // Sign-out can trigger this from two places at once; run it once.
    unloading ??= doUnload().finally(() => (unloading = null))
    return unloading
  }

  async function doUnload() {
    generation++ // any load() still running gives up
    await persistence.flush()
    await stopEngine()
    persistence.reset() // nothing queued may land in the next user's database
    useTaskStore().hydrate([])
    useCollectionsStore().hydrate([], [])
    useSettingsStore().hydrate(undefined)
    const ui = useUiStore()
    ui.closeTask()
    ui.closeQuickAdd()
    ui.settingsOpen = false
    syncStatus.value = { state: 'idle', pending: 0, lastSyncedAt: null, error: null }
    await closeDb()
    loadedFor = null
    status.value = 'idle'
  }

  return { status, error, load, unload, loadedFor: () => loadedFor }
}
