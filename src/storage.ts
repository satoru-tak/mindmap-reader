import type { MindMap } from './types'

/**
 * Persistence. All data stays in this browser (no server, nothing is sent anywhere).
 *
 * Primary: IndexedDB (large capacity). Fallback: localStorage (when IndexedDB is unavailable,
 * e.g. some private-browsing modes or sandboxed previews).
 * Data saved by earlier versions in localStorage is migrated to IndexedDB on first load.
 */
const LS_KEY = 'mindmap-reader:v1'
const DB_NAME = 'mindmap-reader'
const STORE = 'kv'
const STATE_KEY = 'state'

export interface PersistedState {
  maps: Record<string, MindMap>
  currentMapId: string | null
}

let dbPromise: Promise<IDBDatabase> | null = null
function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open(DB_NAME, 1)
        req.onupgradeneeded = () => req.result.createObjectStore(STORE)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
        req.onblocked = () => reject(new Error('blocked'))
      } catch (e) {
        reject(e)
      }
    })
  }
  return dbPromise
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error)
  })
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

function lsGet(): PersistedState | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? (JSON.parse(raw) as PersistedState) : null
  } catch {
    return null
  }
}

function lsSet(state: PersistedState) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state))
  } catch {
    /* storage unavailable or full: keep working in memory */
  }
}

let useIdb = true

export async function loadState(): Promise<PersistedState | null> {
  try {
    const fromIdb = await idbGet<PersistedState>(STATE_KEY)
    if (fromIdb) return fromIdb
    // first run on IndexedDB: migrate anything saved by the localStorage version
    const legacy = lsGet()
    if (legacy) await idbSet(STATE_KEY, legacy)
    return legacy
  } catch {
    useIdb = false
    return lsGet()
  }
}

export async function saveState(state: PersistedState): Promise<void> {
  if (useIdb) {
    try {
      await idbSet(STATE_KEY, state)
      return
    } catch {
      useIdb = false
    }
  }
  lsSet(state)
}

/** Holder for the state loaded before the app starts (the store reads it synchronously). */
let preloaded: PersistedState | null = null
export const setPreloaded = (s: PersistedState | null) => {
  preloaded = s
}
export const getPreloaded = () => preloaded
