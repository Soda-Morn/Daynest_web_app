import { getOne, LOCAL_DB_NAME, writeBatch } from './db'

/**
 * Data saved in this browser outside an account:
 *  - "daynest-local": local-only mode (no Supabase configured);
 *  - "bloom-planner": the same data from builds made before the project was
 *    renamed. It is moved into "daynest-local" once, then deleted.
 */
const OLD_LOCAL_DB_NAME = 'bloom-planner'
const STORES = ['tasks', 'calendars', 'lists', 'settings']
const IMPORTED_FLAG = 'daynest.localDataImported'

/** Reads a database without creating it. Resolves to null if it doesn't exist or is empty. */
function readDatabase(name) {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null)
    let existed = true
    const req = indexedDB.open(name)
    // Don't create an empty database just by looking.
    req.onupgradeneeded = () => {
      existed = false
      req.transaction?.abort()
    }
    req.onerror = () => resolve(null)
    req.onsuccess = () => {
      const db = req.result
      const stores = STORES.filter((s) => db.objectStoreNames.contains(s))
      if (!existed || !stores.includes('tasks')) {
        db.close()
        return resolve(null)
      }
      const tx = db.transaction(stores, 'readonly')
      const out = { tasks: [], calendars: [], lists: [], settings: undefined }
      for (const store of stores) {
        const r = store === 'settings' ? tx.objectStore(store).get('app') : tx.objectStore(store).getAll()
        r.onsuccess = () => (out[store] = r.result)
      }
      tx.oncomplete = () => {
        db.close()
        resolve(out.tasks.length || out.calendars.length ? out : null)
      }
      tx.onerror = () => {
        db.close()
        resolve(null)
      }
    }
  })
}

function deleteDatabase(name) {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(name)
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
}

/**
 * Local-only mode: moves data from the pre-rename database into the current
 * one (already open). Only runs while the current database is still empty, so
 * it can never overwrite anything.
 */
export async function migrateLegacyLocalData() {
  if ((await getOne('settings', 'app')) || (await readDatabase(LOCAL_DB_NAME))) return
  const old = await readDatabase(OLD_LOCAL_DB_NAME)
  if (!old) return
  const ops = [
    ...old.tasks.map((v) => ({ store: 'tasks', type: 'put', key: v.id, value: v })),
    ...old.calendars.map((v) => ({ store: 'calendars', type: 'put', key: v.id, value: v })),
    ...old.lists.map((v) => ({ store: 'lists', type: 'put', key: v.id, value: v })),
  ]
  if (old.settings) ops.push({ store: 'settings', type: 'put', key: 'app', value: old.settings })
  await writeBatch(ops)
  await deleteDatabase(OLD_LOCAL_DB_NAME)
}

/**
 * Cloud mode: tasks saved in this browser before signing in, offered once so
 * the user can add them to their account. Returns null if there are none or
 * they were already imported (so they are not offered to every account that
 * signs in on a shared computer).
 */
export async function readLocalOnlyData() {
  if (localStorage.getItem(IMPORTED_FLAG)) return null
  return (await readDatabase(LOCAL_DB_NAME)) ?? (await readDatabase(OLD_LOCAL_DB_NAME))
}

/** Call after the local-only data was added to an account (or declined). */
export function markLocalOnlyDataImported() {
  try {
    localStorage.setItem(IMPORTED_FLAG, String(Date.now()))
  } catch {
    /* storage unavailable: the offer just shows again */
  }
}
