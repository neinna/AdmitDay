/**
 * Issue #532: evals/langfuse-run.ts records eval runs through @langfuse/client.
 */

const createDataset = jest.fn()
const createDatasetItem = jest.fn()
const ingestionBatch = jest.fn()
const scoreCreate = jest.fn()
const createDatasetRunItem = jest.fn()
const flush = jest.fn()
const getDatasetRuns = jest.fn()

jest.mock('@langfuse/client', () => ({
  LangfuseClient: jest.fn().mockImplementation(() => ({
    api: {
      datasets: { create: createDataset, getRuns: getDatasetRuns },
      datasetItems: { create: createDatasetItem },
      datasetRunItems: { create: createDatasetRunItem },
      ingestion: { batch: ingestionBatch },
    },
    score: { create: scoreCreate },
    flush,
  })),
}))

import { recordEvalRunSafely, LANGFUSE_FAILURE_WARNING } from '../evals/langfuse-run'
import type { LangfuseCaseResult } from '../evals/langfuse-run'

const results: LangfuseCaseResult[] = [0, 1].map((i) => ({
  id: `ask-${i}`,
  kind: 'general',
  question: `q${i}`,
  guardrail: 'none',
  scores: { hallucination: { pass: true }, grounding: { pass: false, detail: 'bad' } },
}))

const params = {
  runName: 'pull_request-1',
  trigger: 'pull_request' as const,
  commitSha: 'abc',
  summary: { hallucination: { passed: 2, total: 2, rate: 1 } },
}

describe('recordDatasetRun via @langfuse/client', () => {
  const originalEnv = { ...process.env }
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.EVAL_LANGFUSE_PUBLIC_KEY = 'pk'
    process.env.EVAL_LANGFUSE_SECRET_KEY = 'sk'
    for (const f of [createDataset, createDatasetItem, ingestionBatch, createDatasetRunItem, flush]) {
      f.mockResolvedValue(undefined)
    }
    getDatasetRuns.mockResolvedValue({ data: [] })
    jest.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    process.env = { ...originalEnv }
    jest.restoreAllMocks()
  })

  it('writes items, scores and run items linked by a 32-hex trace id', async () => {
    const outcome = await recordEvalRunSafely({ ...params, results }, false)

    expect(outcome.ok).toBe(true)
    expect(createDatasetItem).toHaveBeenCalledTimes(2)
    expect(scoreCreate).toHaveBeenCalledTimes(4)
    expect(createDatasetRunItem).toHaveBeenCalledTimes(2)
    expect(ingestionBatch).toHaveBeenCalledTimes(2)
    expect(flush).toHaveBeenCalledTimes(1)

    createDatasetRunItem.mock.calls.forEach(([arg], i) => {
      expect(arg.traceId).toMatch(/^[0-9a-f]{32}$/)
      const scoreTraceIds = scoreCreate.mock.calls
        .map(([s]) => s)
        .filter((s) => s.traceId === arg.traceId)
      expect(scoreTraceIds).toHaveLength(2)
      const event = ingestionBatch.mock.calls[i][0].batch[0]
      expect(event.type).toBe('trace-create')
      expect(event.body.id).toBe(arg.traceId)
      expect(event.body.name).toBe(`ask-eval:ask-${i}`)
    })
  })

  it('does not write a score for a skipped scorer', async () => {
    const skipped = [{ ...results[0], scores: { a: { pass: true }, b: { pass: true, skipped: true } } }]
    await recordEvalRunSafely({ ...params, results: skipped }, false)
    expect(scoreCreate).toHaveBeenCalledTimes(1)
    expect(scoreCreate.mock.calls[0][0].name).toBe('a')
  })

  it('treats a 409 from datasets.create as success', async () => {
    createDataset.mockRejectedValue({ statusCode: 409 })
    const outcome = await recordEvalRunSafely({ ...params, results }, false)
    expect(outcome.ok).toBe(true)
    expect(createDatasetRunItem).toHaveBeenCalledTimes(2)
  })

  it('returns ok:false and warns once on a 401', async () => {
    createDataset.mockRejectedValue({ statusCode: 401 })
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const outcome = await recordEvalRunSafely({ ...params, results }, true)
    expect(outcome).toEqual({ ok: false, baseline: null })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(LANGFUSE_FAILURE_WARNING)
  })
})
