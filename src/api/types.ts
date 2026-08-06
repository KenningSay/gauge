export interface FileEntry {
  name: string
  path: string
  isDir: boolean
  size: number
  modified: string
  contentType: string
}

export type ViewerKind = 'image' | 'video' | 'audio' | 'text' | 'pdf' | 'none'

export function detectViewerKind(entry: FileEntry): ViewerKind {
  const ext = entry.name.split('.').pop()?.toLowerCase() ?? ''
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(ext)) return 'image'
  if (['mp4', 'webm', 'ogv', 'mov', 'mkv'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext)) return 'audio'
  if (ext === 'pdf') return 'pdf'
  const textExt = [
    'md', 'txt', 'json', 'js', 'jsx', 'ts', 'tsx', 'css', 'html', 'xml', 'yml', 'yaml',
    'toml', 'ini', 'conf', 'sh', 'py', 'log', 'csv', 'gitignore', 'env',
  ]
  if (textExt.includes(ext) || entry.contentType.startsWith('text/')) return 'text'
  return 'none'
}
