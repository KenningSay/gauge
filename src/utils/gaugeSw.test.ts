// @vitest-environment node
import { it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

it('streams downloads with live auth, a UTF-8 filename and a one-use ticket', async () => {
  const listeners: Record<string, (event: any) => void> = {}
  const body = new ReadableStream({ start(c) { c.close() } })
  let authorization: string | null = null
  const client = { id: 'tab', url: 'https://example.test/gauge/', postMessage(_data: unknown, ports: MessagePort[]) { ports[0].postMessage({ authHeader: 'Basic test' }); ports[0].close() } }
  runInNewContext(readFileSync('public/gauge-sw.js', 'utf8'), {
    self: { location: { origin: 'https://example.test' }, registration: { scope: client.url },
      clients: { get: async () => client }, addEventListener(type: string, callback: any) { listeners[type] = callback } },
    URL, Headers, Response, Request, MessageChannel, setTimeout: () => 0, clearTimeout: () => {},
    fetch: async (_url: string, init: RequestInit) => { authorization = new Headers(init.headers).get('Authorization'); return new Response(body) },
  })
  const token = '01234567-0123-4567-8901-012345678901'
  let ready = false
  const prepare = (path: string) => listeners.message({ source: client, data: { type: 'GAUGE_DOWNLOAD', token, path, filename: 'Архив.rar' }, ports: [{ postMessage() { ready = true } }] })
  prepare('https://elsewhere.test/dav/file')
  expect(ready).toBe(false)
  prepare('/dav/../private')
  expect(ready).toBe(false)
  prepare('/dav/archive.rar')
  expect(ready).toBe(true)
  const download = () => { let result!: Promise<Response>; listeners.fetch({ request: new Request(client.url + '__download/' + token), respondWith(r: Promise<Response>) { result = r } }); return result }
  const response = await download()
  expect(response.body).toBe(body)
  expect(response.headers.get('content-disposition')).toContain("filename*=UTF-8''%D0%90")
  expect(authorization).toBe('Basic test')
  expect((await download()).status).toBe(410)
})
