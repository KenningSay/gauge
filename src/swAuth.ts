// Registers gauge-sw.js (see public/gauge-sw.js for what it actually does
// and why) and keeps its IndexedDB-stored credential in sync with the
// current WebDAV session.

const DB_NAME = 'gauge-sw-auth'
const STORE = 'kv'
const KEY = 'authHeader'

let registered: Promise<ServiceWorkerRegistration | null> | null = null

function registerSW(): Promise<ServiceWorkerRegistration | null> {
  if (!registered) {
    registered = 'serviceWorker' in navigator
      // Resolved relative to the current document, not a hardcoded root —
      // the app can be deployed at any subpath (see vite.config.ts's
      // base: './'), and a service worker registered at /foo/sw.js can only
      // ever control pages under /foo/ by default.
      ? navigator.serviceWorker.register(new URL('gauge-sw.js', document.baseURI)).catch(() => null)
      : Promise.resolve(null)
  }
  return registered
}

// Kicks off registration as early as possible (imported once from
// main.tsx) rather than waiting for the first login — the worker only takes
// control starting the page load *after* it registers, so the sooner it's
// requested, the sooner a real, streamable video URL becomes available.
registerSW()

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// Written to IndexedDB rather than pushed via postMessage: a postMessage
// only reaches whichever service worker instance is alive right now, and
// Chrome discards an idle worker's in-memory state and respawns it fresh on
// the next request — losing a postMessage'd credential with it. IndexedDB
// is what the worker reads from on every request instead, so it survives.
export async function syncAuthToSW(authHeader: string | null): Promise<void> {
  await registerSW()
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      if (authHeader) tx.objectStore(STORE).put(authHeader, KEY)
      else tx.objectStore(STORE).delete(KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    // No IndexedDB (e.g. private browsing in some browsers) — video/audio
    // just falls back to the blob: path via ViewerModal's needsBlob check.
  }
}

// Whether the worker is actually intercepting THIS page's requests right
// now — false on the very first load ever (a freshly-registered worker
// doesn't control the page that registered it until the next navigation),
// true from the second load onward. Callers fall back to a plain fetch
// (blob: URL) when this is false.
export function isSWControlling(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller
}
