// IndexedDB storage: one database, one “key → value” store. Plan photo (underlay), undo steps, plan versions.

/** One write of a batch: put a value under a key, or delete the key. */
export type StoreOp = ['put', string, unknown] | ['del', string];

/** The storage history.ts and versions.ts write to (idbStore here; tests use their own in-memory one). Reads are unchecked. */
export interface KeyValueStore {
  get(key: string): Promise<unknown>;
  batch(ops: StoreOp[]): Promise<void>;
}

const db = (): Promise<IDBDatabase> =>
  new Promise((ok, err) => {
    const r = indexedDB.open('home-twin-editor', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => err(r.error);
  });
// op: 'get' reads, 'put' writes val, 'del' deletes the key.
export async function idb(op: 'get' | 'put' | 'del', key: string, val?: unknown): Promise<unknown> {
  const d = await db();
  try {
    return await new Promise<unknown>((ok, err) => {
      const t = d.transaction('files', op === 'get' ? 'readonly' : 'readwrite');
      const s = t.objectStore('files');
      const r = op === 'get' ? s.get(key) : op === 'put' ? s.put(val, key) : s.delete(key);
      t.oncomplete = () => ok(r.result);
      t.onabort = t.onerror = () => err(t.error || r.error);
    });
  } finally {
    d.close();
  }
}
// several puts and deletes in one transaction: [['put', key, value] | ['del', key]]
export async function idbBatch(ops: StoreOp[]): Promise<void> {
  if (!ops.length) return;
  const d = await db();
  try {
    await new Promise<void>((ok, err) => {
      const t = d.transaction('files', 'readwrite');
      const s = t.objectStore('files');
      for (const [op, k, v] of ops) op === 'put' ? s.put(v, k) : s.delete(k);
      t.oncomplete = () => ok();
      t.onabort = t.onerror = () => err(t.error);
    });
  } finally {
    d.close();
  }
}
// the same through the common storage interface (history.js, versions.js; tests use their own in-memory one)
export const idbStore: KeyValueStore = {get: k => idb('get', k), batch: idbBatch};
