import { davUrl } from '../api/webdav'

/** Stream a single file to the browser's download manager, without a Blob. */
export async function nativeDownload(path: string, filename: string, signal?: AbortSignal): Promise<void> {
  // Firefox can stall when a large attachment is relayed through a service worker.
  // Use its native download stack for WebDAV files.
  if (/Firefox\//.test(navigator.userAgent)) {
    const a = document.createElement('a')
    a.href = davUrl(path) + '?gauge-native-download=1'
    a.download = filename
    a.click()
    return
  }
  if (!('serviceWorker' in navigator)) throw new Error('Для скачивания нужен HTTPS и поддержка service worker')
  const registration = await navigator.serviceWorker.ready
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const worker = navigator.serviceWorker.controller
  if (!worker) throw new Error('Обнови страницу и повтори скачивание')
  const token = crypto.randomUUID()
  const downloadUrl = await new Promise<string>((resolve, reject) => {
    const channel = new MessageChannel()
    const timer = setTimeout(() => {
      channel.port1.close()
      reject(new Error('Обнови страницу и повтори скачивание'))
    }, 5000)
    channel.port1.onmessage = (event) => {
      clearTimeout(timer)
      channel.port1.close()
      if (event.data?.ready) resolve(new URL(`__download/${token}`, registration.scope).href)
      else reject(new Error('Не удалось подготовить скачивание'))
    }
    worker.postMessage({ type: 'GAUGE_DOWNLOAD', token, path: davUrl(path), filename }, [channel.port2])
  })
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  // An attachment response keeps the application open and streams to disk.
  const frame = document.createElement('iframe')
  frame.hidden = true
  frame.src = downloadUrl
  document.body.appendChild(frame)
  // Keep the initiating frame alive while the browser owns the transfer.
  frame.addEventListener('load', () => frame.remove(), { once: true })
}
