/**
 * Minimal promise wrapper around IndexedDB (no dependency).
 *
 * Why IndexedDB: it's the browser's real database — asynchronous (never
 * blocks rendering), indexed, transactional and comfortable with tens of
 * thousands of records, unlike localStorage.
 */

/**
 * Local-only mode (no Supabase configured) uses "daynest-local". Signed-in
 * users each get their own database ("daynest-user-<id>"), so one person's
 * cache can never show up for another.
 */
export const LOCAL_DB_NAME = 'daynest-local'
export const DB_VERSION = 2

let dbName = LOCAL_DB_NAME
let dbPromise = null

function upgrade(db, oldVersion) {
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
  if (oldVersion < 2) {
    // Changes waiting to be pushed to the server (append-only, in order).
    const outbox = db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true })
    outbox.createIndex('key', 'key')
    // Sync bookkeeping (last pulled timestamps…).
    db.createObjectStore('meta')
  }
}

/** Switches to another local database (e.g. a different signed-in user). */
export async function useDatabase(name) {
  if (name === dbName && dbPromise) return
  await closeDb()
  dbName = name
}

export function currentDatabase() {
  return dbName
}

export async function closeDb() {
  const p = dbPromise
  dbPromise = null
  if (p) {
    try {
      ;(await p).close()
    } catch {
      /* already closed */
    }
  }
}

export function openDb() {
  if (dbPromise) return dbPromise
  const name = dbName
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser.'))
      return
    }
    const req = indexedDB.open(name, DB_VERSION)
    req.onupgradeneeded = (e) => upgrade(req.result, e.oldVersion)
    req.onsuccess = () => {
      const db = req.result
      // Another tab upgraded the schema: close so it can proceed.
      db.onversionchange = () => {
        db.close()
        if (dbPromise) dbPromise = null
      }
      resolve(db)
    }
    req.onerror = () => reject(req.error ?? new Error('Could not open database'))
    req.onblocked = () => reject(new Error('Database is blocked by another open tab.'))
  })
  dbPromise.catch(() => (dbPromise = null))
  return dbPromise
}

export function requestToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'))
  })
}

export async function getAll(store) {
  const db = await openDb()
  return requestToPromise(db.transaction(store, 'readonly').objectStore(store).getAll())
}

export async function getOne(store, key) {
  const db = await openDb()
  return requestToPromise(db.transaction(store, 'readonly').objectStore(store).get(key))
}

/**
 * Applies many writes atomically in one transaction. Checked writes read the
 * current record inside the same transaction, so the compare-and-write is
 * race-free across windows and tabs.
 */
export async function writeBatch(ops) {
  if (!ops.length) return []
  const db = await openDb()
  const stores = new Set(ops.map((o) => o.store))
  if (ops.some((o) => o.remote)) stores.add('outbox')
  const tx = db.transaction([...stores], 'readwrite')
  const done = txDone(tx)
  const notes = []
  for (const op of ops) {
    const s = tx.objectStore(op.store)
    if (op.type === 'clear') s.clear()
    else if (op.remote) writeRemote(tx, s, op, notes)
    else if (op.check) {
      const check = op.check
      const req = s.get(op.key)
      req.onsuccess = () => {
        const stored = req.result
        if (!stored || (stored.rev ?? 0) <= check.baseRev) {
          if (op.type === 'delete') s.delete(op.key)
          else s.put(op.value)
          return
        }
        const { write, note } = check.resolve(stored, check.base)
        if (write) s.put(write)
        notes.push(note)
      }
    } else if (op.type === 'delete') s.delete(op.key)
    else if (op.store === 'settings' || op.store === 'meta') s.put(op.value, op.key)
    else s.put(op.value)
  }
  await done
  return notes
}

/**
 * A record that came from the server. It must never overwrite a local change
 * that has not been pushed yet (an outbox entry newer than `afterSeq`), nor,
 * when `checkRev` is set, a newer local revision. Skipped records are
 * reported as `{ skipped: 'store:id' }` notes.
 */
function writeRemote(tx, s, op, notes) {
  const { outboxKey, afterSeq = 0, checkRev = false } = op.remote
  const pending = tx.objectStore('outbox').index('key').getAll(outboxKey)
  pending.onsuccess = () => {
    if (pending.result.some((e) => e.seq > afterSeq)) {
      notes.push({ skipped: outboxKey })
      return
    }
    if (op.type === 'delete') {
      s.delete(op.key)
      return
    }
    if (!checkRev) {
      if (op.store === 'settings') s.put(op.value, op.key)
      else s.put(op.value)
      return
    }
    const cur = s.get(op.key)
    cur.onsuccess = () => {
      if (cur.result && (cur.result.rev ?? 0) > (op.value.rev ?? 0)) notes.push({ skipped: outboxKey })
      else s.put(op.value)
    }
  }
}

/** Reads several records by key (missing keys are omitted). */
export async function getMany(store, keys) {
  if (!keys.length) return []
  const db = await openDb()
  const s = db.transaction(store, 'readonly').objectStore(store)
  const results = await Promise.all(keys.map((k) => requestToPromise(s.get(k))))
  return results.filter(Boolean)
}

/** Deletes records by key in one transaction. */
export async function deleteMany(store, keys) {
  if (!keys.length) return
  const db = await openDb()
  const tx = db.transaction(store, 'readwrite')
  const done = txDone(tx)
  const s = tx.objectStore(store)
  for (const k of keys) s.delete(k)
  return done
}

/** For tests. */
export function resetDbConnection() {
  dbPromise = null
}
