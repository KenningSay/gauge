export class CancelledError extends Error {}

export interface PoolResult<T> {
  succeeded: T[]
  failed: { item: T; error: unknown }[]
}

// Runs fn over items with at most `limit` in flight — bounds concurrency for
// bulk WebDAV ops instead of going fully serial (slow) or fully parallel
// (caused a double-fire MKCOL/PUT race in the folder-drop bug).
//
// Every item runs to completion regardless of others failing, and outcomes
// are collected per item rather than the whole call rejecting on the first
// failure: plain Promise.all would reject immediately while other workers
// kept running unobserved in the background, leaving the caller unsure what
// actually succeeded. Reporting outcomes back (instead of just throwing a
// combined error) matters beyond visibility, too — a caller mutating its
// own state based on the result (e.g. pruning a cut clipboard down to only
// what's actually left to move) needs to know exactly which items landed.
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
): Promise<PoolResult<T>> {
  let i = 0
  const succeeded: T[] = []
  const failed: { item: T; error: unknown }[] = []
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length && !signal?.aborted) {
      const item = items[i++]
      try {
        await fn(item)
        succeeded.push(item)
      } catch (e) {
        failed.push({ item, error: e })
      }
    }
  })
  await Promise.all(workers)
  if (signal?.aborted) throw new CancelledError()
  return { succeeded, failed }
}

// Re-throws runPool's old aggregate-error shape, for the common case where a
// caller doesn't need per-item detail and just wants "did everything
// succeed" — the real error if every item failed, a summary naming how many
// of how many otherwise.
export function throwIfAnyFailed<T>(result: PoolResult<T>, total: number): void {
  const { failed } = result
  if (failed.length === 0) return
  if (failed.length === total) throw failed[0].error
  const firstMsg = failed[0].error instanceof Error ? failed[0].error.message : String(failed[0].error)
  throw new Error(`${failed.length} из ${total} не выполнено (${firstMsg})`)
}
