/**
 * __tests__/evals-gate.test.ts
 *
 * Issue #285: unit tests for the pure gating logic in evals/gate.ts —
 * missing-env detection, run naming, picking the last weekly baseline out
 * of a list of Langfuse dataset runs, and the >10-point regression check.
 * No network, no Langfuse client.
 */

import {
  findMissingEnvKeys,
  resolveTrigger,
  buildRunName,
  pickLatestWeeklyBaseline,
  computeRegressions,
  REQUIRED_EVAL_ENV_KEYS,
  REGRESSION_THRESHOLD_POINTS,
} from '../evals/gate'

describe('findMissingEnvKeys', () => {
  it('returns nothing when every required key is set', () => {
    const env: Record<string, string | undefined> = Object.fromEntries(
      REQUIRED_EVAL_ENV_KEYS.map((k) => [k, 'x'])
    )
    expect(findMissingEnvKeys(env)).toEqual([])
  })

  it('names every missing key, including Langfuse ones', () => {
    const env = { ANTHROPIC_API_KEY: 'x', OPENAI_API_KEY: 'x' }
    expect(findMissingEnvKeys(env)).toEqual(['EVAL_LANGFUSE_PUBLIC_KEY', 'EVAL_LANGFUSE_SECRET_KEY'])
  })

  it('treats an empty string as missing', () => {
    const env: Record<string, string | undefined> = Object.fromEntries(
      REQUIRED_EVAL_ENV_KEYS.map((k) => [k, 'x'])
    )
    env.EVAL_LANGFUSE_SECRET_KEY = ''
    expect(findMissingEnvKeys(env)).toEqual(['EVAL_LANGFUSE_SECRET_KEY'])
  })
})

describe('resolveTrigger', () => {
  it('recognizes weekly and pull_request', () => {
    expect(resolveTrigger('weekly')).toBe('weekly')
    expect(resolveTrigger('pull_request')).toBe('pull_request')
  })

  it('falls back to manual for anything else, including unset', () => {
    expect(resolveTrigger(undefined)).toBe('manual')
    expect(resolveTrigger('push')).toBe('manual')
  })
})

describe('buildRunName', () => {
  it('prefixes weekly runs with "weekly-"', () => {
    expect(buildRunName('weekly', '123')).toBe('weekly-123')
  })

  it('prefixes other triggers with their own name', () => {
    expect(buildRunName('pull_request', '456')).toBe('pull_request-456')
    expect(buildRunName('manual', '789')).toBe('manual-789')
  })
})

describe('pickLatestWeeklyBaseline', () => {
  const summaryA = { hallucination: { passed: 30, total: 30, rate: 1 } }
  const summaryB = { hallucination: { passed: 28, total: 30, rate: 28 / 30 } }

  it('returns null when there is no weekly run yet', () => {
    const runs = [{ name: 'pull_request-1', createdAt: '2026-09-20T06:00:00Z', metadata: { summary: summaryA } }]
    expect(pickLatestWeeklyBaseline(runs)).toBeNull()
  })

  it('picks the most recently created weekly run, ignoring PR runs', () => {
    const runs = [
      { name: 'weekly-1', createdAt: '2026-09-20T06:00:00Z', metadata: { summary: summaryA } },
      { name: 'pull_request-2', createdAt: '2026-09-21T12:00:00Z', metadata: { summary: summaryB } },
      { name: 'weekly-3', createdAt: '2026-09-21T06:00:00Z', metadata: { summary: summaryB } },
    ]
    expect(pickLatestWeeklyBaseline(runs)).toEqual(summaryB)
  })

  it('returns null when the latest weekly run has no summary metadata', () => {
    const runs = [{ name: 'weekly-1', createdAt: '2026-09-20T06:00:00Z', metadata: {} }]
    expect(pickLatestWeeklyBaseline(runs)).toBeNull()
  })
})

describe('computeRegressions', () => {
  const gatingScorers = ['hallucination', 'noAdmissionsOddsLanguage']

  it('returns nothing when there is no baseline', () => {
    const current = { coverage: { passed: 20, total: 30, rate: 20 / 30 } }
    expect(computeRegressions(current, null, gatingScorers)).toEqual([])
  })

  it('ignores gating scorers, which are already checked at 100% elsewhere', () => {
    const baseline = { hallucination: { passed: 30, total: 30, rate: 1 } }
    const current = { hallucination: { passed: 0, total: 30, rate: 0 } }
    expect(computeRegressions(current, baseline, gatingScorers)).toEqual([])
  })

  it('passes a drop of 10 points or less', () => {
    const baseline = { coverage: { passed: 30, total: 30, rate: 1 } }
    const current = { coverage: { passed: 27, total: 30, rate: 0.9 } }
    expect(computeRegressions(current, baseline, gatingScorers)).toEqual([])
  })

  it('flags a scorer that drops more than 10 points below the weekly baseline', () => {
    const baseline = { coverage: { passed: 30, total: 30, rate: 1 } }
    const current = { coverage: { passed: 26, total: 30, rate: 26 / 30 } }
    const regressions = computeRegressions(current, baseline, gatingScorers)
    expect(regressions).toHaveLength(1)
    expect(regressions[0]).toContain('coverage')
  })

  it('uses the configured threshold constant', () => {
    expect(REGRESSION_THRESHOLD_POINTS).toBe(10)
  })
})
