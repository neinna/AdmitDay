/**
 * __tests__/find-starting-point.test.ts
 *
 * Issue #374 — /find's "Starting from" field accepts a subway station name
 * as well as a NYC ZIP (issue #343 accepted only a ZIP). Input only: no new
 * display, no new filter. This repo's jest config runs under plain node with
 * no jsdom (see find-start-zip-distance.test.ts's convention), so
 * FindRail/FindClient wiring is covered with source-text assertions; the
 * resolution and storage logic are covered with real unit tests against a
 * mocked localStorage.
 */

import * as fs from 'fs'
import * as path from 'path'
import {
  SUBWAY_STATIONS,
  StartingPoint,
  START_ZIP_KEY,
  STARTING_POINT_KEY,
  findStationByName,
  suggestStationNames,
  resolveStartingPointInput,
  loadStartingPoint,
  saveStartingPoint,
  lookupZipCentroid,
} from '../lib/school-list-utils'

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf-8')
}

// ── In-memory localStorage mock (no jsdom in this repo's jest config) ───────

function installLocalStorageMock(): { store: Map<string, string> } {
  const store = new Map<string, string>()
  ;(global as unknown as { localStorage: Storage }).localStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage
  return { store }
}

// ── Dedupe ────────────────────────────────────────────────────────────────

describe('SUBWAY_STATIONS dedupe (issue #374)', () => {
  it('collapses the 496 raw rows down by distinct name', () => {
    expect(SUBWAY_STATIONS.length).toBeLessThan(496)
    expect(SUBWAY_STATIONS.length).toBeGreaterThan(0)
  })

  it('offers only one "86 St" for the six raw rows sharing that name, keeping the first', () => {
    const matches = SUBWAY_STATIONS.filter((s) => s.name.toLowerCase() === '86 st')
    expect(matches).toHaveLength(1)
    expect(matches[0]).toEqual({ id: '121', name: '86 St', lat: 40.78864, lng: -73.97622 })
  })
})

// ── findStationByName / resolveStartingPointInput ────────────────────────────

describe('findStationByName (issue #374)', () => {
  it('matches an exact station name', () => {
    expect(findStationByName('86 St')?.id).toBe('121')
  })

  it('matches case-insensitively', () => {
    expect(findStationByName('86 st')).toEqual(findStationByName('86 St'))
    expect(findStationByName('86 ST')).toEqual(findStationByName('86 St'))
  })

  it('returns null for an unknown name', () => {
    expect(findStationByName('Not A Real Station')).toBeNull()
  })
})

describe('resolveStartingPointInput (issue #374)', () => {
  it('resolves a 5-digit ZIP exactly as #343 does', () => {
    expect(resolveStartingPointInput('10001')).toEqual({
      label: '10001',
      point: lookupZipCentroid('10001'),
    })
  })

  it('resolves an exact station name to that station\'s coordinates', () => {
    expect(resolveStartingPointInput('86 St')).toEqual({
      label: '86 St',
      point: { lat: 40.78864, lng: -73.97622 },
    })
  })

  it('resolves a different case identically', () => {
    expect(resolveStartingPointInput('86 st')).toEqual(resolveStartingPointInput('86 St'))
  })

  it('returns null for blank input, an unrecognized ZIP, and an unrecognized station', () => {
    expect(resolveStartingPointInput('')).toBeNull()
    expect(resolveStartingPointInput('   ')).toBeNull()
    expect(resolveStartingPointInput('99999')).toBeNull()
    expect(resolveStartingPointInput('Not A Real Station')).toBeNull()
  })
})

// ── suggestStationNames ──────────────────────────────────────────────────────

describe('suggestStationNames (issue #374)', () => {
  it('matches on a substring, case-insensitively', () => {
    const suggestions = suggestStationNames('86')
    expect(suggestions.length).toBeGreaterThan(0)
    for (const name of suggestions) {
      expect(name.toLowerCase()).toContain('86')
    }
  })

  it('caps the list at 8', () => {
    // "st" matches the overwhelming majority of station names.
    expect(suggestStationNames('st').length).toBeLessThanOrEqual(8)
  })

  it('returns nothing for blank input', () => {
    expect(suggestStationNames('')).toEqual([])
  })
})

// ── localStorage persistence + migration ─────────────────────────────────────

describe('loadStartingPoint / saveStartingPoint (issue #374)', () => {
  beforeEach(() => {
    installLocalStorageMock()
  })

  it('round-trips a saved starting point', () => {
    const sp: StartingPoint = { label: '86 St', point: { lat: 40.78864, lng: -73.97622 } }
    saveStartingPoint(sp)
    expect(loadStartingPoint()).toEqual(sp)
  })

  it('clears the stored value when saved with null', () => {
    saveStartingPoint({ label: '10001', point: lookupZipCentroid('10001')! })
    saveStartingPoint(null)
    expect(loadStartingPoint()).toBeNull()
  })

  it('migrates a bare-ZIP value left by the old #343 key', () => {
    localStorage.setItem(START_ZIP_KEY, '10001')
    expect(loadStartingPoint()).toEqual({ label: '10001', point: lookupZipCentroid('10001') })
  })

  it('loads as absent, without throwing, when the new key holds a malformed value', () => {
    localStorage.setItem(STARTING_POINT_KEY, '{not json')
    expect(() => loadStartingPoint()).not.toThrow()
    expect(loadStartingPoint()).toBeNull()
  })

  it('loads as absent, without throwing, when the new key holds a well-formed but unrelated value', () => {
    localStorage.setItem(STARTING_POINT_KEY, JSON.stringify({ foo: 'bar' }))
    expect(() => loadStartingPoint()).not.toThrow()
    expect(loadStartingPoint()).toBeNull()
  })

  it('loads as absent when neither key is set', () => {
    expect(loadStartingPoint()).toBeNull()
  })
})

// ── FindRail: field wiring, datalist, message ────────────────────────────────

describe('FindRail "Starting from" field (issue #374)', () => {
  const src = readSource('app/find/FindRail.tsx')

  it('accepts free text, not just digits', () => {
    expect(src).not.toContain('inputMode="numeric"')
  })

  it('renders a datalist of suggestions capped by the shared helper', () => {
    expect(src).toContain('<datalist')
    expect(src).toContain('startingPointSuggestions')
  })

  it('shows the combined not-found message', () => {
    expect(src).toContain('Not a NYC ZIP code or subway station')
  })
})

// ── FindClient: resolution wiring, "leaves untouched" behavior ──────────────

describe('FindClient "Starting from" input handling (issue #374)', () => {
  const src = readSource('app/find/FindClient.tsx')

  it('resolves the input with the shared helper', () => {
    expect(src).toContain('resolveStartingPointInput(')
  })

  it('only commits (and saves) a new starting point when it resolves — an unresolved edit falls through without touching state or storage', () => {
    const fnMatch = src.match(/function handleStartingPointInputChange[\s\S]*?\n  \}/)
    expect(fnMatch).not.toBeNull()
    const fn = fnMatch![0]
    // The only setStartingPoint/saveStartingPoint calls are inside the empty-
    // input branch and the resolved branch — never unconditionally.
    expect(fn).toContain('if (resolved) {')
    expect(fn.split('if (resolved) {')[1]).toContain('setStartingPoint(resolved)')
  })
})

// ── Privacy: the starting point never leaves the browser ────────────────────
// Mirrors __tests__/find-start-zip-distance.test.ts's scan, extended to the
// new StartingPoint-shaped state so a future change threading it into a
// request can't land silently. Issue #375 adds SchoolDetailClient.tsx to the
// scan, since it also reads the starting point (for the school-page distance
// line and directions link).

describe('starting point never appears in a fetch body or analytics call (issue #374/#375)', () => {
  const files = [
    readSource('app/find/FindClient.tsx'),
    readSource('app/find/FindRail.tsx'),
    readSource('app/school/[dbn]/SchoolDetailClient.tsx'),
  ]

  it('never passes startingPoint into a fetch() call', () => {
    for (const src of files) {
      const fetchCalls = src.match(/fetch\([\s\S]*?\)/g) ?? []
      for (const call of fetchCalls) {
        expect(call).not.toMatch(/startingPoint/i)
      }
    }
  })

  it('never passes startingPoint into a posthog.capture() call', () => {
    for (const src of files) {
      const captureCalls = src.match(/posthog\?\.capture\([\s\S]*?\)/g) ?? []
      for (const call of captureCalls) {
        expect(call).not.toMatch(/startingPoint/i)
      }
    }
  })

  it('the ask request body only ever includes question and filters, never the starting point', () => {
    const findClient = files[0]
    const askBodyIdx = findClient.indexOf("body: JSON.stringify({ question: trimmed, filters })")
    expect(askBodyIdx).toBeGreaterThan(-1)
    expect(findClient.slice(askBodyIdx, askBodyIdx + 60)).not.toMatch(/startingPoint|startCoords/)
  })

  it('no street address is ever accepted — resolution only recognizes a 5-digit ZIP or a subway station name', () => {
    // A street address neither matches the ZIP regex nor an exact station name.
    expect(resolveStartingPointInput('350 5th Ave, New York, NY')).toBeNull()
  })
})
