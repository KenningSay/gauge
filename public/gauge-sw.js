// Lets video/audio use a real, range-request-capable URL instead of a
// blob: one. <video>/<audio> src can't carry a custom Authorization header,
// which is why media went through fetch-the-whole-file-into-a-blob instead —
// correct, but it means playback can't start until the whole file has
// downloaded, and there's no seeking via HTTP Range until then either. This
// worker adds the header to plain GET requests for /dav/ paths instead, so
// the <video>/<audio> element's own native request (including the Range
// requests it makes when the user seeks) goes out authenticated but
// otherwise untouched — streaming and seeking work exactly like a normal
// video URL would, and the credential still never appears in a URL, `src`
// attribute, or anywhere else visible in the DOM.

const DB_NAME = 'gauge-sw-auth'
const STORE = 'kv'
const KEY = 'authHeader'

// The credential is read from IndexedDB, not a module-scope variable set via
// postMessage: Chrome kills an idle service worker and respawns it fresh on
// the next 'fetch' event, which wipes any in-memory state — a real bug seen
// live where a video opened a while after login hung forever on an
// unauthenticated request. IndexedDB survives that respawn.
//
// The connection itself is cached (opened once, reused) rather than
// reopened per request, since a <video> element can fire several concurrent
// Range requests for one resource and there's no reason to pay
// indexedDB.open()'s cost more than once per worker lifetime.
let dbPromise = null

function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

async function getAuthHeader() {
  try {
    const db = await openDB()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(KEY)
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  // Only the plain, no-custom-header GET requests a <video>/<audio> element
  // makes on its own qualify — webdav.ts's own fetch()/XHR calls already set
  // a real Authorization header themselves and are left completely alone.
  if (req.method !== 'GET' || req.headers.has('Authorization')) return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin || !url.pathname.startsWith('/dav/')) return

  event.respondWith((async () => {
    const authHeader = await getAuthHeader()
    // Not logged in (or IndexedDB unavailable) — pass the request through
    // unmodified rather than leaving it half-handled.
    if (!authHeader) return fetch(req)

    const headers = new Headers(req.headers)
    headers.set('Authorization', authHeader)
    return fetch(new Request(req.url, {
      method: 'GET',
      headers,
      mode: 'same-origin',
      credentials: 'omit',
      cache: req.cache,
    }))
  })())
})
