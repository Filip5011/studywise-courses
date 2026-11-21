// Tiny IndexedDB wrapper: one store for the database file and small values,
// one for images (attachments and course figures, by their studywise-file URL).

const DB_NAME = 'studywise'
type StoreName = 'kv' | 'files'

let opening: Promise<IDBDatabase> | null = null
function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore('kv')
      req.result.createObjectStore('files')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return opening
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode)
        const req = fn(t.objectStore(store))
        t.oncomplete = () => resolve(req.result)
        t.onerror = () => reject(t.error)
        t.onabort = () => reject(t.error)
      })
  )
}

export const idb = {
  get: <T>(store: StoreName, key: string) => tx<T | undefined>(store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>),
  set: (store: StoreName, key: string, value: unknown) => tx(store, 'readwrite', (s) => s.put(value, key)).then(() => undefined),
  del: (store: StoreName, key: string) => tx(store, 'readwrite', (s) => s.delete(key)).then(() => undefined),
  clear: (store: StoreName) => tx(store, 'readwrite', (s) => s.clear()).then(() => undefined)
}

/** Ask the browser not to clear our storage when space runs low. */
export function persistStorage(): void {
  void navigator.storage?.persist?.().catch(() => {})
}
