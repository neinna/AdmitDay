import * as fs from 'fs'
import * as path from 'path'
import { LAST_ASK_KEY } from '@/lib/school-list-utils'

/**
 * Issue #703 — Search restores the last ask from sessionStorage. This repo's
 * jest config has no jsdom/testing-library (see find-save-failure-handling),
 * so these are source-text assertions against app/find/FindClient.tsx.
 */
const src = fs.readFileSync(path.join(__dirname, '..', 'app/find/FindClient.tsx'), 'utf-8')

describe('last ask is written after a successful answer', () => {
  it('uses the shared key', () => {
    expect(LAST_ASK_KEY).toBe('admitday_find_last_ask')
  })

  const writeIdx = src.indexOf('sessionStorage.setItem(\n          LAST_ASK_KEY')
  it('writes the six fields inside try/catch', () => {
    expect(writeIdx).toBeGreaterThan(-1)
    const block = src.slice(writeIdx, writeIdx + 400)
    for (const f of ['question: trimmed', 'filters,', 'askFilters: extractFilters(askText)', 'answer:', 'sources,', 'reasons,', 'traceId:']) {
      expect(block).toContain(f)
    }
    expect(src.slice(writeIdx - 20, writeIdx)).toContain('try {')
  })

  it('writes only after the 429 and !res.ok branches have returned/thrown', () => {
    expect(writeIdx).toBeGreaterThan(src.indexOf('res.status === 429'))
    expect(writeIdx).toBeGreaterThan(src.indexOf('if (!res.ok)'))
    expect(writeIdx).toBeGreaterThan(src.indexOf('if (!trimmed) return'))
    expect(src.match(/setItem\(\s*LAST_ASK_KEY/g)).toHaveLength(1)
  })
})

describe('last ask is restored on mount', () => {
  const readIdx = src.indexOf('sessionStorage.getItem(LAST_ASK_KEY)')
  const block = src.slice(readIdx, readIdx + 900)

  it('compares stored filters with the URL filters before restoring', () => {
    expect(readIdx).toBeGreaterThan(-1)
    expect(block.indexOf('findFiltersToQueryString(saved.filters)')).toBeGreaterThan(-1)
    expect(block.indexOf('return', block.indexOf('!==')))
      .toBeLessThan(block.indexOf('setAskText(saved.question)'))
  })

  it('restores ask text and the six ask states without fetching or capturing', () => {
    for (const s of ['setAskText', 'setAskFilters', 'setAskAnswer', 'setAskSources', 'setAskReasons', 'setAskTraceId']) {
      expect(block).toContain(s)
    }
    expect(block).not.toContain('fetch(')
    expect(block).not.toContain('capture(')
    expect(block).not.toContain('removeItem')
  })
})
