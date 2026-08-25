import { fetchBlob } from '../api/webdav'

// Download links used to be a plain `<a href={authorizedFetchUrl(path)}>` —
// a URL with the real WebDAV username/password embedded in it, sitting in
// the DOM for as long as the menu/viewer was open. Fetches the actual bytes
// with a real Authorization header instead and triggers the save from an
// in-memory blob via a throwaway anchor — nothing credential-shaped ever
// touches a URL. The revoke is deferred a beat rather than immediate:
// revoking the object URL synchronously right after `.click()` has, on some
// browsers, raced the download actually starting.
export async function downloadEntry(path: string, filename: string): Promise<void> {
  const blob = await fetchBlob(path)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
