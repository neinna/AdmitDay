/**
 * Issue #652 — Reset filters also clears the starting point (ZIP or station),
 * the distance radius, and the saved starting point in localStorage.
 *
 * Source-text assertions, as in find-radius-filter.test.ts (no jsdom here).
 */

import * as fs from 'fs'
import * as path from 'path'

const source = fs.readFileSync(path.join(__dirname, '..', 'app/find/FindClient.tsx'), 'utf-8')
const start = source.indexOf('function resetFilters()')
const resetSource = source.slice(start, source.indexOf('async function toggleAdded', start))

describe('resetFilters clears the starting point', () => {
  it('finds the resetFilters source', () => {
    expect(start).toBeGreaterThan(-1)
    expect(resetSource).toContain('setFilters(EMPTY_FIND_FILTERS)')
  })

  it.each([
    "setStartingPoint(null)",
    "setRadiusMiles(null)",
    "setStartingPointInput('')",
    "saveStartingPoint(null)",
  ])('calls %s', (call) => {
    expect(resetSource).toContain(call)
  })

  it('captures starting_point with no ZIP or station value', () => {
    const match = resetSource.match(/capture\('filter_cleared', \{ filter_type: 'starting_point'[^}]*\}\)/)
    expect(match).not.toBeNull()
    expect(match![0]).toBe("capture('filter_cleared', { filter_type: 'starting_point' })")
    expect(match![0]).not.toMatch(/zip|station|label|startingPoint/i)
  })
})
