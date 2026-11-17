import { shallowRef } from 'vue'
import { deleteMany, getAll, getOne, openDb, requestToPromise, txDone } from './db'
import { enableOutbox, persistence } from './persistence'
import { sb } from './supabase'
import {
  CATEGORY_COLUMNS,
  LIST_COLUMNS,
  SETTINGS_COLUMNS,
  TASK_COLUMNS,
  calendarToRow,
  listToRow,
  rowToCalendar,
  rowToList,
  rowToSettings,
  rowToTask,
  settingsToRow,
  taskToRow,
} from './mappers'
import { mergeTask } from '@/utils/merge'

/**
 * Cloud sync for one signed-in user.
 *
 * Local-first: the UI always reads/writes the local IndexedDB cache, so the
 * app is instant and works offline. This engine keeps that cache and the
 * server in step:
 *
 *  - PULL   first time: every live row (paged); afterwards only rows whose
 *           updated_at moved past the last cursor (includes soft deletes).
 *  - PUSH   drains the persistent outbox in dependency order (calendars and
 *           lists before tasks). Tasks use optimistic concurrency on `rev`:
 *           an update only applies if the server still has the version this
 *           device started from; otherwise the 3-way merge combines both
 *           edits instead of overwriting newer data. Client-generated ids make
 *           retries idempotent — a lost response can never create duplicates.
 *  - REALTIME  postgres_changes for this user's rows only (RLS also applies).
 *
 * Only one tab pushes at a time (Web Locks); all tabs receive realtime.
 */
export const syncStatus = shallowRef({ state: 'idle', pending: 0, lastSyncedAt: null, error: null })

const PUSH_ORDER = ['settings', 'calendars', 'lists', 'tasks']
const PAGE = 1000
const MAX_BACKOFF = 60_000
/** Pulls re-read this far behind the cursor: rows whose transaction committed late still get seen. */
const CURSOR_OVERLAP_MS = 2 * 60_000
/** Cursor stored when the first sync found nothing, so later pulls include deletions. */
const EPOCH = '1970-01-01T00:00:00Z'
/** stop() waits at most this long for in-flight work. */
const STOP_WAIT_MS = 5000

class PermanentError extends Error {}
/** Thrown inside work that was still running when the engine stopped. */
class StoppedError extends Error {}

function isNetworkError(e) {
  const msg = e?.message ?? ''
  return !navigator.onLine || /Failed to fetch|NetworkError|network|timeout|fetch failed/i.test(msg)
}

export class SyncEngine {
  channel = null
  pushTimer = null
  failures = 0
  stopped = false
  pushing = false
  pulling = null
  pullAgain = false
  pullTimer = null
  /** Highest outbox seq of the record being pushed right now. */
  pushSeq = 0
  failedKeys = new Map()
  cleanup = []
  inflight = new Set()

  constructor(userId, handlers) {
    this.userId = userId
    this.handlers = handlers
  }

  /* ------------------------------------------------------------------ */
  /* Lifecycle                                                           */
  /* ------------------------------------------------------------------ */

  /** First sync. Resolves once the account's data is in the local cache. */
  async start() {
    this.stopped = false
    enableOutbox(true, (keys) => {
      // A new edit gives a record that failed before another chance.
      keys.forEach((k) => this.failedKeys.delete(k))
      this.schedulePush()
    })
    const onOnline = () => void this.pullQuietly(0)
    const onOffline = () => this.setStatus({ state: 'offline' })
    const onVisible = () => document.visibilityState === 'visible' && this.pullQuietly(0)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    document.addEventListener('visibilitychange', onVisible)
    this.cleanup.push(
      () => window.removeEventListener('online', onOnline),
      () => window.removeEventListener('offline', onOffline),
      () => document.removeEventListener('visibilitychange', onVisible),
    )
    try {
      await this.refreshPendingCount()
      if (navigator.onLine) {
        await this.pull()
        this.schedulePush(0)
      } else this.setStatus({ state: 'offline' })
    } finally {
      // Even if the first pull failed, listen for changes (a reconnect pulls again).
      if (!this.stopped) this.subscribe()
    }
  }

  /** Stops syncing and waits (briefly) for work already running to finish. */
  async stop() {
    if (this.stopped) return
    this.stopped = true
    enableOutbox(false)
    clearTimeout(this.pushTimer)
    clearTimeout(this.pullTimer)
    this.cleanup.forEach((fn) => fn())
    this.cleanup = []
    const channel = this.channel
    this.channel = null
    const idle = Promise.allSettled([...this.inflight])
    await Promise.race([idle, new Promise((r) => setTimeout(r, STOP_WAIT_MS))])
    if (channel) await sb().removeChannel(channel).catch(() => {})
  }

  /** Runs async work that stop() can wait for. */
  track(promise) {
    this.inflight.add(promise)
    promise.finally(() => this.inflight.delete(promise)).catch(() => {})
    return promise
  }

  /** Call after every await that precedes a local write. */
  alive() {
    if (this.stopped) throw new StoppedError('Sync stopped')
  }

  /** Saves server data locally; skipped while stopped or when local edits are newer. */
  cache(change, opts) {
    this.alive()
    return persistence.cacheRemote(change, { ...opts, alive: () => !this.stopped })
  }

  /** Number of local changes not yet on the server. */
  async pendingCount() {
    const entries = await getAll('outbox')
    return new Set(entries.map((e) => e.key)).size
  }

  setStatus(patch) {
    syncStatus.value = { ...syncStatus.value, ...patch }
  }

  async refreshPendingCount() {
    const pending = await this.pendingCount()
    this.setStatus({ pending })
    return pending
  }

  /* ------------------------------------------------------------------ */
  /* Pull                                                                */
  /* ------------------------------------------------------------------ */

  /** Pulls server changes. Concurrent calls share one run (plus one follow-up). */
  pull() {
    if (this.stopped || !navigator.onLine) return Promise.resolve()
    if (this.pulling) {
      this.pullAgain = true
      return this.pulling
    }
    this.pulling = this.track(this.pullOnce()).finally(() => {
      this.pulling = null
      if (this.pullAgain && !this.stopped) {
        this.pullAgain = false
        this.pullQuietly(0)
      }
    })
    return this.pulling
  }

  async pullOnce() {
    this.setStatus({ state: 'syncing' })
    try {
      await this.pullTable('categories', CATEGORY_COLUMNS, async (rows) => {
        await this.cache({
          calendars: rows.filter((r) => !r.deleted_at).map(rowToCalendar),
          deletedCalendars: rows.filter((r) => r.deleted_at).map((r) => r.id),
        })
      })
      await this.pullTable('lists', LIST_COLUMNS, async (rows) => {
        await this.cache({
          lists: rows.filter((r) => !r.deleted_at).map(rowToList),
          deletedLists: rows.filter((r) => r.deleted_at).map((r) => r.id),
        })
      })
      this.alive()
      await this.handlers.reloadCollections()
      await this.pullTable('tasks', TASK_COLUMNS, async (rows) => {
        const live = rows.filter((r) => !r.deleted_at).map(rowToTask)
        const gone = rows.filter((r) => r.deleted_at).map((r) => r.id)
        const skipped = await this.cache({ tasks: live, deletedTasks: gone })
        this.alive()
        const kept = (id) => !skipped.has(`tasks:${id}`)
        this.handlers.applyTasks(
          live.filter((t) => kept(t.id)),
          gone.filter(kept),
        )
      })
      await this.pullSettings()
      this.setStatus({ state: 'idle', lastSyncedAt: Date.now(), error: this.failedKeys.size ? syncStatus.value.error : null })
    } catch (e) {
      if (e instanceof StoppedError) return
      this.setStatus(isNetworkError(e) ? { state: 'offline' } : { state: 'error', error: e.message })
      throw e
    }
  }

  /**
   * Pages through a table in (updated_at, id) order using keyset paging, so a
   * row that changes mid-pull can't shift others out of view. The first sync
   * skips deleted rows; later syncs start a little before the stored cursor
   * (late commits) and include tombstones. Re-applying a row is harmless.
   */
  async pullTable(table, columns, apply) {
    const cursorKey = `cursor:${table}`
    const cursor = await this.getMeta(cursorKey)
    const since = cursor ? new Date(Date.parse(cursor) - CURSOR_OVERLAP_MS).toISOString() : null
    let newest = cursor
    let after = null
    for (;;) {
      let q = sb()
        .from(table)
        .select(columns)
        .order('updated_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(PAGE)
      if (!cursor) q = q.is('deleted_at', null)
      if (after) q = q.or(`updated_at.gt."${after.t}",and(updated_at.eq."${after.t}",id.gt.${after.id})`)
      else if (since) q = q.gte('updated_at', since)
      const { data, error } = await q
      if (error) throw error
      this.alive()
      const rows = data ?? []
      if (rows.length) {
        await apply(rows)
        const last = rows[rows.length - 1]
        after = { t: last.updated_at, id: last.id }
        if (!newest || last.updated_at > newest) newest = last.updated_at
      }
      if (rows.length < PAGE) break
    }
    // Nothing yet: still record that this device has synced, so later pulls include deletions.
    await this.setMeta(cursorKey, newest ?? EPOCH)
  }

  async pullSettings() {
    const [{ data: s, error: e1 }, { data: p, error: e2 }] = await Promise.all([
      sb().from('user_settings').select(SETTINGS_COLUMNS).maybeSingle(),
      sb().from('profiles').select('full_name').maybeSingle(),
    ])
    if (e1) throw e1
    if (e2) throw e2
    if (!s) return
    const settings = rowToSettings(s, p?.full_name ?? null)
    const skipped = await this.cache({ settings })
    this.alive()
    if (!skipped.has('settings:app')) this.handlers.applySettings(settings)
  }

  /* ------------------------------------------------------------------ */
  /* Push                                                                */
  /* ------------------------------------------------------------------ */

  schedulePush(delay = 400) {
    if (this.stopped) return
    if (this.pushTimer) clearTimeout(this.pushTimer)
    this.pushTimer = setTimeout(() => void this.push(), delay) // push() never rejects
  }

  push() {
    return this.track(this.pushNow())
  }

  async pushNow() {
    if (this.stopped || this.pushing) return
    if (!navigator.onLine) {
      this.setStatus({ state: 'offline' })
      return
    }
    this.pushing = true
    try {
      // One pusher per user across tabs; others simply skip.
      if (navigator.locks)
        await navigator.locks.request(`daynest-push-${this.userId}`, { ifAvailable: true }, async (lock) => lock && this.pushAll())
      else await this.pushAll()
      this.failures = 0
    } catch (e) {
      if (e instanceof StoppedError || this.stopped) return
      this.failures++
      const delay = Math.min(MAX_BACKOFF, 1000 * 2 ** (this.failures - 1))
      this.setStatus(isNetworkError(e) ? { state: 'offline' } : { state: 'error', error: e.message })
      this.schedulePush(delay)
    } finally {
      this.pushing = false
    }
  }

  async pushAll() {
    const entries = await getAll('outbox')
    if (!entries.length) {
      this.setStatus({ state: 'idle', pending: 0, lastSyncedAt: Date.now(), error: this.failedKeys.size ? syncStatus.value.error : null })
      return
    }
    this.setStatus({ state: 'syncing' })
    // Group by record: earliest base (what we started from), all seqs.
    const groups = new Map()
    for (const e of entries) {
      const g = groups.get(e.key)
      if (g) g.seqs.push(e.seq)
      else groups.set(e.key, { entry: e, seqs: [e.seq] })
    }
    const ordered = [...groups.values()].sort(
      (a, b) => PUSH_ORDER.indexOf(a.entry.store) - PUSH_ORDER.indexOf(b.entry.store) || a.seqs[0] - b.seqs[0],
    )
    for (const g of ordered) {
      this.alive()
      if (this.failedKeys.has(g.entry.key)) continue
      try {
        this.pushSeq = Math.max(...g.seqs)
        await this.pushOne(g.entry)
        this.alive()
        await deleteMany('outbox', g.seqs)
      } catch (e) {
        if (e instanceof StoppedError) throw e
        if (e instanceof PermanentError || (!isNetworkError(e) && e.code?.startsWith?.('23'))) {
          // Invalid for the server (e.g. duplicate calendar name). Keep it
          // locally, stop retrying it this session and tell the user.
          const msg = e.message
          this.failedKeys.set(g.entry.key, msg)
          this.setStatus({ state: 'error', error: msg })
          continue
        }
        throw e
      }
    }
    this.alive()
    const pending = await this.refreshPendingCount()
    this.setStatus({ state: this.failedKeys.size ? 'error' : 'idle', pending, lastSyncedAt: Date.now() })
    if (pending > this.failedKeys.size) this.schedulePush(0) // more arrived meanwhile
  }

  async pushOne(e) {
    switch (e.store) {
      case 'settings':
        return this.pushSettings()
      case 'calendars':
        return this.pushSimple('calendars', 'categories', e.id, (c) => calendarToRow(c))
      case 'lists':
        return this.pushSimple('lists', 'lists', e.id, (l) => listToRow(l))
      case 'tasks':
        return this.pushTask(e.id, e.base ?? null)
    }
  }

  async pushSettings() {
    const s = await getOne('settings', 'app')
    if (!s) return
    const { error } = await sb().from('user_settings').update(settingsToRow(s)).eq('user_id', this.userId)
    if (error) throw error
    const { error: e2 } = await sb()
      .from('profiles')
      .update({ full_name: s.userName.trim() || null })
      .eq('id', this.userId)
    if (e2) throw e2
  }

  /** Calendars and lists: last write wins (small, rarely edited concurrently). */
  async pushSimple(store, table, id, toRow) {
    const local = await getOne(store, id)
    if (local) {
      const { error } = await sb()
        .from(table)
        .upsert({ ...toRow(local), deleted_at: null }, { onConflict: 'id' })
      if (error) throw error
    } else {
      const { error } = await sb().from(table).update({ deleted_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
    }
  }

  async pushTask(id, base) {
    const local = await getOne('tasks', id)
    const baseRev = base?.rev ?? 0

    if (!local) {
      // Deleted on this device.
      if (!base) return // created and deleted before it ever synced
      const { data, error } = await sb()
        .from('tasks')
        .update({ deleted_at: new Date().toISOString(), rev: baseRev + 1 })
        .eq('id', id)
        .eq('rev', baseRev)
        .select('id')
      if (error) throw error
      if (data.length) return
      const server = await this.fetchTask(id)
      if (!server || server.deleted_at) return // already gone
      // Edited on another device after we last saw it: keep the newer version.
      const kept = rowToTask(server)
      await this.adopt(kept)
      this.handlers.notify(`“${kept.title}” was changed on another device, so it was kept.`)
      return
    }

    const row = taskToRow(local)
    if (!base) {
      const { error } = await sb().from('tasks').insert(row)
      if (!error) return
      if (error.code !== '23505') throw error // 23505: already saved (a retry) → reconcile
    } else {
      const { data, error } = await sb().from('tasks').update(row).eq('id', id).eq('rev', baseRev).select('id')
      if (error) throw error
      if (data.length) return
    }
    await this.reconcileTask(local, base)
  }

  /** The server moved on since this device's base: merge instead of overwriting. */
  async reconcileTask(local, base) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const server = await this.fetchTask(local.id)
      if (!server) {
        const { error } = await sb().from('tasks').insert(taskToRow(local))
        if (!error) return
        if (error.code !== '23505') throw error
        continue
      }
      const theirs = rowToTask(server)
      const resurrect = !!server.deleted_at // deleted elsewhere while edited here: keep the edit
      const { task: merged, conflicts } = resurrect ? { task: local, conflicts: [] } : mergeTask(base ?? undefined, local, theirs)
      const same =
        !resurrect &&
        JSON.stringify({ ...taskToRow(merged), rev: 0, updated_at: '' }) ===
          JSON.stringify({ ...taskToRow(theirs), rev: 0, updated_at: '' })
      if (same) {
        await this.adopt(theirs)
        return
      }
      // Revisions only move forward, on this device and on the server.
      merged.rev = Math.max(server.rev, local.rev ?? 0) + 1
      const { data, error } = await sb()
        .from('tasks')
        .update({ ...taskToRow(merged), deleted_at: null })
        .eq('id', local.id)
        .eq('rev', server.rev)
        .select(TASK_COLUMNS)
      if (error) throw error
      if (data.length) {
        await this.adopt(rowToTask(data[0]))
        if (!resurrect)
          this.handlers.notify(
            conflicts.length
              ? `“${merged.title}” was also changed on another device. Kept your latest edit for: ${conflicts.join(', ')}.`
              : `“${merged.title}” was also changed on another device. Both changes were kept.`,
          )
        return
      }
    }
    throw new Error('Could not resolve a conflicting edit; will retry.')
  }

  /**
   * Makes the server version the local truth, unless this record was edited
   * again after the entries being pushed (those edits get pushed next).
   */
  async adopt(t) {
    const skipped = await this.cache({ tasks: [t] }, { afterSeq: this.pushSeq, checkRev: false })
    this.alive()
    if (!skipped.has(`tasks:${t.id}`)) this.handlers.applyTasks([t], [])
  }

  async fetchTask(id) {
    const { data, error } = await sb().from('tasks').select(TASK_COLUMNS).eq('id', id).maybeSingle()
    if (error) throw error
    return data ?? null
  }

  /* ------------------------------------------------------------------ */
  /* Realtime                                                            */
  /* ------------------------------------------------------------------ */

  subscribe() {
    const uid = this.userId
    const filter = `user_id=eq.${uid}`
    this.channel = sb()
      .channel(`daynest:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter }, (p) => {
        this.track(this.onTaskChange(p.new, p.old)).catch((e) => e instanceof StoppedError || console.warn('[daynest] realtime update failed', e))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories', filter }, () => this.pullQuietly())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lists', filter }, () => this.pullQuietly())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_settings', filter }, () => this.pullQuietly())
      .subscribe((status) => {
        // After a reconnect, catch up on anything missed while disconnected.
        if (status === 'SUBSCRIBED') this.pullQuietly()
      })
  }

  /** Debounced pull whose errors only show in the sync status; pushes afterwards. */
  pullQuietly(delay = 250) {
    if (this.stopped) return
    clearTimeout(this.pullTimer)
    this.pullTimer = setTimeout(() => {
      this.pull()
        .then(() => this.schedulePush(0))
        .catch(() => {})
    }, delay)
  }

  async onTaskChange(row, old) {
    const id = row?.id ?? old?.id
    if (!id || this.stopped) return
    if (!row || !row.id || row.deleted_at) {
      const skipped = await this.cache({ deletedTasks: [id] })
      this.alive()
      if (!skipped.has(`tasks:${id}`)) this.handlers.applyTasks([], [id])
      return
    }
    const t = rowToTask(row)
    const local = await getOne('tasks', id)
    this.alive()
    // Echo of our own write: nothing to do. (Revisions, not timestamps: device
    // and server clocks can differ.) Older versions are skipped by cache().
    const strip = (x) => JSON.stringify({ ...taskToRow(x), rev: 0, updated_at: '', created_at: '' })
    if (local && (local.rev ?? 0) === row.rev && strip(local) === strip(t)) return
    const skipped = await this.cache({ tasks: [t] })
    this.alive()
    if (!skipped.has(`tasks:${id}`)) this.handlers.applyTasks([t], [])
  }

  /* ------------------------------------------------------------------ */
  /* Meta                                                                */
  /* ------------------------------------------------------------------ */

  async getMeta(key) {
    return getOne('meta', key)
  }

  async setMeta(key, value) {
    this.alive()
    const db = await openDb()
    const tx = db.transaction('meta', 'readwrite')
    const done = txDone(tx)
    tx.objectStore('meta').put(value, key)
    await done
  }
}

/** Has this device ever completed a sync for the current user? */
export async function hasSyncedBefore() {
  const db = await openDb()
  const v = await requestToPromise(db.transaction('meta', 'readonly').objectStore('meta').get('cursor:tasks'))
  const cal = await requestToPromise(db.transaction('calendars', 'readonly').objectStore('calendars').count())
  return !!v || cal > 0
}
