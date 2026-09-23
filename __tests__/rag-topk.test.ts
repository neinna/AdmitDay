import * as fs from 'fs'
import * as path from 'path'

describe('/find ask API top-K (issue #328: raised from 5 to a named ASK_RETRIEVAL_COUNT = 20)', () => {
  // Issue #284: the searchSchools call moved from the route into
  // lib/ask.ts's answerQuestion() as part of extracting the ask logic for
  // the eval runner. Same assertions, new home for the call they check.
  const routePath = path.join(__dirname, '../lib/ask.ts')
  let src: string

  beforeAll(() => {
    src = fs.readFileSync(routePath, 'utf-8')
  })

  it('exports ASK_RETRIEVAL_COUNT = 20', () => {
    expect(src).toMatch(/export const ASK_RETRIEVAL_COUNT\s*=\s*20/)
  })

  it('calls searchSchools with ASK_RETRIEVAL_COUNT, not a literal', () => {
    // issue #231: searchSchools also takes the active /find rail filters as a
    // third argument, so this now tolerates trailing args after the count.
    expect(src).toMatch(/searchSchools\(\s*question\s*,\s*ASK_RETRIEVAL_COUNT\s*[,)]/)
  })

  it('no longer uses a hardcoded topK literal (5 or 10)', () => {
    expect(src).not.toMatch(/searchSchools\(\s*question\s*,\s*(5|10)\s*[,)]/)
  })
})

describe('Chunks diagnostic script (issue #67)', () => {
  const scriptPath = path.join(__dirname, '../scripts/check-chunks.ts')
  let src: string

  beforeAll(() => {
    src = fs.readFileSync(scriptPath, 'utf-8')
  })

  it('exists at scripts/check-chunks.ts', () => {
    expect(fs.existsSync(scriptPath)).toBe(true)
  })

  it('reads data/school-embeddings.json', () => {
    expect(src).toContain('school-embeddings.json')
  })

  it('filters for "Brooklyn Technical" or "Brooklyn Tech"', () => {
    expect(src).toContain('Brooklyn Technical')
    expect(src).toContain('Brooklyn Tech')
  })

  it('prints chunkType and chunk length per chunk', () => {
    expect(src).toMatch(/chunkType/)
    expect(src).toMatch(/length/)
  })

  it('reports totals for single vs multi chunk schools', () => {
    expect(src).toMatch(/singleChunk/i)
    expect(src).toMatch(/multiChunk/i)
  })
})
