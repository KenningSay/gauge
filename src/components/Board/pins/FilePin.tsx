import { useCallback, useEffect } from 'react'
import { File as FileIcon, Music, Video, Image as ImageIcon, FileText, Archive, Code } from 'lucide-react'
import type { FilePin as FilePinT } from '../../../api/board'
import { downloadEntry } from '../../../utils/download'
import { formatSize } from '../../../utils/format'
import { usePinActivation } from '../PinShell'
import styles from './Pins.module.css'

export function FilePin({ pin }: { pin: FilePinT }) {
  const { registerDoubleClick } = usePinActivation()

  // Double-click downloads. Registered with the shell rather than bound to
  // the DOM here: a native dblclick never reaches a pin while the canvas
  // holds the pointer capture (see PinShell).
  const download = useCallback(() => {
    void downloadEntry(pin.assetPath, pin.fileName)
    return true
  }, [pin.assetPath, pin.fileName])

  useEffect(() => {
    registerDoubleClick(download)
    return () => registerDoubleClick(null)
  }, [registerDoubleClick, download])

  const icon = pickIcon(pin.fileName, pin.mimeType)

  return (
    <div className={styles.fileWrap}>
      <div className={styles.fileIcon}>{icon}</div>
      <div className={styles.fileName}>{pin.fileName}</div>
      <div className={styles.fileSize}>{formatSize(pin.fileSize, false)}</div>
    </div>
  )
}

function pickIcon(name: string, mime: string) {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext)) return <Music size={34} />
  if (mime.startsWith('video/') || ['mp4', 'webm', 'mov', 'mkv'].includes(ext)) return <Video size={34} />
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return <ImageIcon size={34} />
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) return <Archive size={34} />
  if (['js', 'ts', 'tsx', 'jsx', 'py', 'sh', 'rs', 'go', 'c', 'cpp', 'java'].includes(ext)) return <Code size={34} />
  if (['txt', 'md', 'log', 'csv', 'json', 'yaml', 'yml', 'toml'].includes(ext)) return <FileText size={34} />
  return <FileIcon size={34} />
}