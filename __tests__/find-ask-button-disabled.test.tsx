import * as fs from 'fs'
import * as path from 'path'
import {
  EMPTY_FIND_FILTERS,
  findFiltersToQueryString,
  isRepeatAsk,
} from '@/lib/school-list-utils'

// No jsdom in this repo's jest config: the rule is run as a function, and the
// wiring in FindClient is checked against its source.
const src = fs.readFileSync(path.join(__dirname, '..', 'app/find/FindClient.tsx'), 'utf-8')

const asked = {
  question: 'strong CS',
  filtersQs: findFiltersToQueryString(EMPTY_FIND_FILTERS),
}

describe('Find schools button after an answer', () => {
  it('is disabled when text and filters are unchanged', () => {
    expect(isRepeatAsk(asked, 'strong CS', EMPTY_FIND_FILTERS)).toBe(true)
    expect(isRepeatAsk(asked, '  strong CS  ', EMPTY_FIND_FILTERS)).toBe(true)
  })

  it('typing a character enables it, deleting it disables it again', () => {
    expect(isRepeatAsk(asked, 'strong CSx', EMPTY_FIND_FILTERS)).toBe(false)
    expect(isRepeatAsk(asked, 'strong CS', EMPTY_FIND_FILTERS)).toBe(true)
  })

  it('changing a rail filter enables it', () => {
    const changed = { ...EMPTY_FIND_FILTERS, boroughs: ['Brooklyn'] } as typeof EMPTY_FIND_FILTERS
    expect(findFiltersToQueryString(changed)).not.toBe(asked.filtersQs)
    expect(isRepeatAsk(asked, 'strong CS', changed)).toBe(false)
  })
})

describe('before any ask', () => {
  it('is enabled', () => {
    expect(isRepeatAsk(null, 'strong CS', EMPTY_FIND_FILTERS)).toBe(false)
  })
})

describe('FindClient wiring', () => {
  it('disables the submit button on loading or a repeat ask', () => {
    expect(src).toContain('disabled={askLoading || isRepeatAsk(lastAsked, askText, filters)}')
  })

  it('sets lastAsked after a successful answer and on restore', () => {
    expect(src.match(/setLastAsked\(\{/g)).toHaveLength(2)
    expect(src.indexOf('setLastAsked({ question: trimmed')).toBeGreaterThan(src.indexOf('if (!res.ok)'))
  })
})
