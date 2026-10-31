/**
 * Issue #683: the candidate pool is sent as compact cards with the DBN in the
 * header, and picks that use those DBNs come back as reasons and sources.
 */

jest.mock('@anthropic-ai/sdk', () => jest.fn())
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }))
jest.mock('../lib/rag', () => ({ searchSchools: jest.fn() }))

import { buildPoolContext, buildAnswerResult, buildAskRequest } from '../lib/ask'

const pool = [
  { dbn: '01M001', name: 'Alpha High', card: 'Alpha card text', chunk: 'Alpha full chunk', score: 0.9 },
  { dbn: '02M002', name: 'Beta High', card: 'Beta card text', chunk: 'Beta full chunk', score: 0.8 },
  { dbn: '03M003', name: 'Gamma High', card: 'Gamma card text', chunk: 'Gamma full chunk', score: 0.7 },
] as any[]

describe('buildPoolContext (issue #683)', () => {
  it('puts name and DBN in each header, uses card, omits similarity', () => {
    const ctx = buildPoolContext(pool)
    for (const s of pool) {
      expect(ctx).toContain(`${s.name} (DBN ${s.dbn})`)
      expect(ctx).toContain(s.card)
      expect(ctx).not.toContain(s.chunk)
    }
    expect(ctx).not.toContain('similarity')
  })

  it('end to end: picks using header DBNs yield reasons and ordered sources', () => {
    const ctx = buildPoolContext(pool)
    const dbns = [...ctx.matchAll(/\(DBN (\w+)\)/g)].map((m) => m[1])
    const picks = [dbns[2], dbns[0], dbns[1]].map((dbn) => ({ dbn, reason: 'fits' }))
    const message = {
      model: 'm',
      usage: {},
      content: [{ type: 'text', text: JSON.stringify({ off_topic: false, picks }) }],
    } as any

    const result = buildAnswerResult(message, 'q', pool)
    expect(result.reasons).toHaveLength(3)
    expect(result.sources.map((s) => s.dbn)).toEqual(['03M003', '01M001', '02M002'])
    expect(result.retrieved).toHaveLength(3)
  })

  it('request uses the candidate wording and the include-every-fit rule', () => {
    const req = buildAskRequest('q', 'ctx')
    expect(JSON.stringify(req.messages)).toContain('Here are candidate schools for this question:')
    expect(req.system).toContain('Include every school that fits')
    expect(req.system).toContain('Never predict, estimate, or imply how likely a student is to be admitted')
  })
})
