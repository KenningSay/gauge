// DeepSeek chat client. Two transports, chosen by endpoint:
//
// 1. Proxy mode (default): endpoint is same-origin (e.g. "/ai/"), the
//    nginx in front of Gauge injects the Authorization header server-side.
//    The key never exists in the browser at all. Requires no CSP change —
//    the request never leaves the origin.
//
// 2. Direct mode: endpoint is a full URL (e.g. "https://api.deepseek.com").
//    The user pastes their own key, stored in sessionStorage under
//    gauge-ai-key. Requires the deployer to add https://api.deepseek.com to
//    connect-src in the CSP — Gauge's own nginx.conf.template ships with
//    connect-src 'self' only, which would block this at the browser before
//    CORS is even consulted. Documented as a deliberate opt-in, not a
//    default that silently fails.
//
// Streaming uses fetch + ReadableStream reader, not EventSource —
// EventSource can't send a POST body or custom headers, which makes it
// useless for the chat completions endpoint.

export type AiModel = 'deepseek-chat' | 'deepseek-reasoner'

export interface AiConfig {
  endpoint: string
  apiKey: string | null
  model: AiModel
}

export interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface StreamChunk {
  // Incremental text to append to the current assistant bubble.
  delta: string
  // Present only on the first chunk of an R1 response — reasoning_content
  // is streamed before content begins, and the caller decides whether to
  // show it (default: hidden, see §5.6).
  reasoningDelta?: string
  // Present only on the last chunk.
  usage?: {
    promptTokens: number
    completionTokens: number
    costUsd: number
  }
}

export class AiError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.status = status
  }
}

// DeepSeek's public price list (per 1M tokens, USD), as of the model
// release this was written against. Kept here as one obvious place to
// edit when they change it. Reasoning tokens bill as completion tokens on
// R1; cache-hit pricing is ignored — Gauge's prompts are short and
// varied enough that cache hits are rare, and pretending otherwise would
// just make the number wrong in a different direction.
const PRICING: Record<AiModel, { prompt: number; completion: number }> = {
  'deepseek-chat': { prompt: 0.27, completion: 1.1 },
  'deepseek-reasoner': { prompt: 0.55, completion: 2.19 },
}

export function estimateCost(model: AiModel, promptTokens: number, completionTokens: number): number {
  const p = PRICING[model]
  return (promptTokens * p.prompt + completionTokens * p.completion) / 1_000_000
}

// Resolves the endpoint to a URL the browser can fetch. Same-origin
// endpoints ("/ai/") pass through. Full URLs pass through. Anything else
// is malformed.
function resolveEndpoint(endpoint: string): string {
  if (endpoint.startsWith('/')) return endpoint
  try {
    // Throws on garbage — better to fail loudly here than to send a fetch
    // to "foo.bar/chat" and get a confusing CORS error.
    new URL(endpoint)
    return endpoint
  } catch {
    throw new AiError(`Некорректный endpoint: ${endpoint}`)
  }
}

// True when the endpoint is same-origin (proxy mode) — the caller uses
// this to decide whether to ask the user for a key at all.
export function isProxyEndpoint(endpoint: string): boolean {
  return endpoint.startsWith('/')
}

interface StreamOptions {
  config: AiConfig
  messages: ChatCompletionMessage[]
  signal?: AbortSignal
  // Fires once per parsed SSE chunk. Caller is responsible for stitching
  // deltas into the message it's building.
  onChunk: (chunk: StreamChunk) => void
}

// Reads the SSE body of a DeepSeek streaming response. The wire format is
// "data: {json}\n\n" lines, terminated by "data: [DONE]". Parsing is
// deliberately tolerant — a proxy that re-buffers the response can
// concatenate chunks, so we split on the "\n\n" SSE record separator
// rather than assuming one data line per network read.
async function readStream(
  body: ReadableStream<Uint8Array>,
  model: AiModel,
  onChunk: (chunk: StreamChunk) => void,
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let sawDone = false
  let usage: StreamChunk['usage']

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // Process every complete SSE record currently in the buffer. A record
    // ends with a blank line ("\n\n"); anything after the last "\n\n" is a
    // partial record and stays in the buffer for the next read.
    let sep: number
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const record = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      const line = record.trim()
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') {
        sawDone = true
        continue
      }
      let json: unknown
      try {
        json = JSON.parse(payload)
      } catch {
        // A malformed chunk from a partial write — skip it rather than
        // aborting the whole stream. Real chunks are never malformed; the
        // only way this fires is a broken proxy, and skipping one chunk
        // beats blanking the reply.
        continue
      }
      const choice = (json as {
        choices?: Array<{
          delta?: { content?: string; reasoning_content?: string }
        }>
        usage?: { prompt_tokens: number; completion_tokens: number }
      }).choices?.[0]
      const usageRaw = (json as {
        usage?: { prompt_tokens: number; completion_tokens: number }
      }).usage
      const delta = choice?.delta?.content ?? ''
      const reasoningDelta = choice?.delta?.reasoning_content
      if (delta || reasoningDelta) {
        onChunk({ delta, reasoningDelta })
      }
      if (usageRaw) {
        usage = {
          promptTokens: usageRaw.prompt_tokens,
          completionTokens: usageRaw.completion_tokens,
          costUsd: estimateCost(model, usageRaw.prompt_tokens, usageRaw.completion_tokens),
        }
      }
    }
  }

  // Flush any trailing record without a final blank line — some proxies
  // strip the last "\n\n", and losing the final few characters of a reply
  // is a visible bug.
  const tail = buffer.trim()
  if (tail.startsWith('data:')) {
    const payload = tail.slice(5).trim()
    if (payload !== '[DONE]') {
      try {
        const json = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string; reasoning_content?: string } }>
          usage?: { prompt_tokens: number; completion_tokens: number }
        }
        const delta = json.choices?.[0]?.delta?.content ?? ''
        const reasoningDelta = json.choices?.[0]?.delta?.reasoning_content
        if (delta || reasoningDelta) onChunk({ delta, reasoningDelta })
        if (json.usage) {
          usage = {
            promptTokens: json.usage.prompt_tokens,
            completionTokens: json.usage.completion_tokens,
            costUsd: estimateCost(model, json.usage.prompt_tokens, json.usage.completion_tokens),
          }
        }
      } catch {
        // Same tolerance as above — swallow.
      }
    } else {
      sawDone = true
    }
  }

  if (usage) onChunk({ delta: '', usage })
  // sawDone currently unused beyond documentation — DeepSeek has been
  // observed ending the stream without a [DONE] in some proxy configs, and
  // treating a missing [DONE] as an error would break those deployments
  // for no benefit. Kept as a variable in case a stricter mode is wanted
  // later.
  void sawDone
}

export async function streamChat(opts: StreamOptions): Promise<void> {
  const { config, messages, signal, onChunk } = opts
  const url = resolveEndpoint(config.endpoint).replace(/\/+$/, '') + '/chat/completions'

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  }
  if (!isProxyEndpoint(config.endpoint)) {
    if (!config.apiKey) {
      throw new AiError('Не задан API-ключ DeepSeek', 401)
    }
    headers['Authorization'] = `Bearer ${config.apiKey}`
  }

  const body = JSON.stringify({
    model: config.model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
  })

  let res: Response
  try {
    res = await fetch(url, { method: 'POST', headers, body, signal })
  } catch (e) {
    // AbortError on user-requested stop is not an error — the caller
    // already knows it cancelled, and re-throwing here would surface a
    // spurious "network error" toast on every Stop press.
    if (e instanceof DOMException && e.name === 'AbortError') return
    throw new AiError(`Сеть: ${e instanceof Error ? e.message : String(e)}`)
  }

  if (!res.ok) {
    // Read the body for DeepSeek's error envelope — the JSON has a
    // human-readable message that's much better than the HTTP status
    // alone ("insufficient balance" vs "402").
    let detail = ''
    try {
      const text = await res.text()
      const parsed = JSON.parse(text) as { error?: { message?: string } }
      detail = parsed.error?.message ?? text.slice(0, 200)
    } catch {
      // Body wasn't JSON or already consumed — status alone will do.
    }
    throw new AiError(
      detail ? `${res.status} ${res.statusText}: ${detail}` : `${res.status} ${res.statusText}`,
      res.status,
    )
  }

  if (!res.body) {
    throw new AiError('Пустой ответ от DeepSeek')
  }

  await readStream(res.body, config.model, onChunk)
}

// Convenience: one-shot, non-streaming completion. Used by the built-in
// content actions ("Улучши текст", "Суммируй") — those want the finished
// text and don't benefit from incremental rendering, and the UI already
// shows a spinner on the pin being processed.
export async function complete(
  config: AiConfig,
  messages: ChatCompletionMessage[],
  signal?: AbortSignal,
): Promise<{ content: string; promptTokens: number; completionTokens: number; costUsd: number }> {
  const url = resolveEndpoint(config.endpoint).replace(/\/+$/, '') + '/chat/completions'
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (!isProxyEndpoint(config.endpoint)) {
    if (!config.apiKey) throw new AiError('Не задан API-ключ DeepSeek', 401)
    headers['Authorization'] = `Bearer ${config.apiKey}`
  }
  const body = JSON.stringify({
    model: config.model,
    messages,
    stream: false,
  })
  let res: Response
  try {
    res = await fetch(url, { method: 'POST', headers, body, signal })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new AiError('Запрос отменён')
    }
    throw new AiError(`Сеть: ${e instanceof Error ? e.message : String(e)}`)
  }
  if (!res.ok) {
    let detail = ''
    try {
      const text = await res.text()
      const parsed = JSON.parse(text) as { error?: { message?: string } }
      detail = parsed.error?.message ?? text.slice(0, 200)
    } catch {
      // ignore
    }
    throw new AiError(
      detail ? `${res.status} ${res.statusText}: ${detail}` : `${res.status} ${res.statusText}`,
      res.status,
    )
  }
  const json = (await res.json()) as {
    choices: Array<{ message: { content: string } }>
    usage: { prompt_tokens: number; completion_tokens: number }
  }
  const content = json.choices[0]?.message?.content ?? ''
  const usage = json.usage ?? { prompt_tokens: 0, completion_tokens: 0 }
  return {
    content,
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    costUsd: estimateCost(config.model, usage.prompt_tokens, usage.completion_tokens),
  }
}

// Account balance. DeepSeek exposes it under /user/balance with a
// different response shape from everything else — {is_available,
// balance_infos: [{currency, total_balance, ...}]}. Only ever called by the
// usage popover's "refresh" button and its auto-open — never polled.
export interface BalanceInfo {
  currency: string
  totalBalance: number
}

export async function fetchBalance(config: AiConfig, signal?: AbortSignal): Promise<BalanceInfo | null> {
  const url = resolveEndpoint(config.endpoint).replace(/\/+$/, '') + '/user/balance'
  const headers: Record<string, string> = {}
  if (!isProxyEndpoint(config.endpoint)) {
    if (!config.apiKey) return null
    headers['Authorization'] = `Bearer ${config.apiKey}`
  }
  try {
    const res = await fetch(url, { headers, signal })
    if (!res.ok) return null
    const json = (await res.json()) as {
      balance_infos?: Array<{ currency: string; total_balance: string }>
    }
    const first = json.balance_infos?.[0]
    if (!first) return null
    return { currency: first.currency, totalBalance: parseFloat(first.total_balance) }
  } catch {
    return null
  }
}