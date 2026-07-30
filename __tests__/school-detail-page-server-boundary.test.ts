import fs from 'fs'
import path from 'path'
import ts from 'typescript'

// ── Server/client boundary guard (issue #132) ───────────────────────────────
// /school/[dbn] shipped as a 500 in production: page.tsx is a Server
// Component that imported `trackLabel`, a named export from FindRail.tsx (a
// 'use client' module), and called it during server render. Next.js replaces
// every export of a 'use client' module with a client-reference object when
// it's imported from server code, so calling it as a plain function throws
// "object is not a function" — and unit tests that only exercise the util
// functions directly never see this, because they never import through the
// page module the way Next.js's server renderer does.
//
// This test parses the page's real import graph and fails if it imports any
// named (non-default, non-type-only) runtime value from a module marked
// 'use client'. Default imports are exempt: rendering a Client Component via
// `<ClientThing />` from a Server Component is the standard, supported RSC
// pattern (see SchoolDetailClient below) and is not the bug class here.

const REPO_ROOT = path.resolve(__dirname, '..')
const PAGE_PATH = path.join(REPO_ROOT, 'app/school/[dbn]/page.tsx')

function hasUseClientDirective(filePath: string): boolean {
  const content = fs.readFileSync(filePath, 'utf-8')
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('//')) continue
    return line === "'use client'" || line === '"use client"' || line === "'use client';" || line === '"use client";'
  }
  return false
}

function resolveModule(fromFile: string, specifier: string): string | null {
  let base: string
  if (specifier.startsWith('@/')) {
    base = path.join(REPO_ROOT, specifier.slice(2))
  } else if (specifier.startsWith('.')) {
    base = path.join(path.dirname(fromFile), specifier)
  } else {
    return null // external package — not part of this repo's server/client boundary
  }

  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ]
  return candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) ?? null
}

interface Violation {
  specifier: string
  resolvedFile: string
  importedNames: string[]
}

function findClientValueImports(pageFile: string): Violation[] {
  const source = fs.readFileSync(pageFile, 'utf-8')
  const sourceFile = ts.createSourceFile(pageFile, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const violations: Violation[] = []

  sourceFile.forEachChild((node) => {
    if (!ts.isImportDeclaration(node)) return
    if (!ts.isStringLiteral(node.moduleSpecifier)) return
    const specifier = node.moduleSpecifier.text

    const clause = node.importClause
    if (!clause || clause.isTypeOnly) return // type-only imports can't hold a runtime value

    const resolved = resolveModule(pageFile, specifier)
    if (!resolved || !hasUseClientDirective(resolved)) return

    const importedNames: string[] = []
    const bindings = clause.namedBindings
    if (bindings && ts.isNamespaceImport(bindings)) {
      importedNames.push(`* as ${bindings.name.text}`)
    } else if (bindings && ts.isNamedImports(bindings)) {
      for (const el of bindings.elements) {
        if (el.isTypeOnly) continue
        importedNames.push(el.name.text)
      }
    }
    // Default imports (the Client Component itself, rendered as JSX) are the
    // sanctioned RSC pattern and are intentionally not flagged.

    if (importedNames.length > 0) {
      violations.push({ specifier, resolvedFile: resolved, importedNames })
    }
  })

  return violations
}

describe("school/[dbn] page: server/client import boundary", () => {
  it('page.tsx is itself a Server Component (no top-level "use client")', () => {
    expect(hasUseClientDirective(PAGE_PATH)).toBe(false)
  })

  it('imports no named runtime value from a module marked \'use client\'', () => {
    const violations = findClientValueImports(PAGE_PATH)
    expect(violations).toEqual([])
  })
})
