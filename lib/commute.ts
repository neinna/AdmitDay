/**
 * lib/commute.ts
 *
 * Commute distance and starting point (issue #295). Version 1 is
 * straight-line distance plus each school's published subway/bus lines —
 * no routing service. The parent's starting point (a NYC ZIP or a subway
 * station) is resolved client-side from two small committed data files and
 * never leaves the browser: it must never appear in a fetch body, a
 * PostHog/Sentry/Langfuse call, or the ask box's model input.
 */

import { GeoPoint } from '@/types'
import zipCentroids from '@/data/nyc-zip-centroids.json'
import subwayStations from '@/data/nyc-subway-stations.json'

const EARTH_RADIUS_MILES = 3958.8

/** Great-circle distance between two points, in miles. */
export function haversineMiles(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h))
}

/** "2.3 mi" — the row/detail display format, one decimal place. */
export function formatMiles(miles: number): string {
  return `${miles.toFixed(1)} mi`
}

// ── ZIP centroids ────────────────────────────────────────────────────────────
// data/nyc-zip-centroids.json: NYC ZIP -> {lat, lng}, from the public 2023
// Census Gazetteer ZCTA centroids, filtered to NYC's 178 ZIP codes.

const ZIP_CENTROIDS: Record<string, GeoPoint> = zipCentroids
const ZIP_RE = /^\d{5}$/

export function isNycZip(zip: string): boolean {
  return ZIP_RE.test(zip) && zip in ZIP_CENTROIDS
}

export function zipCentroid(zip: string): GeoPoint | null {
  return ZIP_RE.test(zip) ? ZIP_CENTROIDS[zip] ?? null : null
}

// ── Subway stations ──────────────────────────────────────────────────────────
// data/nyc-subway-stations.json: every parent station (location_type=1) from
// the MTA's public static GTFS subway feed (stops.txt).

export interface Station {
  id: string
  name: string
  lat: number
  lng: number
}

const RAW_STATIONS = subwayStations as Station[]

// Many physical station complexes list once per line (e.g. four separate "86
// St" entries on four different lines) — for a straight-line starting point
// the first is close enough to treat as the complex, so the picker offers one
// entry per distinct name rather than four indistinguishable duplicates.
function dedupeStationsByName(stations: Station[]): Station[] {
  const seen = new Set<string>()
  const result: Station[] = []
  for (const station of stations) {
    const key = station.name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(station)
  }
  return result
}

export const SUBWAY_STATIONS: Station[] = dedupeStationsByName(RAW_STATIONS)

export function findStationByName(name: string): Station | null {
  const target = name.trim().toLowerCase()
  if (!target) return null
  return SUBWAY_STATIONS.find((s) => s.name.toLowerCase() === target) ?? null
}

/** Station names whose lowercase form contains `query`, for a datalist — capped so the list stays short. */
export function suggestStationNames(query: string, limit = 8): string[] {
  const target = query.trim().toLowerCase()
  if (!target) return []
  return SUBWAY_STATIONS.filter((s) => s.name.toLowerCase().includes(target))
    .slice(0, limit)
    .map((s) => s.name)
}

// ── The parent's starting point ──────────────────────────────────────────────
// Kept to just a label (what they typed or picked) and the resolved point —
// nothing that requires re-reading the ZIP/station tables to display.

export interface StartingPoint {
  label: string
  point: GeoPoint
}

/** A NYC ZIP or an exact (case-insensitive) subway station name -> a starting point, or null if neither resolves. */
export function resolveStartingPointInput(input: string): StartingPoint | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  if (ZIP_RE.test(trimmed)) {
    const point = zipCentroid(trimmed)
    return point ? { label: trimmed, point } : null
  }

  const station = findStationByName(trimmed)
  return station ? { label: station.name, point: { lat: station.lat, lng: station.lng } } : null
}

// ── localStorage persistence ─────────────────────────────────────────────────
// The only place this ever touches storage. Never sent to our server,
// PostHog, Sentry, or Langfuse, and never included in the ask box's request
// body — see __tests__/commute-privacy.test.ts.

export const STARTING_POINT_KEY = 'admitday_find_starting_point'

export function loadStartingPoint(): StartingPoint | null {
  try {
    const raw = localStorage.getItem(STARTING_POINT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed.label === 'string' &&
      parsed.point &&
      typeof parsed.point.lat === 'number' &&
      typeof parsed.point.lng === 'number'
    ) {
      return { label: parsed.label, point: { lat: parsed.point.lat, lng: parsed.point.lng } }
    }
    return null
  } catch {
    return null
  }
}

export function saveStartingPoint(startingPoint: StartingPoint): void {
  try {
    localStorage.setItem(STARTING_POINT_KEY, JSON.stringify(startingPoint))
  } catch {
    // ignore
  }
}

export function clearStartingPoint(): void {
  try {
    localStorage.removeItem(STARTING_POINT_KEY)
  } catch {
    // ignore
  }
}

// ── Distance-based filtering and sorting for /find ───────────────────────────

export const WITHIN_MILES_OPTIONS = [1, 3, 5, 10] as const

/** Distance in miles from `from` to a school's location, or null when the school has no published location. */
export function schoolDistanceMiles(school: { location?: GeoPoint | null }, from: GeoPoint): number | null {
  if (!school.location) return null
  return haversineMiles(from, school.location)
}

/**
 * Excludes schools farther than `maxMiles` from `from`. A school with no
 * location is excluded only while the filter is active — absent location
 * data is not the same as "far away", but it can't satisfy a distance floor
 * either.
 */
export function filterWithinMiles<T extends { location?: GeoPoint | null }>(
  schools: T[],
  from: GeoPoint,
  maxMiles: number | null
): T[] {
  if (maxMiles == null) return schools
  return schools.filter((school) => {
    const distance = schoolDistanceMiles(school, from)
    return distance != null && distance <= maxMiles
  })
}

/** Ascending by distance from `from`; schools with no location sort last, keeping their relative order. */
export function sortByDistance<T extends { location?: GeoPoint | null }>(schools: T[], from: GeoPoint): T[] {
  return [...schools].sort((a, b) => {
    const da = schoolDistanceMiles(a, from)
    const db = schoolDistanceMiles(b, from)
    if (da == null && db == null) return 0
    if (da == null) return 1
    if (db == null) return -1
    return da - db
  })
}
