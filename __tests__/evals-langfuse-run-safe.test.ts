/**
 * __tests__/evals-langfuse-run-safe.test.ts
 *
 * Issue #455: recording an eval run to Langfuse is observability, not the
 * gate. Run 36037 on PR #452 crashed with a 401 from expired
 * EVAL_LANGFUSE_PUBLIC_KEY/SECRET_KEY credentials — the eval's own cases all
 * scored fine, but the whole process exited 1 anyway because the telemetry
 * write threw. recordEvalRunSafely (evals/langfuse-run.ts) must swallow any
 * Langfuse failure — whether it happens while recording the run or while
 * fetching the weekly baseline afterwards — log exactly one warning, and
 * hand back `ok: false` so the caller can skip baseline comparison without
 * touching the eval's exit code, which is decided by case results alone.
 */

const createDataset = jest.fn()
const createDatasetItem = jest.fn()
const trace = jest.fn()
const createDatasetRunItem = jest.fn()
const flushAsync = jest.fn()
const getDatasetRuns = jest.fn()

jest.mock('langfuse', () => ({
  Langfuse: jest.fn().mockImplementation(() => ({
    createDataset,
    createDatasetItem,
    trace,
    createDatasetRunItem,
    flushAsync,
    getDatasetRuns,
  })),
}))

import { recordEvalRunSafely, LANGFUSE_FAILURE_WARNING } from '../evals/langfuse-run'
import type { LangfuseCaseResult } from '../evals/langfuse-run'

function makeResults(n: number): LangfuseCaseResult[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `ask-${i}`,
    kind: 'general',
    question: `question ${i}`,
    guardrail: 'none',
    scores: { hallucination: { pass: true } },
  }))
}

const baseParams = {
  runName: 'pull_request-123',
  trigger: 'pull_request' as const,
  commitSha: 'abc123',
  summary: { hallucination: { passed: 3, total: 3, rate: 1 } },
}

describe('recordEvalRunSafely', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.EVAL_LANGFUSE_PUBLIC_KEY = 'test-public'
    process.env.EVAL_LANGFUSE_SECRET_KEY = 'test-secret'
    createDataset.mockResolvedValue(undefined)
    createDatasetItem.mockResolvedValue(undefined)
    trace.mockReturnValue({ id: 'trace-id', score: jest.fn() })
    createDatasetRunItem.mockResolvedValue(undefined)
    flushAsync.mockResolvedValue(undefined)
    getDatasetRuns.mockResolvedValue({ data: [] })
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('does not throw and does not change the exit path when recording itself is rejected (401)', async () => {
    createDataset.mockRejectedValue(new Error('401: Unauthorized'))
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})

    const results = makeResults(3)
    const outcome = await recordEvalRunSafely({ ...baseParams, results }, true)

    expect(outcome).toEqual({ ok: false, baseline: null })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(LANGFUSE_FAILURE_WARNING)
    warn.mockRestore()
  })

  it('logs the warning once, not once per case, when a later case in the loop fails', async () => {
    // First two dataset items succeed, the third rejects like a mid-run 401.
    createDatasetItem
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('401: Unauthorized'))
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})

    const results = makeResults(5)
    const outcome = await recordEvalRunSafely({ ...baseParams, results }, true)

    expect(outcome.ok).toBe(false)
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('does not throw when recording succeeds but the baseline fetch is rejected (401)', async () => {
    getDatasetRuns.mockRejectedValue(new Error('401: Unauthorized'))
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const log = jest.spyOn(console, 'log').mockImplementation(() => {})

    const results = makeResults(2)
    const outcome = await recordEvalRunSafely({ ...baseParams, results }, true)

    expect(outcome).toEqual({ ok: false, baseline: null })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(LANGFUSE_FAILURE_WARNING)
    warn.mockRestore()
    log.mockRestore()
  })

  it('returns the fetched baseline and ok:true when everything succeeds', async () => {
    const baseline = { hallucination: { passed: 30, total: 30, rate: 1 } }
    getDatasetRuns.mockResolvedValue({
      data: [{ name: 'weekly-1', createdAt: '2026-09-20T06:00:00Z', metadata: { summary: baseline } }],
    })
    const log = jest.spyOn(console, 'log').mockImplementation(() => {})

    const results = makeResults(1)
    const outcome = await recordEvalRunSafely({ ...baseParams, results }, true)

    expect(outcome).toEqual({ ok: true, baseline })
    log.mockRestore()
  })

  it('skips the baseline fetch entirely when fetchBaseline is false, e.g. non-PR triggers', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {})

    const results = makeResults(1)
    const outcome = await recordEvalRunSafely({ ...baseParams, results }, false)

    expect(outcome).toEqual({ ok: true, baseline: null })
    expect(getDatasetRuns).not.toHaveBeenCalled()
    log.mockRestore()
  })
})
