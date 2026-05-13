import * as fs from 'fs'
import * as path from 'path'

describe('Chat API system prompt (issue #69)', () => {
  const routePath = path.join(__dirname, '../app/api/chat/route.ts')
  let src: string

  beforeAll(() => {
    src = fs.readFileSync(routePath, 'utf-8')
  })

  it('uses the new "experienced NYC high school admissions consultant" prompt', () => {
    expect(src).toContain(
      'You are an experienced NYC high school admissions consultant.'
    )
  })

  it('instructs to describe every school provided', () => {
    expect(src).toContain('Describe every school provided. Do not skip any.')
  })

  it('forbids hedging language', () => {
    expect(src).toContain("Never say 'appears to', 'seems to'")
  })

  it('requires a 1-2 sentence summary at the end', () => {
    expect(src).toContain(
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
