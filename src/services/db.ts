/**
 * Minimal promise wrapper around IndexedDB (no dependency).
 *
 * Why IndexedDB: it's the browser's real database — asynchronous (never
 * blocks rendering), indexed, transactional and comfortable with tens of
 * thousands of records, unlike localStorage.
 */

// Technical identifier kept from the original project name so existing
// local data stays readable after the Daynest rename. Not user-facing.
export const DB_NAME = 'bloom-planner'
export const DB_VERSION = 1

export type StoreName = 'tasks' | 'calendars' | 'lists' | 'settings'

let dbPromise: Promise<IDBDatabase> | null = null

function upgrade(db: IDBDatabase, oldVersion: number) {
  if (oldVersion < 1) {
    const tasks = db.createObjectStore('tasks', { keyPath: 'id' })
    // Indexes for the frequently queried fields (range reads / future sync).
    tasks.createIndex('dueDate', 'dueDate')
    tasks.createIndex('startDate', 'startDate')
    tasks.createIndex('status', 'status')
    tasks.createIndex('calendarId', 'calendarId')
    tasks.createIndex('listId', 'listId')
    tasks.createIndex('updatedAt', 'updatedAt')
    db.createObjectStore('calendars', { keyPath: 'id' })
    db.createObjectStore('lists', { keyPath: 'id' })
    db.createObjectStore('settings')
  }
}

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser.'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => upgrade(req.result, e.oldVersion)
    req.onsuccess = () => {
      const db = req.result
      // Another tab upgraded the schema: close so it can proceed.
      db.onversionchange = () => db.close()
      resolve(db)
    }
    req.onerror = () => reject(req.error ?? new Error('Could not open database'))
    req.onblocked = () => reject(new Error('Database is blocked by another open tab.'))
  })
  dbPromise.catch(() => (dbPromise = null))
  return dbPromise
}

export function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'))
  })
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb()
  return requestToPromise(db.transaction(store, 'readonly').objectStore(store).getAll()) as Promise<T[]>
}

export async function getOne<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb()
  return requestToPromise(db.transaction(store, 'readonly').objectStore(store).get(key)) as Promise<T | undefined>
}

export interface WriteOp {
  store: StoreName
  type: 'put' | 'delete' | 'clear'
  key?: IDBValidKey
  value?: unknown
  /**
   * Optimistic concurrency for tasks: the version this window started from.
   * If the stored record has a higher `rev`, someone else saved in between
   * and `resolve` decides what to write instead of blindly overwriting.
   */
  check?: {
    baseRev: number
    /** The record as this window last saw it (kept as the oldest when coalescing). */
    base?: unknown
    resolve: (stored: { rev?: number }, base: unknown) => { write: unknown | null; note: ConflictNote }
  }
}

export interface ConflictNote {
  key: IDBValidKey
  /** What ended up stored (null when deleted). */
  result: unknown | null
  message: string
}

/**
 * Applies many writes atomically in one transaction. Checked writes read the
 * current record inside the same transaction, so the compare-and-write is
 * race-free across windows and tabs.
 */
export async function writeBatch(ops: WriteOp[]): Promise<ConflictNote[]> {
  if (!ops.length) return []
  const db = await openDb()
  const stores = [...new Set(ops.map((o) => o.store))]
  const tx = db.transaction(stores, 'readwrite')
  const done = txDone(tx)
  const notes: ConflictNote[] = []
  for (const op of ops) {
    const s = tx.objectStore(op.store)
    if (op.type === 'clear') s.clear()
    else if (op.check) {
      const check = op.check
      const req = s.get(op.key!)
      req.onsuccess = () => {
        const stored = req.result as { rev?: number } | undefined
        if (!stored || (stored.rev ?? 0) <= check.baseRev) {
          if (op.type === 'delete') s.delete(op.key!)
          else s.put(op.value)
          return
        }
        const { write, note } = check.resolve(stored, check.base)
        if (write) s.put(write)
        notes.push(note)
      }
    } else if (op.type === 'delete') s.delete(op.key!)
    else if (op.store === 'settings') s.put(op.value, op.key)
    else s.put(op.value)
  }
  await done
  return notes
}

/** Reads several records by key (missing keys are omitted). */
export async function getMany<T>(store: StoreName, keys: IDBValidKey[]): Promise<T[]> {
  if (!keys.length) return []
  const db = await openDb()
  const s = db.transaction(store, 'readonly').objectStore(store)
  const results = await Promise.all(keys.map((k) => requestToPromise(s.get(k))))
  return results.filter(Boolean) as T[]
}

/** For tests. */
export function resetDbConnection() {
  dbPromise = null
}
