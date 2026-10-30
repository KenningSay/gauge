import { davUrl } from '../api/webdav'

/** Hand the URL to the browser's native download manager (Range/resume capable). */
export async function nativeDownload(path: string, filename: string, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const a = document.createElement('a')
  a.href = davUrl(path) + '?gauge-native-download=1'
  a.download = filename
  document.body.appendChild(a)
  a.click()
  setTimeout(() => a.remove(), 1000)
}
