// Shared cache of authenticated blob: URLs. The existing useAuthorizedUrl
// hook fetches a fresh blob per component mount and revokes on unmount —
// fine for the file viewer, which shows one file at a time, but a board
// with 30 image pins would issue 30 overlapping fetches of the same
// picture every time the board is reopened, and each pin unmount/remount
// (scroll out of virtualization, resize, pan) would refetch again.
//
// Refcounting is the whole point: the URL is only revoked once every pin
// that acquired it has released it, so two pins referencing the same asset
// don't fight over who owns the object URL.
//
// Not a persistent cache — a page reload throws it away. Rebuilding it from
// the network on reload is cheap on a local WebDAV, and persisting blobs to
// IndexedDB is exactly the kind of "credentialed data outlives the tab"
// pattern this project has already removed once (see §4 of the handoff on
// the service worker's auth model).

import { fetchBlob } from '../api/webdav'

interface Entry {
  url: string
  refs: number
  // Resolves once the blob is in hand. Sharing the same promise across
  // concurrent acquirers is what collapses N parallel fetches of the same
  // asset into one.
  promise: Promise<string>
}

const cache = new Map<string, Entry>()

// Acquires a blob URL for the given /dav-relative path. Callers MUST pair
// every acquire with a release when the component unmounts or the path
// changes; a leaked acquire keeps the blob alive for the rest of the tab's
// life.
export async function acquireBlobUrl(path: string): Promise<string> {
  let entry = cache.get(path)
  if (!entry) {
    const promise = fetchBlob(path).then((blob) => URL.createObjectURL(blob))
    const created: Entry = { url: '', refs: 0, promise }
    entry = created
    cache.set(path, created)
    // Two acquirers can race here in theory — first one wins, second
    // sees refs>0. No lock needed: JS is single-threaded and the get/set
    // pair above is synchronous.
    promise.then((url) => {
      // If everything released before the fetch finished, the entry is
      // already gone from the map — revoke immediately.
      if (cache.get(path) !== created) {
        URL.revokeObjectURL(url)
        return
      }
      created.url = url
    }).catch(() => {
      cache.delete(path)
    })
  }
  entry.refs++
  try {
    return await entry.promise
  } catch (e) {
    // Failed fetch: don't leave a dead entry that future acquirers would
    // await forever. Caller will see the rejection too.
    releaseBlobUrl(path)
    throw e
  }
}

export function releaseBlobUrl(path: string): void {
  const entry = cache.get(path)
  if (!entry) return
  entry.refs--
  if (entry.refs > 0) return
  cache.delete(path)
  // If the fetch never resolved (still in flight), the .then above will
  // see cache.get(path) !== entry and revoke on its own. If it did resolve,
  // entry.url holds the live URL and we revoke it here.
  if (entry.url) URL.revokeObjectURL(entry.url)
}

// Test/teardown helper: drop everything and revoke what's resolved. Not
// used by production code — the cache lives and dies with the tab.
export function clearBlobCache(): void {
  for (const entry of cache.values()) {
    if (entry.url) URL.revokeObjectURL(entry.url)
  }
  cache.clear()
}