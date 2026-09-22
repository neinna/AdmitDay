import {
  haversineMiles,
  formatMiles,
  isNycZip,
  zipCentroid,
  findStationByName,
  resolveStartingPointInput,
  filterWithinMiles,
  sortByDistance,
  schoolDistanceMiles,
} from '../lib/commute'

// ── Haversine distance against known pairs ──────────────────────────────────

describe('haversineMiles', () => {
  it('matches the known JFK-LAX great-circle distance', () => {
    const jfk = { lat: 40.6413, lng: -73.7781 }
    const lax = { lat: 33.9416, lng: -118.4085 }
    expect(haversineMiles(jfk, lax)).toBeCloseTo(2469.6, 0)
  })

  it('matches a known short NYC pair (Empire State Building to Times Square)', () => {
    const esb = { lat: 40.748817, lng: -73.985428 }
    const timesSquare = { lat: 40.758896, lng: -73.98513 }
    expect(haversineMiles(esb, timesSquare)).toBeCloseTo(0.7, 1)
  })

  it('is zero for identical points', () => {
    const point = { lat: 40.7128, lng: -74.006 }
    expect(haversineMiles(point, point)).toBe(0)
  })
})

describe('formatMiles', () => {
  it('formats to one decimal place with a "mi" suffix', () => {
    expect(formatMiles(2.34)).toBe('2.3 mi')
    expect(formatMiles(0)).toBe('0.0 mi')
  })
})

// ── ZIP centroids ────────────────────────────────────────────────────────────

describe('zipCentroid / isNycZip', () => {
  it('resolves a known NYC ZIP to a lat/lng', () => {
    expect(isNycZip('10001')).toBe(true)
    const point = zipCentroid('10001')
    expect(point).not.toBeNull()
    expect(point!.lat).toBeGreaterThan(40)
    expect(point!.lat).toBeLessThan(41)
    expect(point!.lng).toBeLessThan(-73)
  })

  it('returns null for a ZIP outside NYC and for malformed input', () => {
    expect(isNycZip('90210')).toBe(false)
    expect(zipCentroid('90210')).toBeNull()
    expect(zipCentroid('not-a-zip')).toBeNull()
  })
})

// ── Subway stations ──────────────────────────────────────────────────────────

describe('findStationByName', () => {
  it('matches a known station case-insensitively', () => {
    const station = findStationByName('14 st-union sq')
    expect(station).not.toBeNull()
    expect(station!.name.toLowerCase()).toBe('14 st-union sq')
  })

  it('returns null for an unknown station name', () => {
    expect(findStationByName('Not A Real Station')).toBeNull()
  })
})

// ── Resolving whatever the parent typed ─────────────────────────────────────

describe('resolveStartingPointInput', () => {
  it('resolves a NYC ZIP', () => {
    const sp = resolveStartingPointInput('10001')
    expect(sp).toEqual({ label: '10001', point: zipCentroid('10001') })
  })

  it('resolves a subway station name', () => {
    const sp = resolveStartingPointInput('14 St-Union Sq')
    expect(sp?.label.toLowerCase()).toBe('14 st-union sq')
  })

  it('returns null for blank input, an unrecognized ZIP, and an unrecognized station', () => {
    expect(resolveStartingPointInput('')).toBeNull()
    expect(resolveStartingPointInput('   ')).toBeNull()
    expect(resolveStartingPointInput('99999')).toBeNull()
    expect(resolveStartingPointInput('Definitely Not A Station')).toBeNull()
  })
})

// ── Within-distance filter ───────────────────────────────────────────────────

describe('filterWithinMiles', () => {
  const from = { lat: 40.7128, lng: -74.006 } // lower Manhattan
  const near = { location: { lat: 40.72, lng: -74.0 } } // ~1 mi away
  const far = { location: { lat: 40.9, lng: -73.9 } } // well over 10 mi away
  const noLocation = { location: null }

  it('passes through unfiltered when no max is set', () => {
    const result = filterWithinMiles([near, far, noLocation], from, null)
    expect(result).toEqual([near, far, noLocation])
  })

  it('excludes schools farther than maxMiles', () => {
    const result = filterWithinMiles([near, far], from, 3)
    expect(result).toEqual([near])
  })

  it('excludes schools with no location only when the filter is on', () => {
    expect(filterWithinMiles([noLocation], from, null)).toEqual([noLocation])
    expect(filterWithinMiles([noLocation], from, 5)).toEqual([])
  })
})

describe('schoolDistanceMiles', () => {
  it('returns null for a school with no location', () => {
    expect(schoolDistanceMiles({ location: null }, { lat: 40.7, lng: -74.0 })).toBeNull()
    expect(schoolDistanceMiles({}, { lat: 40.7, lng: -74.0 })).toBeNull()
  })
})

// ── Distance sort ────────────────────────────────────────────────────────────

describe('sortByDistance', () => {
  const from = { lat: 40.7128, lng: -74.006 }

  it('orders schools nearest-first and puts no-location schools last', () => {
    const nearest = { dbn: 'A', location: { lat: 40.715, lng: -74.005 } }
    const middle = { dbn: 'B', location: { lat: 40.75, lng: -73.99 } }
    const farthest = { dbn: 'C', location: { lat: 40.9, lng: -73.9 } }
    const unknown = { dbn: 'D', location: null }

    const result = sortByDistance([farthest, unknown, nearest, middle], from)
    expect(result.map((s) => s.dbn)).toEqual(['A', 'B', 'C', 'D'])
  })
})
