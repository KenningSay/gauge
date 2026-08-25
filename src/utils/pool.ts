export class CancelledError extends Error {}

// Runs fn over items with at most `limit` in flight — bounds concurrency for
// bulk WebDAV ops instead of going fully serial (slow) or fully parallel
// (caused a double-fire MKCOL/PUT race in the folder-drop bug).
//
// Every item runs to completion regardless of others failing, and errors are
// collected rather than thrown on the first one: plain Promise.all would
// reject immediately while other workers kept running unobserved in the
// background, leaving the caller unsure what actually succeeded.
//
// `signal` stops workers from picking up new items once aborted; whatever's
// already in flight (e.g. an upload's XHR) is expected to reject on its own
// once the caller wires the same signal into it. A pool that was aborted
// throws CancelledError regardless of what the individual items' errors
// were — those are abort artifacts, not real failures worth reporting.
export async function runPool<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  let i = 0
  const errors: unknown[] = []
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length && !signal?.aborted) {
      const item = items[i++]
      try {
        await fn(item)
      } catch (e) {
        errors.push(e)
      }
    }
  })
  await Promise.all(workers)
  if (signal?.aborted) throw new CancelledError()
  if (errors.length === items.length && errors.length > 0) {
    throw errors[0] // everything failed — surface the real first error, not a vague summary
  }
  if (errors.length > 0) {
    const first = errors[0]
    const firstMsg = first instanceof Error ? first.message : String(first)
    throw new Error(`${errors.length} из ${items.length} не выполнено (${firstMsg})`)
  }
}
