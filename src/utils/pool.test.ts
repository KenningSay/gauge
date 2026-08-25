import { describe, it, expect } from 'vitest'
import { runPool, CancelledError } from './pool'

describe('runPool', () => {
  it('runs every item to completion', async () => {
    const seen: number[] = []
    await runPool([1, 2, 3, 4, 5], 2, async (n) => {
      seen.push(n)
    })
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5])
  })

  it('never exceeds the concurrency limit', async () => {
    let active = 0
    let maxActive = 0
    await runPool(Array.from({ length: 10 }, (_, i) => i), 3, async () => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise((r) => setTimeout(r, 5))
      active--
    })
    expect(maxActive).toBeLessThanOrEqual(3)
  })

  it('completes every item even when some fail, then throws a summary', async () => {
    const attempted: number[] = []
    await expect(
      runPool([1, 2, 3, 4], 2, async (n) => {
        attempted.push(n)
        if (n % 2 === 0) throw new Error(`boom ${n}`)
      }),
    ).rejects.toThrow(/2 из 4/)
    expect(attempted.sort()).toEqual([1, 2, 3, 4])
  })

  it('throws the real error directly when every item fails', async () => {
    await expect(
      runPool([1, 2], 2, async () => {
        throw new Error('all dead')
      }),
    ).rejects.toThrow('all dead')
  })

  it('resolves cleanly on an empty list', async () => {
    await expect(runPool([], 3, async () => {})).resolves.toBeUndefined()
  })

  it('stops picking up new items once the signal aborts, and throws CancelledError', async () => {
    const controller = new AbortController()
    const started: number[] = []
    const promise = runPool([1, 2, 3, 4, 5, 6], 1, async (n) => {
      started.push(n)
      if (n === 2) controller.abort()
      await new Promise((r) => setTimeout(r, 1))
    }, controller.signal)

    await expect(promise).rejects.toBeInstanceOf(CancelledError)
    // With concurrency 1, aborting mid-item-2 should stop before item 3 ever starts.
    expect(started).toEqual([1, 2])
  })

  it('throws CancelledError even if an already-aborted signal is passed up front', async () => {
    const controller = new AbortController()
    controller.abort()
    const seen: number[] = []
    await expect(
      runPool([1, 2, 3], 2, async (n) => { seen.push(n) }, controller.signal),
    ).rejects.toBeInstanceOf(CancelledError)
    expect(seen).toEqual([])
  })
})
