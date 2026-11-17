import { shallowRef } from 'vue'
import type { CalendarCategory, Settings, Task, TaskList } from '@/types/models'
import { getAll, getMany, getOne, writeBatch, type ConflictNote, type StoreName, type WriteOp } from './db'
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

export interface Snapshot {
  tasks: Task[]
  calendars: CalendarCategory[]
  lists: TaskList[]
  settings: Partial<Settings> | undefined
}

export type SaveState = 'saved' | 'saving' | 'error'
export interface SaveStatus {
  state: SaveState
  pending: number
  /** Next automatic retry (ms timestamp) when state is "error". */
  retryAt: number | null
}

/** Reactive save status for the UI. */
export const saveStatus = shallowRef<SaveStatus>({ state: 'saved', pending: 0, retryAt: null })

interface ChangeMessage {
  type: 'changed'
  from: string
  tasks: string[]
  deletedTasks: string[]
  calendars: boolean
  lists: boolean
  settings: boolean
}

export interface RemoteChange {
  tasks: Task[]
  deletedTasks: string[]
  calendars?: CalendarCategory[]
  lists?: TaskList[]
  settings?: Partial<Settings>
}

type Listener<T> = (payload: T) => void

const TAB_ID = uid()
const FLUSH_DELAY = 40
const MAX_BACKOFF = 30_000

class WriteQueue {
  private pending = new Map<string, WriteOp>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private failures = 0
  private flushing: Promise<void> = Promise.resolve()
  onError: Listener<unknown> = (e) => console.error(e)
  onCommitted: Listener<{ ops: WriteOp[]; notes: ConflictNote[] }> = () => {}

  enqueue(op: WriteOp) {
    const id = `${op.store}:${op.type === 'clear' ? '*' : String(op.key)}`
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
    return this.pending.size
  }

  flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer)
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.timer = this.retryTimer = null
    const ops = [...this.pending.values()]
    this.pending.clear()
    if (!ops.length) {
      this.status()
      return this.flushing
    }
    saveStatus.value = { state: 'saving', pending: ops.length, retryAt: null }
    this.flushing = this.flushing.then(async () => {
      try {
        const notes = await writeBatch(ops)
        this.failures = 0
        this.onCommitted({ ops, notes })
      } catch (e) {
        this.requeue(ops)
        this.onError(e)
      } finally {
        this.status()
      }
    })
    return this.flushing
  }

  /** Puts failed ops back (unless a newer change for the same record arrived) and retries. */
  private requeue(ops: WriteOp[]) {
    for (const op of ops) {
      const id = `${op.store}:${op.type === 'clear' ? '*' : String(op.key)}`
      if (!this.pending.has(id)) this.pending.set(id, op)
    }
    this.failures++
    const delay = Math.min(MAX_BACKOFF, 1000 * 2 ** (this.failures - 1))
    this.retryTimer = setTimeout(() => void this.flush(), delay)
    saveStatus.value = { state: 'error', pending: this.pending.size, retryAt: Date.now() + delay }
  }

  private status() {
    if (this.retryTimer) return // stay in "error" until a retry succeeds
    saveStatus.value = { state: this.pending.size ? 'saving' : 'saved', pending: this.pending.size, retryAt: null }
  }
}

export const queue = new WriteQueue()

/* ---------------- Cross-window channel ---------------- */

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('daynest-sync') : null
const remoteListeners = new Set<Listener<RemoteChange>>()
const conflictListeners = new Set<Listener<{ tasks: Task[]; deleted: string[]; messages: string[] }>>()

queue.onCommitted = ({ ops, notes }) => {
  const msg: ChangeMessage = { type: 'changed', from: TAB_ID, tasks: [], deletedTasks: [], calendars: false, lists: false, settings: false }
  for (const op of ops) {
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
    const tasks = notes.filter((n) => n.result).map((n) => n.result as Task)
    const deleted = notes.filter((n) => !n.result).map((n) => String(n.key))
    conflictListeners.forEach((fn) => fn({ tasks, deleted, messages: notes.map((n) => n.message) }))
  }
}

if (channel) {
  channel.onmessage = async (e: MessageEvent<ChangeMessage>) => {
    const m = e.data
    if (!m || m.type !== 'changed' || m.from === TAB_ID) return
    try {
      const change: RemoteChange = {
        tasks: await getMany<Task>('tasks', m.tasks),
        deletedTasks: m.deletedTasks,
      }
      if (m.calendars) change.calendars = await getAll<CalendarCategory>('calendars')
      if (m.lists) change.lists = await getAll<TaskList>('lists')
      if (m.settings) change.settings = await getOne<Partial<Settings>>('settings', 'app')
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

function taskPut(task: Task, base: Task | undefined) {
  queue.enqueue({
    store: 'tasks',
    type: 'put',
    key: task.id,
    value: task,
    check: {
      baseRev: base?.rev ?? 0,
      base,
      resolve: (stored, oldestBase) => {
        const theirs = stored as Task
        const { task: merged, conflicts } = mergeTask(oldestBase as Task | undefined, task, theirs)
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

function taskDelete(id: string, base: Task | undefined) {
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
        note: { key: id, result: stored, message: `"${(stored as Task).title}" was edited in another window, so it was not deleted.` },
      }),
    },
  })
}

const put = (store: StoreName, value: { id: string }) => queue.enqueue({ store, type: 'put', key: value.id, value })
const del = (store: StoreName, key: string) => queue.enqueue({ store, type: 'delete', key })

export const persistence = {
  async loadAll(): Promise<Snapshot> {
    const [tasks, calendars, lists, settings] = await Promise.all([
      getAll<Task>('tasks'),
      getAll<CalendarCategory>('calendars'),
      getAll<TaskList>('lists'),
      getOne<Partial<Settings>>('settings', 'app'),
    ])
    return { tasks, calendars, lists, settings }
  },

  /** `base` = the version this window had before the change (undefined for new tasks). */
  saveTask: (t: Task, base?: Task) => taskPut(t, base),
  deleteTask: (id: string, base?: Task) => taskDelete(id, base),
  saveCalendar: (c: CalendarCategory) => put('calendars', c),
  deleteCalendar: (id: string) => del('calendars', id),
  saveList: (l: TaskList) => put('lists', l),
  deleteList: (id: string) => del('lists', id),
  saveSettings: (s: Settings) => queue.enqueue({ store: 'settings', type: 'put', key: 'app', value: { ...s } }),

  /** Replaces all data (used by import). Unchecked: the user chose to overwrite. */
  replaceAll(snap: Snapshot) {
    for (const store of ['tasks', 'calendars', 'lists'] as const) queue.enqueue({ store, type: 'clear' })
    snap.tasks.forEach((t) => put('tasks', t))
    snap.calendars.forEach((c) => put('calendars', c))
    snap.lists.forEach((l) => put('lists', l))
  },

  flush: () => queue.flush(),
  setErrorHandler(fn: Listener<unknown>) {
    queue.onError = fn
  },
  /** Changes saved by another window/tab of Daynest on this device. */
  onRemoteChange(fn: Listener<RemoteChange>) {
    remoteListeners.add(fn)
    return () => remoteListeners.delete(fn)
  },
  /** This window's write met newer data; `tasks` is what was actually stored. */
  onConflict(fn: Listener<{ tasks: Task[]; deleted: string[]; messages: string[] }>) {
    conflictListeners.add(fn)
    return () => conflictListeners.delete(fn)
  },
}
