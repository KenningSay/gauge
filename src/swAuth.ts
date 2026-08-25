// Registers gauge-sw.js (see public/gauge-sw.js for what it actually does
// and why) and answers its live "what's the current auth header" requests.
// Nothing about the credential is written anywhere on this side either —
// the worker asks, this just reads webdav.ts's in-memory value and replies.

import { getAuthHeader } from './api/webdav'

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

if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (!event.data || event.data.type !== 'GAUGE_GET_AUTH') return
    const port = event.ports[0]
    port?.postMessage({ authHeader: getAuthHeader() })
  })
}

// Whether the worker is actually intercepting THIS page's requests right
// now — false on the very first load ever (a freshly-registered worker
// doesn't control the page that registered it until the next navigation),
// true from the second load onward. Callers fall back to a plain fetch
// (blob: URL) when this is false.
export function isSWControlling(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller
}
