import fs from 'fs'
import path from 'path'

// Issue #295: the starting point (ZIP or subway station) must never leave
// the browser. Source-scan every fetch body and analytics (posthog.capture)
// call site in the /find and /school client components for the commute
// module's exports, so a future change that threads it into a request can't
// land silently.
describe('starting point never appears in a fetch body or analytics call', () => {
  const files = [
    path.join(__dirname, '../app/find/FindClient.tsx'),
    path.join(__dirname, '../app/find/FindRail.tsx'),
    path.join(__dirname, '../app/school/[dbn]/SchoolDetailClient.tsx'),
  ].map((p) => fs.readFileSync(p, 'utf-8'))

  it('never passes startingPoint into a fetch() call', () => {
    for (const src of files) {
      for (const match of src.matchAll(/fetch\(([\s\S]*?)\)\s*(?:\.then|;|$)/gm)) {
        expect(match[1]).not.toMatch(/startingPoint/)
      }
    }
  })

  it('never passes startingPoint into a posthog.capture() call', () => {
    for (const src of files) {
      for (const match of src.matchAll(/posthog\?\.capture\(([\s\S]*?)\)\s*$/gm)) {
        expect(match[1]).not.toMatch(/startingPoint/)
      }
    }
  })

  it('the ask request body only ever includes question and filters, never startingPoint', () => {
    const findClient = files[0]
    const askCall = findClient.match(/fetch\('\/api\/find\/ask'[\s\S]*?body: JSON\.stringify\(([\s\S]*?)\),/)
    expect(askCall).not.toBeNull()
    expect(askCall![1]).not.toMatch(/startingPoint/)
  })
})
