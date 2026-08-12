// Runs fn over items with at most `limit` in flight at once — plain
// sequential await-in-a-loop for bulk WebDAV operations (upload/delete/move)
// means N items take N round trips end-to-end; this bounds concurrency
// instead of going fully parallel (which is what caused the double-fire
// MKCOL/PUT race in the folder-drop bug) or fully serial (slow).
export async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++]
      await fn(item)
    }
  })
  await Promise.all(workers)
}
