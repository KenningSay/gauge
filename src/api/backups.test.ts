// Tests for the snapshot layer added after a board was lost to two clients
// overwriting each other. Its whole job is to make the loss recoverable, so
// the properties worth pinning are: a snapshot can be found again, the
// ordering puts the useful one on top, and pruning never eats the rare
// conflict copies to make room for routine autosaves.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  listBackups,
  pruneBackups,
  writeBackup,
  snapshotServerVersion,
  backupDirFor,
  listPresence,
  BACKUP_KEEP_AUTO,
  type Board,
} from './board'
import { setCredentials, clearCredentials } from './webdav'

function res(opts: { status?: number; body?: string }) {
  const status = opts.status ?? 207
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: 'Mock',
    text: async () => opts.body ?? '',
    blob: async () => new Blob([opts.body ?? '']),
  }
}

// Minimal PROPFIND Depth:1 listing. `modified` matters for presence,
// `href` for names.
function listingXml(dirHref: string, files: Array<{ name: string; size: number; modified: string }>) {
  const items = files
    .map(
      (f) => `
  <D:response>
    <D:href>${dirHref}${encodeURIComponent(f.name)}</D:href>
    <D:propstat><D:prop>
      <D:resourcetype/>
      <D:getcontentlength>${f.size}</D:getcontentlength>
      <D:getlastmodified>${f.modified}</D:getlastmodified>
    </D:prop></D:propstat>
  </D:response>`,
    )
    .join('')
  return `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>${dirHref}</D:href>
    <D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop></D:propstat>
  </D:response>${items}
</D:multistatus>`
}

const BOARD_ID = 'b1'
const DIR_HREF = `/dav/.gauge/backups/${BOARD_ID}/`

function board(overrides: Partial<Board> = {}): Board {
  return {
    id: BOARD_ID,
    name: 'Вакансии удалёнка',
    createdAt: '2026-09-17T05:16:16.789Z',
    updatedAt: '2026-09-19T14:07:30.403Z',
    viewport: { x: 0, y: 0, zoom: 1 },
    settings: {
      snapEnabled: true,
      snapStep: 20,
      gridVisible: true,
      backgroundColor: '#1b1a18',
      backgroundTexture: 'dots',
    },
    pins: [],
    edges: [],
    ...overrides,
  } as Board
}

describe('backups', () => {
  beforeEach(() => setCredentials('alex', 'pw'))
  afterEach(() => {
    clearCredentials()
    vi.unstubAllGlobals()
  })

  it('writes a snapshot under a colon-free, parseable name', async () => {
    const puts: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        if ((init.method ?? 'GET') === 'PUT') puts.push(url)
        return res({ status: 201 })
      }),
    )

    const at = new Date('2026-09-19T14:07:30.403Z')
    const ok = await writeBackup(BOARD_ID, board(), 'auto', at)

    expect(ok).toBe(true)
    const path = puts.find((u) => u.includes('backups'))
    expect(path).toBeDefined()
    // A colon would have to be escaped in the URL and is illegal on FAT/
    // exFAT, which the vault gets copied to.
    expect(decodeURIComponent(path!)).not.toContain(':')
    expect(decodeURIComponent(path!)).toContain('2026-09-19T14-07-30-403Z__auto.json')
  })

  it('never fails the save it is protecting', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => res({ status: 500 })))
    await expect(writeBackup(BOARD_ID, board(), 'auto')).resolves.toBe(false)
  })

  it('lists snapshots newest first and ignores foreign files', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        res({
          status: 207,
          body: listingXml(DIR_HREF, [
            { name: '2026-09-19T10-00-00-000Z__auto.json', size: 1200, modified: 'Fri, 19 Sep 2026 10:00:00 GMT' },
            { name: '2026-09-19T14-07-30-403Z__conflict.json', size: 9000, modified: 'Fri, 19 Sep 2026 14:07:30 GMT' },
            { name: 'notes.txt', size: 10, modified: 'Fri, 19 Sep 2026 10:00:00 GMT' },
          ]),
        }),
      ),
    )

    const out = await listBackups(BOARD_ID)

    expect(out.map((b) => b.kind)).toEqual(['conflict', 'auto'])
    expect(out[0].size).toBe(9000)
    expect(out[0].path).toBe(`${backupDirFor(BOARD_ID)}/2026-09-19T14-07-30-403Z__conflict.json`)
  })

  it('returns nothing rather than throwing when a board has no snapshots yet', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => res({ status: 404 })))
    await expect(listBackups(BOARD_ID)).resolves.toEqual([])
  })

  it('prunes autosaves past the budget without touching conflict copies', async () => {
    // One more autosave than the budget allows, plus a single old conflict
    // snapshot that is older than every one of them.
    const files = Array.from({ length: BACKUP_KEEP_AUTO + 3 }, (_, i) => {
      const mm = String(i).padStart(2, '0')
      return {
        name: `2026-09-19T10-${mm}-00-000Z__auto.json`,
        size: 1000,
        modified: 'Fri, 19 Sep 2026 10:00:00 GMT',
      }
    })
    files.push({
      name: '2026-09-01T08-00-00-000Z__conflict.json',
      size: 5000,
      modified: 'Tue, 01 Sep 2026 08:00:00 GMT',
    })

    const deleted: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        const method = init.method ?? 'GET'
        if (method === 'DELETE') {
          deleted.push(decodeURIComponent(url))
          return res({ status: 204 })
        }
        return res({ status: 207, body: listingXml(DIR_HREF, files) })
      }),
    )

    await pruneBackups(BOARD_ID)

    expect(deleted).toHaveLength(3)
    expect(deleted.every((d) => d.includes('__auto'))).toBe(true)
    // The oldest autosaves go; the conflict copy is the one version that
    // exists nowhere else, so age must not condemn it.
    expect(deleted.some((d) => d.includes('__conflict'))).toBe(false)
    expect(deleted.some((d) => d.includes('10-00-00'))).toBe(true)
  })

  it('captures the server version before it gets overwritten', async () => {
    const other = board({ name: 'их версия' })
    const puts: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const method = init.method ?? 'GET'
        if (method === 'PUT') {
          puts.push(String(init.body))
          return res({ status: 201 })
        }
        if (method === 'GET') return res({ status: 200, body: JSON.stringify(other) })
        return res({ status: 201 })
      }),
    )

    const ok = await snapshotServerVersion(BOARD_ID)

    expect(ok).toBe(true)
    expect(puts.some((b) => b.includes('их версия'))).toBe(true)
  })
})

describe('presence', () => {
  beforeEach(() => setCredentials('alex', 'pw'))
  afterEach(() => {
    clearCredentials()
    vi.unstubAllGlobals()
  })

  it('reports live peers, skips self, and ignores heartbeats that went stale', async () => {
    const now = Date.now()
    const iso = (msAgo: number) => new Date(now - msAgo).toUTCString()
    const dir = '/dav/.gauge/locks/b1/'

    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const method = init.method ?? 'GET'
        if (method === 'GET') {
          return res({ status: 200, body: JSON.stringify({ label: 'Linux · Chrome' }) })
        }
        return res({
          status: 207,
          body: listingXml(dir, [
            { name: 'me.json', size: 80, modified: iso(1000) },
            { name: 'other-live.json', size: 80, modified: iso(5000) },
            { name: 'other-stale.json', size: 80, modified: iso(5 * 60_000) },
          ]),
        })
      }),
    )

    const peers = await listPresence('b1', 'me')

    expect(peers.map((p) => p.clientId)).toEqual(['other-live'])
    expect(peers[0].label).toBe('Linux · Chrome')
  })

  it('stays quiet when the locks folder does not exist', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => res({ status: 404 })))
    await expect(listPresence('b1', 'me')).resolves.toEqual([])
  })
})
