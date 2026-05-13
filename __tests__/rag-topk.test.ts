import * as fs from 'fs'
import * as path from 'path'

describe('Chat API top-K change (issue #67)', () => {
  const routePath = path.join(__dirname, '../app/api/chat/route.ts')
  let src: string

  beforeAll(() => {
    src = fs.readFileSync(routePath, 'utf-8')
  })

  it('calls searchSchools with topK = 10', () => {
    expect(src).toMatch(/searchSchools\(\s*question\s*,\s*10\s*\)/)
  })

  it('no longer uses topK = 5', () => {
    expect(src).not.toMatch(/searchSchools\(\s*question\s*,\s*5\s*\)/)
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
