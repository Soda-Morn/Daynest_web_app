import { shallowRef } from 'vue'
import { currentDatabase, getAll, getMany, getOne, writeBatch } from './db'
import { mergeTask } from '@/utils/merge'
import { uid } from '@/utils/validation'

/**
 * Persistence: the only module that talks to storage.
 *
 *  - Write-behind queue: the UI updates in memory first (optimistic) and
 *    hands changes here. Writes in the same tick are coalesced per record and
 *    flushed in one IndexedDB transaction.
 *  - Failed writes are kept and retried with backoff; nothing is dropped.
 *  - Concurrency: tasks carry a `rev`. A write that started from an older rev
 *    than what is stored (another window saved meanwhile) is 3-way merged
 *    instead of overwriting newer data.
 *  - Cross-window sync: after each commit, other tabs and the installed app
 *    are told which records changed (BroadcastChannel) and reload just those.
 *
 * Swapping in a remote API later only touches this file.
 */

/** Reactive save status for the UI. */
export const saveStatus = shallowRef({ state: 'saved', pending: 0, retryAt: null })

const TAB_ID = uid()

/* ---------------- Cloud outbox hook ---------------- */

/** Data stores whose changes are synced to the server. */
const SYNCED = ['tasks', 'calendars', 'lists', 'settings']

let outboxEnabled = false
let onOutboxAppended = (_keys) => {}

/**
 * Turns on cloud sync bookkeeping: every committed local change also appends
 * an outbox entry in the *same* IndexedDB transaction, so a change can never
 * be saved locally but forgotten by sync (even if the tab closes).
 */
export function enableOutbox(enabled, onAppended = () => {}) {
  outboxEnabled = enabled
  onOutboxAppended = onAppended
}

function outboxOps(ops) {
  if (!outboxEnabled) return []
  const out = []
  for (const op of ops) {
    if (op.type === 'clear' || !SYNCED.includes(op.store)) continue
    const entry = {
      key: `${op.store}:${String(op.key)}`,
      store: op.store,
      id: String(op.key),
      base: op.check?.base ?? null,
      at: Date.now(),
    }
    out.push({ store: 'outbox', type: 'put', value: entry })
  }
  return out
}
const FLUSH_DELAY = 40
const MAX_BACKOFF = 30_000

const opId = (op) => `${op.store}:${op.type === 'clear' ? '*' : String(op.key)}`

class WriteQueue {
  pending = new Map()
  /** Ids of ops handed to a flush that has not committed yet. */
  inflight = new Map()
  timer = null
  retryTimer = null
  failures = 0
  /** Bumped by reset(): flushes queued before it are dropped. */
  generation = 0
  flushing = Promise.resolve()
  onError = (e) => console.error(e)
  onCommitted = () => {}

  enqueue(op) {
    const id = opId(op)
    if (op.type === 'clear') {
      // A clear supersedes everything queued for that store.
      for (const k of [...this.pending.keys()]) if (k.startsWith(op.store + ':')) this.pending.delete(k)
    }
    const prev = this.pending.get(id)
    // Coalescing keeps the *oldest* base so the conflict check still compares
    // against what this window started from.
    if (prev?.check && op.check) op.check = { ...op.check, baseRev: prev.check.baseRev, base: prev.check.base }
    this.pending.delete(id) // re-insert to keep chronological order
    this.pending.set(id, op)
    this.status()
    if (!this.timer && !this.retryTimer) this.timer = setTimeout(() => void this.flush(), FLUSH_DELAY)
  }

  get size() {
    return this.pending.size + this.inflight.size
  }

  /** Is a local change to this record still waiting to be written? */
  isUnsaved(id) {
    return this.pending.has(id) || this.inflight.has(id)
  }

  flush() {
    if (this.timer) clearTimeout(this.timer)
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.timer = this.retryTimer = null
    const ops = [...this.pending.values()]
    this.pending.clear()
    if (!ops.length) {
      this.status()
      return this.flushing
    }
    const ids = ops.map(opId)
    ids.forEach((id) => this.inflight.set(id, (this.inflight.get(id) ?? 0) + 1))
    saveStatus.value = { state: 'saving', pending: ops.length, retryAt: null }
    const generation = this.generation
    this.flushing = this.flushing.then(async () => {
      if (generation !== this.generation) return // dropped by reset()
      try {
        const extra = outboxOps(ops)
        const notes = await writeBatch(extra.length ? [...ops, ...extra] : ops)
        this.failures = 0
        this.onCommitted({ ops, notes })
        if (extra.length) onOutboxAppended(extra.map((e) => e.value.key))
      } catch (e) {
        if (generation === this.generation) this.requeue(ops)
        this.onError(e)
      } finally {
        if (generation === this.generation) {
          for (const id of ids) {
            const n = (this.inflight.get(id) ?? 1) - 1
            if (n > 0) this.inflight.set(id, n)
            else this.inflight.delete(id)
          }
        }
        this.status()
      }
    })
    return this.flushing
  }

  /**
   * Puts failed ops back *before* anything queued since (they are older),
   * unless a newer change to the same record, or a newer clear of its store,
   * arrived meanwhile. Then retries with backoff.
   */
  requeue(ops) {
    const merged = new Map()
    for (const op of ops) {
      const id = opId(op)
      if (this.pending.has(id) || this.pending.has(`${op.store}:*`)) continue
      merged.set(id, op)
    }
    for (const [id, op] of this.pending) merged.set(id, op)
    this.pending = merged
    this.failures++
    const delay = Math.min(MAX_BACKOFF, 1000 * 2 ** (this.failures - 1))
    this.retryTimer = setTimeout(() => void this.flush(), delay)
    saveStatus.value = { state: 'error', pending: this.pending.size, retryAt: Date.now() + delay }
  }

  /**
   * Writes records that came from the server straight to the local cache
   * (no outbox entry: they must not be pushed back). Serialised with normal
   * flushes so writes never interleave. Records with a local change still
   * waiting to be written are skipped, and `alive()` is checked right before
   * the write so a stopped sync engine can never write into another database.
   * Resolves to the set of skipped "store:id" keys.
   */
  writeDirect(ops, alive = () => true) {
    const run = this.flushing.then(async () => {
      const skipped = new Set()
      const todo = []
      for (const op of ops) {
        if (this.isUnsaved(opId(op))) skipped.add(op.remote?.outboxKey ?? opId(op))
        else todo.push(op)
      }
      if (!todo.length || !alive()) return skipped
      const notes = await writeBatch(todo)
      for (const n of notes) if (n.skipped) skipped.add(n.skipped)
      const written = todo.filter((op) => !skipped.has(op.remote?.outboxKey ?? opId(op)))
      this.onCommitted({ ops: written, notes: [] })
      return skipped
    })
    this.flushing = run.catch((e) => this.onError(e))
    return run
  }

  /** Forgets everything queued (the workspace is being closed). */
  reset() {
    if (this.timer) clearTimeout(this.timer)
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.timer = this.retryTimer = null
    this.pending.clear()
    this.inflight.clear()
    this.failures = 0
    this.generation++
    this.status()
  }

  status() {
    if (this.retryTimer) return // stay in "error" until a retry succeeds
    saveStatus.value = { state: this.size ? 'saving' : 'saved', pending: this.size, retryAt: null }
  }
}

export const queue = new WriteQueue()

/* ---------------- Cross-window channel ---------------- */

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('daynest-sync') : null
const remoteListeners = new Set()
const conflictListeners = new Set()

queue.onCommitted = ({ ops, notes }) => {
  const msg = {
    type: 'changed',
    from: TAB_ID,
    db: currentDatabase(),
    tasks: [],
    deletedTasks: [],
    calendars: false,
    lists: false,
    settings: false,
  }
  for (const op of ops) {
    if (op.store === 'outbox' || op.store === 'meta') continue
    if (op.store === 'tasks') {
      if (op.type === 'put') msg.tasks.push(String(op.key))
      else if (op.type === 'delete') msg.deletedTasks.push(String(op.key))
      else msg.calendars = msg.lists = true // clear (import): others reload everything
    } else msg[op.store] = true
  }
  for (const n of notes) {
    // A delete that was refused keeps the record: tell others it still exists.
    if (n.result) {
      msg.deletedTasks = msg.deletedTasks.filter((id) => id !== String(n.key))
      if (!msg.tasks.includes(String(n.key))) msg.tasks.push(String(n.key))
    }
  }
  channel?.postMessage(msg)
  if (notes.length) {
    const tasks = notes.filter((n) => n.result).map((n) => n.result)
    const deleted = notes.filter((n) => !n.result).map((n) => String(n.key))
    conflictListeners.forEach((fn) => fn({ tasks, deleted, messages: notes.map((n) => n.message) }))
  }
}

if (channel) {
  channel.onmessage = async (e) => {
    const m = e.data
    // Ignore other tabs' changes for a different signed-in user.
    if (!m || m.type !== 'changed' || m.from === TAB_ID || m.db !== currentDatabase()) return
    try {
      const change = {
        tasks: await getMany('tasks', m.tasks),
        deletedTasks: m.deletedTasks,
      }
      if (m.calendars) change.calendars = await getAll('calendars')
      if (m.lists) change.lists = await getAll('lists')
      if (m.settings) change.settings = await getOne('settings', 'app')
      // Records deleted by the other window are absent from getMany.
      const found = new Set(change.tasks.map((t) => t.id))
      for (const id of m.tasks) if (!found.has(id)) change.deletedTasks.push(id)
      remoteListeners.forEach((fn) => fn(change))
    } catch (err) {
      console.warn('[daynest] could not apply change from another window', err)
    }
  }
}

if (typeof window !== 'undefined') {
  // Don't lose the last edit when the tab is hidden or closed.
  window.addEventListener('pagehide', () => void queue.flush())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void queue.flush()
  })
}

/* ---------------- Task writes with conflict resolution ---------------- */

function taskPut(task, base) {
  queue.enqueue({
    store: 'tasks',
    type: 'put',
    key: task.id,
    value: task,
    check: {
      baseRev: base?.rev ?? 0,
      base,
      resolve: (stored, oldestBase) => {
        const theirs = stored
        const { task: merged, conflicts } = mergeTask(oldestBase, task, theirs)
        merged.rev = (theirs.rev ?? 0) + 1
        return {
          write: merged,
          note: {
            key: task.id,
            result: merged,
            message: conflicts.length
              ? `"${merged.title}" was also changed in another window. Kept the latest edit for: ${conflicts.join(', ')}.`
              : `"${merged.title}" was also changed in another window. Both changes were kept.`,
          },
        }
      },
    },
  })
}

function taskDelete(id, base) {
  queue.enqueue({
    store: 'tasks',
    type: 'delete',
    key: id,
    check: {
      baseRev: base?.rev ?? 0,
      base,
      // Edited elsewhere after this window last saw it: keep the newer version.
      resolve: (stored) => ({
        write: null,
        note: { key: id, result: stored, message: `"${stored.title}" was edited in another window, so it was not deleted.` },
      }),
    },
  })
}

const put = (store, value) => queue.enqueue({ store, type: 'put', key: value.id, value })
const del = (store, key) => queue.enqueue({ store, type: 'delete', key })

export const persistence = {
  async loadAll() {
    const [tasks, calendars, lists, settings] = await Promise.all([
      getAll('tasks'),
      getAll('calendars'),
      getAll('lists'),
      getOne('settings', 'app'),
    ])
    return { tasks, calendars, lists, settings }
  },

  /** `base` = the version this window had before the change (undefined for new tasks). */
  saveTask: (t, base) => taskPut(t, base),
  deleteTask: (id, base) => taskDelete(id, base),
  saveCalendar: (c) => put('calendars', c),
  deleteCalendar: (id) => del('calendars', id),
  saveList: (l) => put('lists', l),
  deleteList: (id) => del('lists', id),
  saveSettings: (s) => queue.enqueue({ store: 'settings', type: 'put', key: 'app', value: { ...s } }),

  /** Replaces all data (used by import). Unchecked: the user chose to overwrite. */
  replaceAll(snap) {
    for (const store of ['tasks', 'calendars', 'lists']) queue.enqueue({ store, type: 'clear' })
    snap.tasks.forEach((t) => put('tasks', t))
    snap.calendars.forEach((c) => put('calendars', c))
    snap.lists.forEach((l) => put('lists', l))
  },

  flush: () => queue.flush(),

  /**
   * Saves server records into the local cache without creating outbox
   * entries. Records with unpushed local changes are left alone (see
   * `writeRemote` in db.js). Options:
   *  - afterSeq: outbox entries up to this seq belong to the push in progress
   *    and do not count as newer local changes;
   *  - checkRev: also keep a local task whose rev is higher;
   *  - alive: checked right before writing (a stopped engine writes nothing).
   * Resolves to the set of skipped "store:id" keys.
   */
  cacheRemote(c, { afterSeq = 0, checkRev = true, alive } = {}) {
    const ops = []
    const add = (store, type, key, value) =>
      ops.push({ store, type, key, value, remote: { outboxKey: `${store}:${key}`, afterSeq, checkRev: checkRev && store === 'tasks' } })
    c.tasks?.forEach((t) => add('tasks', 'put', t.id, t))
    c.deletedTasks?.forEach((id) => add('tasks', 'delete', id))
    c.calendars?.forEach((x) => add('calendars', 'put', x.id, x))
    c.deletedCalendars?.forEach((id) => add('calendars', 'delete', id))
    c.lists?.forEach((x) => add('lists', 'put', x.id, x))
    c.deletedLists?.forEach((id) => add('lists', 'delete', id))
    if (c.settings) add('settings', 'put', 'app', { ...c.settings })
    return queue.writeDirect(ops, alive)
  },
  /** Drops queued writes. Call only after flush(), when closing a workspace. */
  reset: () => queue.reset(),
  /** Local changes not yet written to this device's database. */
  unsavedCount: () => queue.size,
  setErrorHandler(fn) {
    queue.onError = fn
  },
  /** Changes saved by another window/tab of Daynest on this device. */
  onRemoteChange(fn) {
    remoteListeners.add(fn)
    return () => remoteListeners.delete(fn)
  },
  /** This window's write met newer data; `tasks` is what was actually stored. */
  onConflict(fn) {
    conflictListeners.add(fn)
    return () => conflictListeners.delete(fn)
  },
}
