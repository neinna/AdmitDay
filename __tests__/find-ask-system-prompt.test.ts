import * as fs from 'fs'
import * as path from 'path'

describe('/find ask API system prompt (issue #69)', () => {
  // Issue #284: the system prompt moved from the route into lib/ask.ts's
  // answerQuestion() as part of extracting the ask logic for the eval
  // runner. Same assertions, new home for the string they check.
  const promptPath = path.join(__dirname, '../lib/ask.ts')
  let src: string

  beforeAll(() => {
    src = fs.readFileSync(promptPath, 'utf-8')
  })

  it('uses the new "experienced NYC high school admissions consultant" prompt', () => {
    expect(src).toContain(
      'You are an experienced NYC high school admissions consultant.'
    )
  })

  it('instructs one "DBN | reason" line per school, in order, nothing else (issue #328)', () => {
    expect(src).toContain(
      'output exactly one line in the form DBN | reason'
    )
    expect(src).toContain('Output one line per school provided, in the order provided, and nothing else')
  })

  it('forbids hedging language', () => {
    expect(src).toContain("Never say 'appears to', 'seems to'")
  })

  it('no longer asks for a prose summary after describing all schools (issue #328)', () => {
    expect(src).not.toContain(
      'After describing all schools, provide a 1-2 sentence summary.'
    )
  })

  it('no longer uses the old "helpful NYC high school admissions assistant" prompt', () => {
    expect(src).not.toContain(
      'You are a helpful NYC high school admissions assistant.'
    )
  })

  it('no longer uses the old "3-5 sentences" instruction', () => {
    expect(src).not.toMatch(/3-5 sentences/)
  })
})
