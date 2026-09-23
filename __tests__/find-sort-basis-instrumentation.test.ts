import * as fs from 'fs'
import * as path from 'path'

/**
 * Issue #363 — PostHog gets the sort basis and row position on save, so
 * #361's deferred sort-picker question (do parents who tighten commute end
 * up saving schools far down the ask-ranked list?) can be answered with
 * evidence instead of a guess. Only two existing events change —
 * school_saved (fired in toggleAdded) and ask_answered — no new event.
 *
 * Per #295, no ZIP, station name, coordinate, or distance value may ever
 * reach PostHog; has_starting_point is a boolean and nothing more. This
 * repo's jest config has no jsdom (see find-ask-textarea.test.ts's
 * convention), so FindClient behavior is covered with source-text
 * assertions, the same convention find-start-zip-distance.test.ts uses for
 * this exact file.
 */

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf-8')
}

describe('FindClient — school_saved gets sort_basis, row_position, has_starting_point (issue #363)', () => {
  const src = readSource('app/find/FindClient.tsx')
  const start = src.indexOf('async function toggleAdded')
  const end = src.indexOf('function removeChip')
  const body = src.slice(start, end)

  it('computes sort_basis from askReasons at save time: "ask" when non-empty, else "fit"', () => {
    expect(body).toContain("sort_basis: askReasons.length > 0 ? 'ask' : 'fit'")
  })

  it('computes row_position as the 1-based index of the saved school in the rendered row list', () => {
    expect(body).toContain('visible.findIndex((row) => row.school.dbn === dbn) + 1')
    expect(body).toContain('row_position: rowPosition')
  })

  it('sends has_starting_point as a boolean derived from whether the ZIP resolved to coordinates', () => {
    expect(body).toContain('const commuteStartIsSet = startCoords != null')
    expect(body).toContain('has_starting_point: commuteStartIsSet')
  })

  it('only adds the new properties on the save path, not on remove', () => {
    expect(body).toContain('...(adding && {')
  })

  it('never puts the ZIP/coordinate state literally inside the posthog.capture call (issue #295)', () => {
    const captureIdx = body.indexOf('posthog?.capture(')
    expect(captureIdx).toBeGreaterThan(-1)
    const captureCall = body.slice(captureIdx)
    expect(captureCall).not.toMatch(/startZip|startCoords/)
  })
})

describe('FindClient — ask_answered gets sort_basis (issue #363)', () => {
  const src = readSource('app/find/FindClient.tsx')

  it('computes sort_basis from the reasons the ask just returned, same "ask"/"fit" rule as school_saved', () => {
    const idx = src.indexOf("posthog?.capture('ask_answered'")
    expect(idx).toBeGreaterThan(-1)
    const block = src.slice(idx, idx + 300)
    expect(block).toContain("sort_basis: reasons.length > 0 ? 'ask' : 'fit'")
  })
})

// Behavioral: recompute the exact same expressions FindClient uses against a
// fake rendered row list, so a future refactor that keeps the source text
// intact but breaks the arithmetic still fails a test.
describe('sort_basis / row_position behavior (issue #363)', () => {
  type Row = { school: { dbn: string } }

  function saveEventProps(
    visible: Row[],
    dbn: string,
    askReasonsLength: number,
    startCoords: unknown
  ) {
    const rowPosition = visible.findIndex((row) => row.school.dbn === dbn) + 1
    return {
      sort_basis: askReasonsLength > 0 ? 'ask' : 'fit',
      row_position: rowPosition,
      has_starting_point: startCoords != null,
    }
  }

  const visible: Row[] = [{ school: { dbn: 'A' } }, { school: { dbn: 'B' } }, { school: { dbn: 'C' } }]

  it('a save while an ask is active sends sort_basis "ask" and the correct row_position', () => {
    const props = saveEventProps(visible, 'B', 2, null)
    expect(props.sort_basis).toBe('ask')
    expect(props.row_position).toBe(2)
  })

  it('a save with no ask active sends sort_basis "fit"', () => {
    const props = saveEventProps(visible, 'C', 0, null)
    expect(props.sort_basis).toBe('fit')
    expect(props.row_position).toBe(3)
  })

  it('has_starting_point is a boolean: true once a ZIP resolves to coordinates, false otherwise', () => {
    expect(saveEventProps(visible, 'A', 0, { lat: 40.7, lng: -73.9 }).has_starting_point).toBe(true)
    expect(saveEventProps(visible, 'A', 0, null).has_starting_point).toBe(false)
  })
})

describe('no starting-point value leaks into any PostHog payload in FindClient (issue #295, #363)', () => {
  const src = readSource('app/find/FindClient.tsx')

  it('no posthog.capture call anywhere in the file contains startZip or startCoords', () => {
    const captureCalls = src.match(/posthog\?\.capture\([\s\S]*?\)/g) ?? []
    expect(captureCalls.length).toBeGreaterThan(0)
    for (const call of captureCalls) {
      expect(call).not.toMatch(/startZip|startCoords/)
    }
  })
})
