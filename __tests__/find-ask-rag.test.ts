import * as fs from 'fs'
import * as path from 'path'

const srcPath = path.join(__dirname, '../app/find/FindClient.tsx')
let src: string

beforeAll(() => {
  src = fs.readFileSync(srcPath, 'utf-8')
})

describe('/find ask box wired to conversational RAG (issue #110)', () => {
  it('still runs the deterministic soft-annotation pass (unchanged from #108)', () => {
    expect(src).toContain('extractFilters(askText)')
    expect(src).toContain('getUnmetCriteria')
  })

  it('POSTs the question to the existing /api/chat route', () => {
    expect(src).toContain("'/api/chat'")
    expect(src).toContain("method: 'POST'")
    expect(src).toMatch(/JSON\.stringify\(\s*\{\s*question/)
  })

  it('does not introduce a new LLM/RAG route', () => {
    expect(src).not.toMatch(/fetch\(\s*['"]\/api\/(?!chat)/)
  })

  it('tracks loading state for the grounded answer', () => {
    expect(src).toMatch(/askLoading/)
  })

  it('tracks an error state for the grounded answer and handles 429', () => {
    expect(src).toMatch(/askAnswerError/)
    expect(src).toContain('429')
  })

  it('renders the grounded answer and its sources', () => {
    expect(src).toMatch(/askAnswer/)
    expect(src).toMatch(/askSources/)
    expect(src).toContain('Sources')
  })

  it('never removes schools based on the ask box (hard filters stay separate)', () => {
    expect(src).toContain('hardFiltered')
    // The ranked list is still built from hardFiltered, not from the RAG answer.
    expect(src).toMatch(/hardFiltered\.map/)
  })
})

describe('/find page and other surfaces remain untouched (issue #110 scope)', () => {
  it('does not add a nav link to /find', () => {
    const layoutFiles = ['../components/Footer.tsx', '../app/layout.tsx']
      .map((p) => path.join(__dirname, p))
      .filter((p) => fs.existsSync(p))
    for (const file of layoutFiles) {
      const content = fs.readFileSync(file, 'utf-8')
      expect(content).not.toMatch(/href=["']\/find["']/)
    }
  })
})
