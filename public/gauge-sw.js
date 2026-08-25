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
//
// The credential is never stored anywhere in this worker — not in a module
// variable (Chrome discards those when it kills an idle worker and respawns
// it fresh for the next 'fetch' event) and deliberately not in IndexedDB
// either: that would outlive the tab closing, quietly contradicting the
// app's own "credentials live in sessionStorage only, gone the moment the
// tab closes" security note, and would auto-authenticate a bare browser
// navigation to a /dav/ URL with no login screen involved at all. Instead,
// every matching request asks the exact client that made it for the header
// it's currently holding in memory, live, over a MessageChannel — nothing
// to clean up on logout or tab close, because nothing is ever written down.
const AUTH_TIMEOUT_MS = 2000

function requestAuthHeader(clientId) {
  return new Promise((resolve) => {
    let settled = false
    const settle = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    const timer = setTimeout(() => settle(null), AUTH_TIMEOUT_MS)
    self.clients.get(clientId).then((client) => {
      if (!client) { clearTimeout(timer); settle(null); return }
      const channel = new MessageChannel()
      channel.port1.onmessage = (e) => {
        clearTimeout(timer)
        settle(e.data && e.data.authHeader ? e.data.authHeader : null)
      }
      client.postMessage({ type: 'GAUGE_GET_AUTH' }, [channel.port2])
    }).catch(() => { clearTimeout(timer); settle(null) })
  })
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
  if (!event.clientId) return

  event.respondWith((async () => {
    const authHeader = await requestAuthHeader(event.clientId)
    // Not logged in, or the page didn't answer in time — pass the request
    // through unmodified rather than leaving it half-handled.
    if (!authHeader) return fetch(req)

    const headers = new Headers(req.headers)
    headers.set('Authorization', authHeader)
    const res = await fetch(new Request(req.url, {
      method: 'GET',
      headers,
      mode: 'same-origin',
      credentials: 'omit',
      cache: req.cache,
    }))
    // A video/audio element failing with 401 previously just failed
    // silently from the app's point of view — the credential this worker
    // used got rejected, but nothing told webdav.ts, so the UI stayed on
    // the file manager as if the session were still fine. Tell the client
    // which header got rejected; it only actually logs out if that's still
    // the currently active one (see webdav.ts's reportUnauthorized).
    if (res.status === 401) {
      const client = await self.clients.get(event.clientId)
      client?.postMessage({ type: 'GAUGE_AUTH_REJECTED', authHeader })
    }
    return res
  })())
})
