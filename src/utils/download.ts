import { fetchBlob } from '../api/webdav'

// Fetches the file with a real Authorization header and triggers the save
// from an in-memory blob via a throwaway anchor, rather than pointing a
// download link straight at a credentialed URL. Revoke is deferred a beat —
// doing it synchronously after `.click()` has raced the download starting
// on some browsers.
export async function downloadEntry(path: string, filename: string): Promise<void> {
  const blob = await fetchBlob(path)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
