// IndexedDB storage: one database, one “key → value” store. Plan photo (underlay), undo steps, plan versions.
const db=()=>new Promise((ok,err)=>{const r=indexedDB.open('home-twin-editor',1);r.onupgradeneeded=()=>r.result.createObjectStore('files');r.onsuccess=()=>ok(r.result);r.onerror=()=>err(r.error);});
export async function idb(op,key,val){const d=await db();try{return await new Promise((ok,err)=>{const t=d.transaction('files',op==='get'?'readonly':'readwrite'),s=t.objectStore('files');
  const r=op==='get'?s.get(key):op==='put'?s.put(val,key):s.delete(key);t.oncomplete=()=>ok(r.result);t.onabort=t.onerror=()=>err(t.error||r.error);});}finally{d.close();}}
// several puts and deletes in one transaction: [['put', key, value] | ['del', key]]
export async function idbBatch(ops){if(!ops.length)return;const d=await db();try{await new Promise((ok,err)=>{const t=d.transaction('files','readwrite'),s=t.objectStore('files');
  for(const [op,k,v] of ops)op==='put'?s.put(v,k):s.delete(k);t.oncomplete=()=>ok();t.onabort=t.onerror=()=>err(t.error);});}finally{d.close();}}
// the same through the common storage interface (history.js, versions.js; tests use their own in-memory one)
export const idbStore={get:k=>idb('get',k),batch:idbBatch};
