import { davUrl } from '../api/webdav'

/** Navigate to WebDAV so the browser handles the response as a native download. */
export async function nativeDownload(path: string, _filename: string, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  window.location.assign(davUrl(path) + '?gauge-native-download=1')
}
