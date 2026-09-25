/**
 * __tests__/evals-batch.test.ts
 *
 * Issue #450: evals/batch.ts is what lets evals/run-ask-eval.ts submit the
 * 30 ask-eval cases through the Anthropic Batch API. Two things are easy to
 * get subtly wrong here: matching results back to cases (batch results are
 * not returned in request order — must key by custom_id, never position),
 * and polling forever instead of failing cleanly if a batch never ends.
 */

import { indexBatchResultsByCustomId, pollBatchUntilEnded } from '../evals/batch'

describe('indexBatchResultsByCustomId (issue #450)', () => {
  it('keys results by custom_id, not by array position', () => {
    const items = [
      { custom_id: 'ask-002', result: { type: 'succeeded', message: { id: 'msg-2' } } },
      { custom_id: 'ask-001', result: { type: 'succeeded', message: { id: 'msg-1' } } },
    ] as any

    const byCustomId = indexBatchResultsByCustomId(items)

    // If this were keyed by index, byCustomId['ask-001'] would resolve to
    // items[0] (msg-2) instead of the item that actually carries that id.
    expect(byCustomId['ask-001']).toEqual({ type: 'succeeded', message: { id: 'msg-1' } })
    expect(byCustomId['ask-002']).toEqual({ type: 'succeeded', message: { id: 'msg-2' } })
  })

  it('returns an empty map for no results', () => {
    expect(indexBatchResultsByCustomId([])).toEqual({})
  })
})

describe('pollBatchUntilEnded (issue #450)', () => {
  it('keeps polling while in_progress and returns once the batch ends', async () => {
    const retrieve = jest
      .fn()
      .mockResolvedValueOnce({ id: 'batch_1', processing_status: 'in_progress' })
      .mockResolvedValueOnce({ id: 'batch_1', processing_status: 'in_progress' })
      .mockResolvedValueOnce({ id: 'batch_1', processing_status: 'ended' })
    const sleep = jest.fn().mockResolvedValue(undefined)

    const result = await pollBatchUntilEnded({ retrieve, sleep, intervalMs: 1000 })

    expect(result).toEqual({ id: 'batch_1', processing_status: 'ended' })
    expect(retrieve).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(1000)
  })

  it('fails cleanly instead of hanging once the batch never ends within the timeout', async () => {
    const retrieve = jest.fn().mockResolvedValue({ id: 'batch_1', processing_status: 'in_progress' })
    let elapsed = 0
    const sleep = jest.fn(async (ms: number) => {
      elapsed += ms
    })

    await expect(
      pollBatchUntilEnded({
        retrieve,
        sleep,
        intervalMs: 1000,
        timeoutMs: 2000,
        now: () => elapsed,
      })
    ).rejects.toThrow(/did not finish within/)
  })
})
