import * as fs from 'fs'
import * as path from 'path'
import { countActiveFindFilters, FindFilters } from '../lib/school-list-utils'

/**
 * Issue #196 — instrument the product funnel (land → filter → ask → open a
 * school → save a school → return) in PostHog with the ten new events:
 * ask_submitted, ask_answered, ask_failed, filter_applied, filter_cleared,
 * school_detail_viewed, school_saved, school_removed, shortlist_viewed
 * (renamed from my_schools_viewed in issue #283), myschools_link_clicked.
 *
 * This repo's jest config runs in the `node` environment with no
 * jsdom/testing-library, and no existing component test renders a .tsx
 * module directly (see ui-primitives.test.ts, find-filters.test.ts) — every
 * test here follows that same source-text convention.
 */

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf-8')
}

// ── countActiveFindFilters (ask_submitted's filters_active property) ───────

describe('countActiveFindFilters (issue #196)', () => {
  it('is zero when no rail filters are active', () => {
    expect(countActiveFindFilters({ boroughs: [], tracks: [], size: '' })).toBe(0)
  })

  it('counts each selected borough and track individually, plus one for size', () => {
    const filters: FindFilters = {
      boroughs: ['Brooklyn', 'Queens'],
      tracks: ['SHSAT'],
      size: 'small',
    }
    expect(countActiveFindFilters(filters)).toBe(4)
  })
})

// ── /api/find/ask: trace_id for ask_answered ────────────────────────────────

describe('/api/find/ask returns a traceId for the ask_answered event (issue #196)', () => {
  const src = readSource('app/api/find/ask/route.ts')

  it('generates a fresh id per request rather than reusing a fixed value', () => {
    expect(src).toContain('randomUUID')
  })

  it('includes traceId in the success response', () => {
    expect(src).toMatch(/traceId:\s*randomUUID\(\)/)
  })
})

// ── FindClient: ask_submitted / ask_answered / ask_failed ───────────────────

describe('FindClient — ask funnel events (issue #196)', () => {
  const src = readSource('app/find/FindClient.tsx')

  it('imports usePostHog', () => {
    expect(src).toContain("from 'posthog-js/react'")
  })

  it('fires ask_submitted with question_length and filters_active only after the empty-question guard', () => {
    const guardIndex = src.indexOf('if (!trimmed) return')
    const submittedIndex = src.indexOf("posthog?.capture('ask_submitted'")
    expect(guardIndex).toBeGreaterThan(-1)
    expect(submittedIndex).toBeGreaterThan(guardIndex)
    const block = src.slice(submittedIndex, submittedIndex + 200)
    expect(block).toContain('question_length: trimmed.length')
    expect(block).toContain('filters_active: countActiveFindFilters(filters)')
  })

  it('never sends the raw question text or answer text to PostHog (no PII)', () => {
    expect(src).not.toMatch(/capture\([^)]*askText/)
    expect(src).not.toMatch(/capture\([^)]*askAnswer[^E]/)
    expect(src).not.toMatch(/capture\([^)]*question:/)
  })

  it('fires ask_answered with latency_ms, source_count, and trace_id on success', () => {
    const idx = src.indexOf("posthog?.capture('ask_answered'")
    expect(idx).toBeGreaterThan(-1)
    const block = src.slice(idx, idx + 250)
    expect(block).toContain('latency_ms: Date.now() - startedAt')
    expect(block).toContain('source_count: sources.length')
    expect(block).toContain('trace_id:')
    expect(block).toContain('data.traceId')
  })

  it('fires ask_failed with reason rate_limited on a 429', () => {
    const idx = src.indexOf('res.status === 429')
    const block = src.slice(idx, src.indexOf('return', idx) + 10)
    expect(block).toContain("posthog?.capture('ask_failed', { reason: 'rate_limited' })")
  })

  it('classifies a non-429 failure response as bad_request (400) or provider_error otherwise', () => {
    expect(src).toContain("new AskRequestError(res.status === 400 ? 'bad_request' : 'provider_error')")
  })

  it('captures ask_failed exactly once per failure — the catch block reports AskRequestError reasons instead of re-deriving them', () => {
    const catchIdx = src.indexOf('} catch (err) {')
    const block = src.slice(catchIdx, catchIdx + 300)
    expect(block).toContain("posthog?.capture('ask_failed'")
    expect(block).toContain('err instanceof AskRequestError ? err.reason : \'provider_error\'')
    // Only two ask_failed call sites total: the 429 early-return and this catch block.
    const occurrences = src.split("capture('ask_failed'").length - 1
    expect(occurrences).toBe(2)
  })
})

// ── FindClient: filter_applied / filter_cleared ─────────────────────────────

describe('FindClient — rail filter events (issue #196)', () => {
  const src = readSource('app/find/FindClient.tsx')

  it('fires filter_applied or filter_cleared for borough toggles, never a setFilters updater (Strict Mode double-invoke risk)', () => {
    const start = src.indexOf('function toggleBorough')
    const end = src.indexOf('function toggleTrack')
    const body = src.slice(start, end)
    expect(body).not.toMatch(/setFilters\(\s*\(/) // no updater-function form
    expect(body).toContain("posthog?.capture('filter_cleared', { filter_type: 'borough' })")
    expect(body).toContain("filter_type: 'borough'")
    expect(body).toContain('value_count: boroughs.length')
    expect(body).toContain('results_after: applyFindFilters(schools, next).length')
  })

  it('fires filter_applied or filter_cleared for track toggles', () => {
    const start = src.indexOf('function toggleTrack')
    const end = src.indexOf('function setSize')
    const body = src.slice(start, end)
    expect(body).toContain("filter_type: 'track'")
    expect(body).toContain("posthog?.capture('filter_cleared', { filter_type: 'track' })")
  })

  it('fires filter_applied or filter_cleared for size changes, guarding against a no-op re-click', () => {
    const start = src.indexOf('function setSize')
    const end = src.indexOf('function resetFilters')
    const body = src.slice(start, end)
    expect(body).toContain('if (size === filters.size) return')
    expect(body).toContain("filter_type: 'size'")
  })

  it('fires filter_cleared once per rail dimension that was active when Reset is clicked', () => {
    const start = src.indexOf('function resetFilters')
    const end = src.indexOf('function toggleAdded')
    const body = src.slice(start, end)
    expect(body).toContain("filter_type: 'borough'")
    expect(body).toContain("filter_type: 'track'")
    expect(body).toContain("filter_type: 'size'")
  })
})

// ── FindClient: school_saved / school_removed / school_detail_viewed ───────

describe('FindClient — save and detail-view events (issue #196)', () => {
  const src = readSource('app/find/FindClient.tsx')

  it('toggleAdded computes the next Set from the closure, not a setAddedDbns updater, before capturing', () => {
    const start = src.indexOf('function toggleAdded')
    const end = src.indexOf('function removeChip')
    const body = src.slice(start, end)
    expect(body).not.toMatch(/setAddedDbns\(\s*\(/)
    expect(body).toContain("posthog?.capture(adding ? 'school_saved' : 'school_removed'")
    expect(body).toContain('list_size_after: next.size')
  })

  it('fires school_detail_viewed with from: "find" when a result row is clicked, wired via onNavigate not a render-time effect', () => {
    expect(src).toContain("posthog?.capture('school_detail_viewed', { dbn: school.dbn, from: 'find' })")
    expect(src).toContain('onNavigate={() =>')
    expect(src).not.toMatch(/useEffect\([^)]*school_detail_viewed/)
  })
})

// ── components/ui/SchoolRow: onNavigate wiring ──────────────────────────────

describe('components/ui/SchoolRow — onNavigate fires on click, not render (issue #196)', () => {
  const src = readSource('components/ui/SchoolRow.tsx')

  it('accepts an optional onNavigate prop', () => {
    expect(src).toMatch(/onNavigate\?:\s*\(\)\s*=>\s*void/)
  })

  it('wires onNavigate to the overlay Link\'s onClick, not a useEffect', () => {
    const linkStart = src.indexOf('<Link')
    const linkEnd = src.indexOf('/>', linkStart)
    const linkBlock = src.slice(linkStart, linkEnd)
    expect(linkBlock).toContain('onClick={onNavigate}')
  })
})

// ── ShortlistClient: shortlist_viewed / school_removed / school_detail_viewed ─

describe('ShortlistClient — shortlist_viewed, school_removed, and detail-view events (issue #196, renamed by #283)', () => {
  const src = readSource('app/shortlist/ShortlistClient.tsx')

  it('imports usePostHog', () => {
    expect(src).toContain("from 'posthog-js/react'")
  })

  it('guards shortlist_viewed with a ref so Strict Mode double-invoking the mount effect only fires it once', () => {
    expect(src).toContain('viewFiredRef')
    expect(src).toMatch(/if \(!viewFiredRef\.current\)/)
    expect(src).toContain("posthog?.capture('shortlist_viewed', { list_size: resolvedOrder.length })")
  })

  it('fires school_removed with the post-removal list size when a school is removed', () => {
    const start = src.indexOf('const remove = ')
    const body = src.slice(start, start + 700)
    expect(body).toContain("posthog?.capture('school_removed', { dbn, list_size_after: next.length })")
  })

  it('fires school_detail_viewed with from: "my_schools" on the row link click (property value unchanged by #283)', () => {
    expect(src).toContain(
      "posthog?.capture('school_detail_viewed', { dbn: school.dbn, from: 'my_schools' })"
    )
  })
})

// ── SchoolDetailClient: school_saved / school_removed / myschools_link_clicked ─

describe('SchoolDetailClient — save and MySchools-link events (issue #196)', () => {
  const src = readSource('app/school/[dbn]/SchoolDetailClient.tsx')

  it('imports usePostHog', () => {
    expect(src).toContain("from 'posthog-js/react'")
  })

  it('toggleAdded computes the next Set from the closure before capturing (no updater-form double-invoke risk)', () => {
    const start = src.indexOf('function toggleAdded')
    const end = src.indexOf('const addedCount')
    const body = src.slice(start, end)
    expect(body).not.toMatch(/setAddedDbns\(\s*\(/)
    expect(body).toContain("posthog?.capture(adding ? 'school_saved' : 'school_removed'")
    expect(body).toContain('list_size_after: next.size')
  })

  it('fires myschools_link_clicked with dbn on both MySchools links (header button and requirements block)', () => {
    const occurrences = src.split(
      "posthog?.capture('myschools_link_clicked', { dbn: school.dbn })"
    ).length - 1
    expect(occurrences).toBe(2)
  })
})

// ── No PII leaks into any new capture call across the funnel ────────────────

describe('No PII in any funnel event payload (issue #196)', () => {
  const files = [
    'app/find/FindClient.tsx',
    'app/shortlist/ShortlistClient.tsx',
    'app/school/[dbn]/SchoolDetailClient.tsx',
  ]

  it('never captures a question, answer, or child-related property', () => {
    for (const file of files) {
      const src = readSource(file)
      const captureCalls = src.match(/posthog\?\.capture\([^)]*\)[^)]*\)/g) ?? []
      for (const call of captureCalls) {
        // Drop the event-name argument itself (e.g. 'ask_answered') — only the
        // properties object that follows may never carry question/answer text.
        const propsOnly = call.replace(/^posthog\?\.capture\(\s*'[^']*'\s*,?/, '')
        expect(propsOnly).not.toMatch(/question(?!_length)/i)
        expect(propsOnly).not.toMatch(/answer/i)
        expect(propsOnly).not.toMatch(/child/i)
      }
    }
  })
})
