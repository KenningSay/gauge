import { describe, it, expect, vi, afterEach } from 'vitest'
import { streamChat, estimateCost, isProxyEndpoint, AiError, type StreamChunk } from './ai'

// Builds a Response whose body streams the given pieces one network read at
// a time — that's what lets these tests exercise record boundaries falling
// in the middle of a JSON payload, which is the failure mode a naive
// line-splitting parser has.
function sseResponse(pieces: string[], status = 200): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const p of pieces) controller.enqueue(encoder.encode(p))
      controller.close()
    },
  })
  return new Response(body, { status, headers: { 'Content-Type': 'text/event-stream' } })
}

function dataLine(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`
}

function contentChunk(text: string) {
  return { choices: [{ delta: { content: text } }] }
}

async function collect(pieces: string[]): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  vi.stubGlobal('fetch', vi.fn(async () => sseResponse(pieces)))
  await streamChat({
    config: { endpoint: '/ai/', apiKey: null, model: 'deepseek-chat' },
    messages: [{ role: 'user', content: 'hi' }],
    onChunk: (c) => chunks.push(c),
  })
  return chunks
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SSE parsing', () => {
  it('reads well-formed records', async () => {
    const chunks = await collect([
      dataLine(contentChunk('При')),
      dataLine(contentChunk('вет')),
      'data: [DONE]\n\n',
    ])
    expect(chunks.map((c) => c.delta).join('')).toBe('Привет')
  })

  it('reassembles a record split across network reads', async () => {
    const line = dataLine(contentChunk('split'))
    const cut = Math.floor(line.length / 2)
    const chunks = await collect([line.slice(0, cut), line.slice(cut), 'data: [DONE]\n\n'])
    expect(chunks.map((c) => c.delta).join('')).toBe('split')
  })

  it('handles several records arriving in one read', async () => {
    const chunks = await collect([
      dataLine(contentChunk('a')) + dataLine(contentChunk('b')) + dataLine(contentChunk('c')),
    ])
    expect(chunks.map((c) => c.delta).join('')).toBe('abc')
  })

  it('skips a malformed record instead of blanking the reply', async () => {
    const chunks = await collect([
      dataLine(contentChunk('ok')),
      'data: {not json at all\n\n',
      dataLine(contentChunk('still here')),
    ])
    expect(chunks.map((c) => c.delta).join('')).toBe('okstill here')
  })

  it('emits the trailing record when the stream ends without a blank line', async () => {
    // Some proxies strip the final "\n\n"; losing the last words of a reply
    // would be a visible bug.
    const chunks = await collect([dataLine(contentChunk('start')), `data: ${JSON.stringify(contentChunk('tail'))}`])
    expect(chunks.map((c) => c.delta).join('')).toBe('starttail')
  })

  it('works without a [DONE] marker', async () => {
    const chunks = await collect([dataLine(contentChunk('no done'))])
    expect(chunks.map((c) => c.delta).join('')).toBe('no done')
  })

  it('reports usage as its own final chunk with a computed cost', async () => {
    const chunks = await collect([
      dataLine(contentChunk('hi')),
      dataLine({ choices: [], usage: { prompt_tokens: 1000, completion_tokens: 2000 } }),
      'data: [DONE]\n\n',
    ])
    const usage = chunks.at(-1)?.usage
    expect(usage).toBeDefined()
    expect(usage!.promptTokens).toBe(1000)
    expect(usage!.completionTokens).toBe(2000)
    expect(usage!.costUsd).toBeCloseTo(estimateCost('deepseek-chat', 1000, 2000), 10)
  })

  it('surfaces R1 reasoning separately from the answer', async () => {
    const chunks = await collect([
      dataLine({ choices: [{ delta: { reasoning_content: 'думаю' } }] }),
      dataLine(contentChunk('ответ')),
    ])
    expect(chunks[0].reasoningDelta).toBe('думаю')
    expect(chunks.map((c) => c.delta).join('')).toBe('ответ')
  })
})

describe('error handling', () => {
  it('turns a DeepSeek error envelope into a readable AiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { message: 'Insufficient Balance' } }), {
          status: 402,
          statusText: 'Payment Required',
        }),
      ),
    )
    const call = streamChat({
      config: { endpoint: '/ai/', apiKey: null, model: 'deepseek-chat' },
      messages: [{ role: 'user', content: 'hi' }],
      onChunk: () => {},
    })
    await expect(call).rejects.toBeInstanceOf(AiError)
    await expect(call).rejects.toMatchObject({ status: 402 })
  })

  it('explains a 404 in proxy mode as a missing proxy, not as a DeepSeek error', async () => {
    // Nothing serving /ai/ on this origin — an unconfigured deployment, or
    // a dev server without the proxy. A bare "404" leaves the user with
    // nothing to act on.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>404</html>', { status: 404 })))
    const call = streamChat({
      config: { endpoint: '/ai/', apiKey: null, model: 'deepseek-chat' },
      messages: [{ role: 'user', content: 'hi' }],
      onChunk: () => {},
    })
    await expect(call).rejects.toMatchObject({ status: 404 })
    await expect(call).rejects.toThrow(/прокси не настроен/)
  })

  it("keeps DeepSeek's own error text when there is one", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { message: 'Insufficient Balance' } }), { status: 402 }),
      ),
    )
    await expect(
      streamChat({
        config: { endpoint: '/ai/', apiKey: null, model: 'deepseek-chat' },
        messages: [{ role: 'user', content: 'hi' }],
        onChunk: () => {},
      }),
    ).rejects.toThrow(/Insufficient Balance/)
  })

  it('refuses a direct endpoint with no key rather than sending an unauthenticated request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      streamChat({
        config: { endpoint: 'https://api.deepseek.com', apiKey: null, model: 'deepseek-chat' },
        messages: [{ role: 'user', content: 'hi' }],
        onChunk: () => {},
      }),
    ).rejects.toMatchObject({ status: 401 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('treats an abort as a silent stop, not an error', async () => {
    // Pressing Stop already tells the user what happened; a "network error"
    // toast on top of it would be noise.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new DOMException('aborted', 'AbortError')
      }),
    )
    const controller = new AbortController()
    await expect(
      streamChat({
        config: { endpoint: '/ai/', apiKey: null, model: 'deepseek-chat' },
        messages: [{ role: 'user', content: 'hi' }],
        signal: controller.signal,
        onChunk: () => {},
      }),
    ).resolves.toBeUndefined()
  })
})

describe('endpoint mode', () => {
  it('treats a path as the server-side proxy and a URL as direct', () => {
    expect(isProxyEndpoint('/ai/')).toBe(true)
    expect(isProxyEndpoint('https://api.deepseek.com')).toBe(false)
  })

  it('never sends the DeepSeek key in proxy mode — it forwards the WebDAV session instead', async () => {
    // The key belongs to the server in proxy mode. What goes out is the
    // session's own WebDAV credential (null here, since no login happened),
    // so the proxy can refuse strangers rather than letting anyone who finds
    // the URL spend the owner's balance.
    const fetchMock = vi.fn(async (_url: unknown, _init: RequestInit) => sseResponse(['data: [DONE]\n\n']))
    vi.stubGlobal('fetch', fetchMock)
    await streamChat({
      config: { endpoint: '/ai/', apiKey: 'sk-should-not-be-sent', model: 'deepseek-chat' },
      messages: [{ role: 'user', content: 'hi' }],
      onChunk: () => {},
    })
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    const auth = (init?.headers as Record<string, string>).Authorization ?? ''
    expect(auth).not.toContain('sk-should-not-be-sent')
    expect(auth).not.toMatch(/^Bearer /)
  })
})

describe('estimateCost', () => {
  it('bills R1 higher than V3 for the same tokens', () => {
    expect(estimateCost('deepseek-reasoner', 1000, 1000)).toBeGreaterThan(
      estimateCost('deepseek-chat', 1000, 1000),
    )
  })

  it('is zero for zero tokens', () => {
    expect(estimateCost('deepseek-chat', 0, 0)).toBe(0)
  })
})
