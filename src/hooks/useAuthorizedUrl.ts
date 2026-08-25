import { useEffect, useState } from 'react'
import { fetchBlob } from '../api/webdav'

interface State {
  url: string | null
  loading: boolean
  error: boolean
}

// <img>/<video>/<audio>/<iframe> src can't carry a custom Authorization
// header, so displaying WebDAV-protected media means fetching the bytes with
// a real header (see webdav.ts's fetchBlob comment for why this replaced
// credential-in-URL) and handing the browser a local blob: URL instead.
// Fetches once per `path`, revokes the previous object URL on unmount or
// when `path` changes so blobs don't pile up in memory as the user browses.
// Pass null to skip fetching entirely (e.g. a viewer kind that doesn't need
// the raw bytes, like text — that path reads content a different way).
export function useAuthorizedUrl(path: string | null): State {
  const [state, setState] = useState<State>({ url: null, loading: !!path, error: false })

  useEffect(() => {
    if (!path) {
      setState({ url: null, loading: false, error: false })
      return
    }
    let cancelled = false
    let objectUrl: string | null = null
    setState({ url: null, loading: true, error: false })
    fetchBlob(path)
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setState({ url: objectUrl, loading: false, error: false })
      })
      .catch(() => {
        if (!cancelled) setState({ url: null, loading: false, error: true })
      })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [path])

  return state
}
