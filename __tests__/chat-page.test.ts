import * as fs from 'fs'
import * as path from 'path'

const srcPath = path.join(__dirname, '../app/chat/page.tsx')
let src: string

beforeAll(() => {
  src = fs.readFileSync(srcPath, 'utf-8')
})

describe('Chat page exists and is a client component (issue #66)', () => {
  it('file exists at app/chat/page.tsx', () => {
    expect(fs.existsSync(srcPath)).toBe(true)
  })

  it("starts with 'use client' directive", () => {
    expect(src.startsWith("'use client'")).toBe(true)
  })

  it('exports a default React component', () => {
    expect(src).toContain('export default function')
  })
})

describe('Chat page UI elements (issue #66)', () => {
  it('renders a text input (textarea or input) for the question', () => {
    expect(/<(textarea|input)\b/.test(src)).toBe(true)
  })

  it('renders a submit button', () => {
    expect(src).toContain('type="submit"')
  })

  it('renders an answer section', () => {
    expect(src).toContain('Answer')
  })

  it('renders a sources section', () => {
    expect(src).toContain('Sources')
  })
})

describe('Chat page state management (issue #66)', () => {
  it('uses React useState for question, answer, sources, loading, and error', () => {
    expect(src).toContain('useState')
    expect(src).toMatch(/setQuestion|question.*useState/i)
    expect(src).toMatch(/setAnswer|answer.*useState/i)
    expect(src).toMatch(/setSources|sources.*useState/i)
    expect(src).toMatch(/setLoading|loading.*useState/i)
    expect(src).toMatch(/setError|error.*useState/i)
  })

  it('has a loading state indicator', () => {
    expect(/loading/i.test(src)).toBe(true)
  })

  it('has an error state indicator', () => {
    expect(src).toContain('error')
  })
})

describe('Chat page API integration (issue #66)', () => {
  it('POSTs to /api/chat', () => {
    expect(src).toContain("'/api/chat'")
    expect(src).toContain("method: 'POST'")
  })

  it('sends question in JSON body', () => {
    expect(src).toMatch(/JSON\.stringify\(\s*\{\s*question/)
  })

  it('sets Content-Type to application/json', () => {
    expect(src).toContain("'Content-Type': 'application/json'")
  })

  it('parses JSON response', () => {
    expect(src).toContain('res.json()')
  })

  it('handles non-ok responses', () => {
    expect(src).toContain('res.ok')
  })
})

describe('Chat page source rendering (issue #66)', () => {
  it('renders source name', () => {
    expect(src).toMatch(/s\.name|source\.name|src\.name/)
  })

  it('renders source borough', () => {
    expect(src).toMatch(/s\.borough|source\.borough/)
  })

  it('renders source similarity score', () => {
    expect(src).toMatch(/s\.score|source\.score/)
  })

  it('formats similarity score with toFixed', () => {
    expect(src).toContain('toFixed(')
  })

  it('maps over sources array', () => {
    expect(src).toMatch(/sources\.map/)
  })
})

describe('Chat page styling (issue #66)', () => {
  it('uses Tailwind classes consistent with the app', () => {
    expect(src).toContain('max-w-2xl')
    expect(src).toContain('mx-auto')
  })

  it('uses gray-900 button styling matching the home page', () => {
    expect(src).toContain('bg-gray-900')
  })
})
