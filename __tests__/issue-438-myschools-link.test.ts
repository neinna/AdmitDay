/**
 * Issue #438: the school page's "Open in MySchools" links pointed at the
 * MySchools homepage (MYSCHOOLS_URL), not the school -- a parent had to find
 * the school themselves after clicking through. The link must be built from
 * the school's DBN, and the page must show when our copy was taken (from the
 * program provenance already stored per school) so the vintage carries even
 * if the parent never clicks through.
 */

import * as fs from 'fs'
import * as path from 'path'
import { School, SchoolFlags } from '../types'
import { buildDoeSchoolUrl,buildMySchoolsCheckedLabel } from '../lib/school-detail-utils'

function makeFlags(overrides: Partial<SchoolFlags> = {}): SchoolFlags {
  return {
    has_shsat: false,
    has_audition: false,
    has_screened: false,
    has_open: false,
    has_borough_priority: false,
    high_impact: false,
    has_consortium: false,
    has_ib: false,
    ...overrides,
  }
}

function makeSchool(overrides: Partial<School> = {}): School {
  return {
    dbn: '03M485',
    name: 'Test School',
    borough: 'Manhattan',
    size: 'medium',
    total_students: null,
    applicants_per_seat: null,
    admissions_types: [],
    programs: [],
    doe_data: {
      overview: '',
      language: '',
      extracurriculars: '',
      website: '',
      phone: '',
      address: '',
      zip: '',
    },
    last_verified: '',
    ...overrides,
    flags: makeFlags(overrides.flags),
  }
}

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf-8')
}

describe('buildDoeSchoolUrl', () => {
  it('links the school\'s own DOE page, without the district prefix', () => {
    expect(buildDoeSchoolUrl('02M475')).toBe('https://www.myschools.nyc/en/schools/high-school/02M475/')
  })

  it('uses a different DBN to produce a different URL', () => {
    expect(buildDoeSchoolUrl('24Q610')).toBe('https://www.myschools.nyc/en/schools/high-school/24Q610/')
  })

  it('builds the DOE page for 13K430', () => {
    expect(buildDoeSchoolUrl('30Q575')).toBe('https://www.myschools.nyc/en/schools/high-school/30Q575/')
  })
})

describe('buildMySchoolsCheckedLabel', () => {
  it('formats the first program\'s provenance.fetched_at as a date', () => {
    const school = makeSchool({
      programs: [
        {
          program_name: 'Dance',
          provenance: {
            source: 'MySchools',
            url: 'https://www.myschools.nyc/en/api/v2/schools/process/1/03M485/',
            fetched_at: '2026-08-07T00:00:00+00:00',
          },
        },
      ] as unknown as School['programs'],
    })
    expect(buildMySchoolsCheckedLabel(school)).toBe('From DOE data, checked August 7, 2026')
  })

  it('falls back to a later program when an earlier one has no provenance', () => {
    const school = makeSchool({
      programs: [
        { program_name: 'No provenance' },
        {
          program_name: 'Drama',
          provenance: {
            source: 'MySchools',
            url: 'https://www.myschools.nyc/en/api/v2/schools/process/1/03M485/',
            fetched_at: '2026-09-18T19:59:59.944769+00:00',
          },
        },
      ] as unknown as School['programs'],
    })
    expect(buildMySchoolsCheckedLabel(school)).toBe('From DOE data, checked September 18, 2026')
  })

  it('returns null when no program carries a fetched_at (older program rows)', () => {
    const school = makeSchool({
      programs: [{ admissions_type: 'SHSAT', raw_method: 'SHSAT' }] as unknown as School['programs'],
    })
    expect(buildMySchoolsCheckedLabel(school)).toBeNull()
  })

  it('returns null for a school with no programs at all', () => {
    expect(buildMySchoolsCheckedLabel(makeSchool({ programs: [] }))).toBeNull()
  })
})

describe('SchoolDetailClient — MySchools link points at the school (issue #438)', () => {
  const src = readSource('app/school/[dbn]/SchoolDetailClient.tsx')

  it('builds both links from the school DBN via buildDoeSchoolUrl, not a shared homepage constant', () => {
    expect(src).toContain('buildDoeSchoolUrl(school.dbn)')
    expect(src).not.toContain('MYSCHOOLS_URL')
  })

  it('both anchors use the derived doeSchoolUrl href', () => {
    const occurrences = src.split('href={doeSchoolUrl}').length - 1
    expect(occurrences).toBe(2)
  })

  it('still fires myschools_link_clicked with dbn on both links', () => {
    const occurrences = src.split(
      "posthog?.capture('myschools_link_clicked', { dbn: school.dbn })"
    ).length - 1
    expect(occurrences).toBe(2)
  })

  it('renders the checked-date label derived from provenance.fetched_at, beside both links', () => {
    expect(src).toContain('buildMySchoolsCheckedLabel(school)')
    const occurrences = src.split('{myschoolsCheckedLabel &&').length - 1
    expect(occurrences).toBe(2)
  })

  it('labels the link "Official DOE page ↗", not "Open in MySchools" or the directory', () => {
    expect(src).toContain('Official DOE page ↗')
    expect(src).not.toMatch(/in the DOE dir/)
    expect(src).not.toContain('Open in MySchools')
  })
})

describe('school-detail-utils.ts — the "From DOE data, checked ..." copy (issue #438)', () => {
  const src = readSource('lib/school-detail-utils.ts')

  it('the checked-date sentence names the DOE data, not MySchools', () => {
    expect(src).toContain('From DOE data, checked')
  })
})

describe('page.tsx no longer wires the MYSCHOOLS_URL constant into SchoolDetailClient (issue #438)', () => {
  const src = readSource('app/school/[dbn]/page.tsx')

  it('does not import or pass MYSCHOOLS_URL', () => {
    expect(src).not.toContain('MYSCHOOLS_URL')
  })
})
