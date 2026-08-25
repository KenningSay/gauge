import { useEffect, useState } from 'react'
import { fetchBlob } from '../api/webdav'

interface State {
  url: string | null
  loading: boolean
  error: boolean
}

// Fetches `path` with a real Authorization header and exposes it as a
// blob: URL for <img>/<video>/<audio>, which can't carry a custom header
// themselves. Refetches on path change, revoking the previous object URL on
// unmount/change so blobs don't pile up. Pass null to skip fetching.
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
