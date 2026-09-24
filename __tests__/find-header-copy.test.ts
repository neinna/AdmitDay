/**
 * __tests__/find-header-copy.test.ts
 *
 * Issue #401 — /find header: the page title is put in Title Case, the old
 * subtitle ("Filters set the floor...") is removed, a one-line description
 * replaces it, the submit button reads "Refine list" instead of "Ask", and
 * the textarea placeholder becomes a conversational sentence.
 *
 * Issue #434 — the "Add Details" eyebrow above the description (added by
 * #401) is removed: the description line already says what the box is for,
 * and the eyebrow just repeated the "Refine list" button.
 *
 * This repo's jest config runs under plain node with no jsdom (see
 * find-ask-textarea.test.ts's convention), so FindClient's rendering is
 * covered with source-text assertions.
 */

import * as fs from 'fs'
import * as path from 'path'

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf-8')
}

const src = readSource('app/find/FindClient.tsx')

describe('/find header copy (issue #401)', () => {
  it('titles the page "Find Schools" in Title Case', () => {
    expect(src).toContain('Find Schools')
    expect(src).not.toContain('>\n                Find schools\n')
  })

  it('removes the old "Filters set the floor" subtitle entirely', () => {
    expect(src).not.toContain('Filters set the floor')
    expect(src).not.toContain('The ask box adds what a filter')
  })

  it('does not render the "Add Details" eyebrow above the ask box (issue #434)', () => {
    expect(src).not.toContain('Add Details')
  })

  it('adds the one-line description under the label', () => {
    expect(src).toContain("Anything the filters can&rsquo;t capture — in your own words.")
  })

  it('renames the submit button from "Ask" to "Refine list"', () => {
    expect(src).toMatch(/<Button type="submit" disabled=\{askLoading\}>\s*Refine list/)
    expect(src).not.toMatch(/<Button type="submit" disabled=\{askLoading\}>\s*Ask\s*<\/Button>/)
  })

  it('gives the textarea a conversational, prose placeholder', () => {
    const textareaIdx = src.indexOf('<textarea')
    const closeIdx = src.indexOf('/>', textareaIdx)
    const textareaTag = src.slice(textareaIdx, closeIdx)
    expect(textareaTag).toContain(
      'placeholder="She wants a strong CS program and a real soccer team, and we\'re in Sunset Park."'
    )
  })

  it('leaves the 500-character counter unchanged', () => {
    expect(src).toContain('{askText.length} / {MAX_QUESTION_LENGTH}')
  })
})
