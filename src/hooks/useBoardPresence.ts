// Tells a board who else has it open right now.
//
// The failure this guards against: two tabs, often on two machines, both
// autosaving into one board. The server does not enforce If-Match, so for
// an hour neither side knew the other existed and each overwrote the other
// on every keystroke's worth of debounce. A conflict dialog only appears
// once that has already started; this appears before the first write.
//
// Everything here is best-effort. A vault that can't write the heartbeat
// folder degrades to exactly the old behaviour rather than blocking work.

import { useEffect, useState } from 'react'
import * as boardApi from '../api/board'
import type { PresencePeer } from '../api/board'

const CLIENT_ID_KEY = 'gauge.clientId'

// Per tab, and stable across reloads of that tab: sessionStorage survives
// F5 but not a new tab, which is exactly the identity we want — a reloaded
// tab is the same editor, a second tab is not. Storage can throw (private
// mode, blocked site data), so a fresh id per mount is the fallback.
function getClientId(): string {
  try {
    const existing = sessionStorage.getItem(CLIENT_ID_KEY)
    if (existing) return existing
    const id = crypto.randomUUID()
    sessionStorage.setItem(CLIENT_ID_KEY, id)
    return id
  } catch {
    return crypto.randomUUID()
  }
}

function describeThisClient(): string {
  const ua = navigator.userAgent
  const platform =
    /Android/i.test(ua) ? 'Android'
    : /iPhone|iPad|iPod/i.test(ua) ? 'iOS'
    : /Windows/i.test(ua) ? 'Windows'
    : /Mac OS X/i.test(ua) ? 'macOS'
    : /Linux/i.test(ua) ? 'Linux'
    : 'устройство'
  const browser =
    /Firefox\//i.test(ua) ? 'Firefox'
    : /Edg\//i.test(ua) ? 'Edge'
    : /OPR\//i.test(ua) ? 'Opera'
    : /Chrome\//i.test(ua) ? 'Chrome'
    : /Safari\//i.test(ua) ? 'Safari'
    : 'браузер'
  return `${platform} · ${browser}`
}

export function useBoardPresence(boardId: string | null): PresencePeer[] {
  const [peers, setPeers] = useState<PresencePeer[]>([])

  useEffect(() => {
    if (!boardId) {
      setPeers([])
      return
    }
    const clientId = getClientId()
    const label = describeThisClient()
    let cancelled = false

    const beat = async () => {
      await boardApi.announcePresence(boardId, clientId, label)
      if (cancelled) return
      const found = await boardApi.listPresence(boardId, clientId)
      if (cancelled) return
      setPeers(found)
    }

    void beat()
    const timer = setInterval(() => void beat(), boardApi.PRESENCE_BEAT_MS)

    return () => {
      cancelled = true
      clearInterval(timer)
      // Fire-and-forget: if the tab is closing this may not land, and then
      // the entry ages out on its own within PRESENCE_STALE_MS.
      void boardApi.clearPresence(boardId, clientId)
      setPeers([])
    }
  }, [boardId])

  return peers
}
