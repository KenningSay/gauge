import { describe, it, expect } from 'vitest'
import { runPool, throwIfAnyFailed, CancelledError } from './pool'

describe('runPool', () => {
  it('runs every item to completion and reports them all as succeeded', async () => {
    const seen: number[] = []
    const result = await runPool([1, 2, 3, 4, 5], 2, async (n) => {
      seen.push(n)
    })
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5])
    expect(result.succeeded.sort()).toEqual([1, 2, 3, 4, 5])
    expect(result.failed).toEqual([])
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

  it('completes every item even when some fail, reporting succeeded/failed separately', async () => {
    const attempted: number[] = []
    const result = await runPool([1, 2, 3, 4], 2, async (n) => {
      attempted.push(n)
      if (n % 2 === 0) throw new Error(`boom ${n}`)
    })
    expect(attempted.sort()).toEqual([1, 2, 3, 4])
    expect(result.succeeded.sort()).toEqual([1, 3])
    expect(result.failed.map((f) => f.item).sort()).toEqual([2, 4])
  })

  it('resolves (does not throw) even when every item fails', async () => {
    const result = await runPool([1, 2], 2, async () => {
      throw new Error('all dead')
    })
    expect(result.succeeded).toEqual([])
    expect(result.failed).toHaveLength(2)
  })

  it('resolves cleanly on an empty list', async () => {
    const result = await runPool([], 3, async () => {})
    expect(result).toEqual({ succeeded: [], failed: [] })
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

describe('throwIfAnyFailed', () => {
  it('does not throw when nothing failed', () => {
    expect(() => throwIfAnyFailed({ succeeded: [1, 2], failed: [] }, 2)).not.toThrow()
  })

  it('throws the real error directly when every item failed', () => {
    const boom = new Error('all dead')
    expect(() => throwIfAnyFailed({ succeeded: [], failed: [{ item: 1, error: boom }] }, 1)).toThrow(boom)
  })

  it('throws a summary naming how many of how many failed on a partial failure', () => {
    const boom = new Error('boom 2')
    expect(() =>
      throwIfAnyFailed({ succeeded: [1, 3], failed: [{ item: 2, error: boom }] }, 3),
    ).toThrow(/1 из 3.*boom 2/)
  })
})
