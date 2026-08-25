// Runs fn over items with at most `limit` in flight at once — plain
// sequential await-in-a-loop for bulk WebDAV operations (upload/delete/move)
// means N items take N round trips end-to-end; this bounds concurrency
// instead of going fully parallel (which is what caused the double-fire
// MKCOL/PUT race in the folder-drop bug) or fully serial (slow).
//
// Collects per-item errors instead of rejecting on the first one: with plain
// `Promise.all`, one item throwing rejects the whole pool immediately, but
// the OTHER workers' in-flight `fn()` calls are NOT cancelled — they keep
// running in the background, silently changing server state, even after the
// caller has already caught the rejection, shown an error toast and (in the
// old useFileStore.ts code) skipped refreshing the file list. The caller
// would then show a stale listing while uploads/deletes it thinks "failed"
// actually kept completing behind its back. Running every item to
// completion (success or failure) and reporting a summary afterward means
// the caller can always safely refresh once everything has actually
// settled, and partial failures don't leave the UI lying about what state
// the server is really in. Found + fixed 2026-08-25.
export async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0
  const errors: unknown[] = []
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++]
      try {
        await fn(item)
      } catch (e) {
        errors.push(e)
      }
    }
  })
  await Promise.all(workers)
  if (errors.length === items.length && errors.length > 0) {
    throw errors[0] // everything failed — surface the real first error, not a vague summary
  }
  if (errors.length > 0) {
    const first = errors[0]
    const firstMsg = first instanceof Error ? first.message : String(first)
    throw new Error(`${errors.length} из ${items.length} не выполнено (${firstMsg})`)
  }
}
