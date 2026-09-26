import fs from 'fs'
import path from 'path'

/**
 * Issue #137. Guards the two things that broke elsewhere today:
 *  1. A server component importing a runtime value from a 'use client' module
 *     (that shipped a 500 on /school/[dbn] — see #132).
 *  2. Shipping the full school dataset to the browser.
 */
const pageSrc = fs.readFileSync(path.join(__dirname, '../app/shortlist/page.tsx'), 'utf-8')
const clientSrc = fs.readFileSync(
  path.join(__dirname, '../app/shortlist/ShortlistClient.tsx'),
  'utf-8'
)
/**
 * Comments explain what the file deliberately does NOT do, so they legitimately
 * contain the vocabulary we're banning from user-facing output. Assert against
 * code only.
 */
const clientCode = clientSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('/shortlist server/client boundary', () => {
  it('keeps the page a server component', () => {
    expect(pageSrc).not.toMatch(/^['"]use client['"]/m)
  })

  it('marks the interactive part as a client component', () => {
    expect(clientSrc).toMatch(/^['"]use client['"]/m)
  })

  it('imports no runtime value from a client module into the page', () => {
    // Only the client component itself, plus server-safe libs.
    const imports = Array.from(pageSrc.matchAll(/from '([^']+)'/g)).map((m) => m[1])
    const clientModules = imports.filter((i) => i.includes('Client') && !i.includes('type'))
    expect(clientModules).toEqual(['./ShortlistClient'])
  })

  it('ships a slim index rather than full school records', () => {
    // A whole School carries doe_data and programs; those must not cross.
    expect(pageSrc).toMatch(/ListSchool\[\]/)
    expect(pageSrc).not.toMatch(/index:\s*School\[\]/)
  })
})

describe('/shortlist makes no derived judgement', () => {
  it('uses no reach/target/likely or odds language', () => {
    expect(clientCode).not.toMatch(/reach school|target school|safety school|\bodds\b|chance of|likely to get/i)
    expect(clientCode).not.toMatch(/\brisky\b|\bbalanced\b/i)
  })

  it('never renders a missing ratio as zero or a dash', () => {
    // Issue #422 replaced the "Not reported" sentence with a compact `n/a` marker.
    // Issue #471 moved that marker into the shared MissingMark component.
    expect(clientSrc).toMatch(/<MissingMark\s+kind="not_reported"/)
  })

  it('renders no footer disclaimer lines', () => {
    // Issue #425 removed both footer lines; no replacement copy is owed by this change.
    expect(clientSrc).not.toMatch(/Confirm each program on the official listing before you apply/i)
    expect(clientSrc).not.toMatch(/don&rsquo;t score a list or predict an outcome/i)
  })
})
