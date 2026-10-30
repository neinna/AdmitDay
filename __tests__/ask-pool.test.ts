jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }))
jest.mock('../lib/rag', () => ({ searchSchools: jest.fn() }))

import { buildPoolContext, buildAnswerResult, ASK_POOL_COUNT } from '../lib/ask'

const mk = (dbn: string, name: string) => ({
  dbn,
  name,
  borough: 'Bronx',
  score: 0.5,
  matchedChunkType: 'focus',
  chunk: `FULLCHUNK ${name}`,
  card: `CARD ${name}`,
  metadata: {},
})
const results = [mk('10X445', 'Bronx Science'), mk('02M475', 'Stuyvesant'), mk('13K430', 'Brooklyn Tech')] as any

const msg = (text: string) =>
  ({ model: 'm', usage: {}, stop_reason: 'end_turn', content: [{ type: 'text', text }] }) as any

describe('buildPoolContext (issue #649)', () => {
  it('names each school and DBN in the header, uses card, omits similarity', () => {
    const ctx = buildPoolContext(results)
    for (const r of results) {
      expect(ctx).toContain(`DBN ${r.dbn}`)
      expect(ctx).toContain(r.name)
      expect(ctx).toContain(r.card)
    }
    expect(ctx).not.toContain('FULLCHUNK')
    expect(ctx).not.toContain('similarity')
  })

  it('pool is 60', () => expect(ASK_POOL_COUNT).toBe(60))
})

describe('buildAnswerResult with pool (issue #649)', () => {
  it('parses one DBN | reason line per DBN taken from the context headers', () => {
    const dbns = [...buildPoolContext(results).matchAll(/\(DBN (\w+)\)/g)].map((m) => m[1])
    const out = buildAnswerResult(msg(dbns.map((d) => `${d} | reason for ${d}`).join('\n')), 'q', results)
    expect(out.reasons).toHaveLength(3)
  })

  it('sources follow reasons order and exclude unchosen schools', () => {
    const out = buildAnswerResult(msg('13K430 | a\n10X445 | b'), 'q', results)
    expect(out.sources.map((s) => s.dbn)).toEqual(['13K430', '10X445'])
    expect(out.retrieved).toHaveLength(3)
  })
})
