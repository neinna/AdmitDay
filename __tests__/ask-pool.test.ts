/**
 * Issue #645: Claude picks and orders from a pool; context uses the short
 * card and sources follow the reasons.
 */

jest.mock('@anthropic-ai/sdk', () => jest.fn())
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }))
jest.mock('../lib/rag', () => ({ searchSchools: jest.fn() }))

import { buildPoolContext, buildAnswerResult, buildAskRequest } from '../lib/ask'

const pool = ['01M001', '02M002', '03M003'].map((dbn, i) => ({
  dbn,
  name: `School ${i}`,
  borough: 'Manhattan',
  score: 0.5,
  matchedChunkType: 'identity',
  chunk: `FULL ${dbn}`,
  card: `CARD ${dbn}`,
}))

const message = (text: string) =>
  ({ model: 'm', usage: {}, stop_reason: 'end_turn', content: [{ type: 'text', text }] }) as any

describe('buildPoolContext', () => {
  it('uses the card and omits similarity', () => {
    const ctx = buildPoolContext(pool as any)
    expect(ctx).toContain('--- School 1 ---\nCARD 01M001')
    expect(ctx).not.toContain('FULL')
    expect(ctx).not.toContain('similarity')
  })
})

describe('buildAnswerResult sources', () => {
  it('follows reasons order and excludes unchosen schools', () => {
    const r = buildAnswerResult(
      message('03M003 | Strong results.\n01M001 | Math focus.'),
      'math',
      pool as any
    )
    expect(r.sources.map((s) => s.dbn)).toEqual(['03M003', '01M001'])
    expect(r.retrieved).toHaveLength(3)
  })
})

describe('buildAskRequest', () => {
  it('says candidate schools', () => {
    const req = buildAskRequest('q', 'ctx')
    expect(JSON.stringify(req.messages)).toContain('Here are candidate schools for this question')
  })
})
