import * as fs from 'fs'
import * as path from 'path'
import { notFound } from 'next/navigation'
import { School } from '../types'
import { FindFilters } from '../lib/school-list-utils'
import {
  findSchoolByDbn,
  formatSchoolName,
  buildStatCells,
  getMissingStatLabels,
  buildNotReportedStatsSentence,
  parseCommaList,
  parsePsalSports,
  parseExtracurriculars,
  buildActivityGroups,
  getMissingActivityLabels,
  buildNotOfferedActivitiesSentence,
  chipIsMatched,
  sortChipsMatchedFirst,
  parseSubwayLines,
  parseBusRoutes,
  buildNotReportedTransitLabel,
  dedupePrograms,
  buildRequirementBlocks,
  formatAdmissionsCycle,
  describeBackFilters,
  parseMatchedSignals,
  MYSCHOOLS_URL,
} from '../lib/school-detail-utils'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSchool(overrides: Partial<School> & { dbn?: string } = {}): School {
  return {
    dbn: overrides.dbn ?? 'X000',
    name: overrides.name ?? 'Test School',
    borough: overrides.borough ?? 'Brooklyn',
    size: overrides.size ?? 'medium',
    total_students: null,
    applicants_per_seat: null,
    academic_score_pct: null,
    survey_score_pct: null,
    admissions_types: overrides.admissions_types ?? [],
    programs: overrides.programs ?? [],
    flags: {
      has_shsat: false,
      has_audition: false,
      has_screened: false,
      has_open: false,
      has_borough_priority: false,
      is_hidden_gem: false,
      has_consortium: false,
      has_ib: false,
      ...overrides.flags,
    },
    doe_data: {
      overview: '',
      language: '',
      extracurriculars: '',
      website: '',
      phone: '',
      address: '',
      zip: '',
      ...overrides.doe_data,
    },
    sift_url: '',
    last_verified: '',
    ...overrides,
  }
}

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf-8')
}

// ── findSchoolByDbn — the lookup that drives 404 vs render (issue #116) ─────

describe('findSchoolByDbn', () => {
  const schools = [makeSchool({ dbn: '13K430', name: 'Brooklyn Technical High School' }), makeSchool({ dbn: '02M475' })]

  it('returns the matching school for a known dbn', () => {
    expect(findSchoolByDbn(schools, '13K430')?.name).toBe('Brooklyn Technical High School')
  })

  it('returns undefined for an unknown dbn', () => {
    expect(findSchoolByDbn(schools, '99Z999')).toBeUndefined()
  })
})

describe('page.tsx — 404s an unknown dbn, renders a known one (issue #116)', () => {
  const src = readSource('app/school/[dbn]/page.tsx')

  it('loads schools via getAllSchools', () => {
    expect(src).toContain('getAllSchools()')
  })

  it('looks up the school with findSchoolByDbn', () => {
    expect(src).toContain('findSchoolByDbn(schools, params.dbn)')
  })

  it('calls notFound() when the lookup fails, before rendering anything', () => {
    expect(src).toContain('if (!school) notFound()')
  })

  it('calling next/navigation notFound() throws the real NEXT_NOT_FOUND digest (verifies the 404 mechanism page.tsx relies on)', () => {
    expect(() => notFound()).toThrow()
    try {
      notFound()
    } catch (e) {
      expect((e as { digest?: string }).digest).toBe('NEXT_NOT_FOUND')
    }
  })
})

describe('formatSchoolName', () => {
  it('moves a trailing ", The" to a leading "The "', () => {
    expect(formatSchoolName('Boys and Girls High School, The')).toBe('The Boys and Girls High School')
  })

  it('leaves other names unchanged', () => {
    expect(formatSchoolName('Brooklyn Technical High School')).toBe('Brooklyn Technical High School')
  })
})

// ── The numbers: absent stats are omitted, never zeroed (issue #116) ────────

describe('buildStatCells', () => {
  it('renders only the stats DOE actually published, in the fixed design order', () => {
    const school = makeSchool({
      applicants_per_seat: 4.1,
      total_students: 5900,
      academic_score_pct: null,
      survey_score_pct: null,
      doe_data: {
        overview: '',
        language: '',
        extracurriculars: '',
        website: '',
        phone: '',
        address: '',
        zip: '',
        graduation_rate: 0.96,
        attendance_rate: 0.95,
        college_career_rate: null,
      },
    })
    const cells = buildStatCells(school)
    expect(cells.map((c) => c.label)).toEqual([
      'Applicants per seat',
      'Total students',
      'Graduation rate',
      'Attendance rate',
    ])
  })

  it('formats applicants per seat to one decimal, students with thousands separators, and rates as rounded percentages', () => {
    const school = makeSchool({
      applicants_per_seat: 4.123,
      total_students: 5900,
      doe_data: {
        overview: '', language: '', extracurriculars: '', website: '', phone: '', address: '', zip: '',
        graduation_rate: 0.964,
      },
    })
    const cells = buildStatCells(school)
    expect(cells.find((c) => c.label === 'Applicants per seat')?.value).toBe('4.1')
    expect(cells.find((c) => c.label === 'Total students')?.value).toBe('5,900')
    expect(cells.find((c) => c.label === 'Graduation rate')?.value).toBe('96%')
  })

  it('never renders a stat as 0 or a dash when the underlying value is null — the field is absent entirely', () => {
    const school = makeSchool({ applicants_per_seat: null, total_students: null })
    const cells = buildStatCells(school)
    expect(cells.some((c) => c.label === 'Applicants per seat')).toBe(false)
    expect(cells.some((c) => c.label === 'Total students')).toBe(false)
    expect(cells.map((c) => c.value)).not.toContain('0')
    expect(cells.map((c) => c.value)).not.toContain('—')
  })

  it('does render a genuine DOE-reported 0 (not the same as missing)', () => {
    const school = makeSchool({ academic_score_pct: 0 })
    const cells = buildStatCells(school)
    expect(cells.find((c) => c.label === 'Academic score')?.value).toBe('0%')
  })

  it('returns every field when all seven stats are present', () => {
    const school = makeSchool({
      applicants_per_seat: 4.1,
      total_students: 5900,
      academic_score_pct: 94,
      survey_score_pct: 88,
      doe_data: {
        overview: '', language: '', extracurriculars: '', website: '', phone: '', address: '', zip: '',
        graduation_rate: 0.96, attendance_rate: 0.95, college_career_rate: 0.91,
      },
    })
    expect(buildStatCells(school)).toHaveLength(7)
  })
})

describe('getMissingStatLabels + buildNotReportedStatsSentence (NOT REPORTED — issue #116)', () => {
  it('returns an empty list and a null sentence when nothing is missing', () => {
    const school = makeSchool({
      applicants_per_seat: 1, total_students: 1, academic_score_pct: 1, survey_score_pct: 1,
      doe_data: {
        overview: '', language: '', extracurriculars: '', website: '', phone: '', address: '', zip: '',
        graduation_rate: 1, attendance_rate: 1, college_career_rate: 1,
      },
    })
    expect(getMissingStatLabels(school)).toEqual([])
    expect(buildNotReportedStatsSentence(getMissingStatLabels(school))).toBeNull()
  })

  it('produces the required "gap in the DOE data, not a low result" sentence, matching the design\'s 4-missing-field example', () => {
    const school = makeSchool({
      applicants_per_seat: null,
      total_students: 320,
      academic_score_pct: null,
      survey_score_pct: null,
      doe_data: {
        overview: '', language: '', extracurriculars: '', website: '', phone: '', address: '', zip: '',
        graduation_rate: 0.71, attendance_rate: 0.88, college_career_rate: null,
      },
    })
    const sentence = buildNotReportedStatsSentence(getMissingStatLabels(school))
    expect(sentence).toBe(
      'Applicants per seat, academic score, survey score, and college & career rate are not published for this school. That is a gap in the DOE data, not a low result.'
    )
  })

  it('uses singular "is" for exactly one missing stat', () => {
    const sentence = buildNotReportedStatsSentence(['academic score'])
    expect(sentence).toBe(
      'Academic score is not published for this school. That is a gap in the DOE data, not a low result.'
    )
  })

  it('uses "and" (no comma) for exactly two missing stats', () => {
    const sentence = buildNotReportedStatsSentence(['academic score', 'survey score'])
    expect(sentence).toBe(
      'Academic score and survey score are not published for this school. That is a gap in the DOE data, not a low result.'
    )
  })
})

// ── Activities: groups with nothing are dropped, NOT OFFERED (issue #116) ──

describe('parseCommaList', () => {
  it('splits and trims a comma-separated DOE field', () => {
    expect(parseCommaList('AP Biology, AP Calculus AB,  AP Chemistry')).toEqual([
      'AP Biology', 'AP Calculus AB', 'AP Chemistry',
    ])
  })

  it('returns [] for empty/undefined input', () => {
    expect(parseCommaList('')).toEqual([])
    expect(parseCommaList(undefined)).toEqual([])
    expect(parseCommaList(null)).toEqual([])
  })
})

describe('parsePsalSports', () => {
  it('suffixes boys/girls sports and leaves coed unsuffixed', () => {
    const school = makeSchool({
      doe_data: {
        overview: '', language: '', extracurriculars: '', website: '', phone: '', address: '', zip: '',
        psal_sports_boys: 'Soccer, Basketball',
        psal_sports_girls: 'Soccer, Volleyball',
        psal_sports_coed: 'Fencing',
      },
    })
    expect(parsePsalSports(school)).toEqual([
      'Soccer, boys', 'Basketball, boys', 'Soccer, girls', 'Volleyball, girls', 'Fencing',
    ])
  })

  it('returns [] when no PSAL fields are present', () => {
    expect(parsePsalSports(makeSchool())).toEqual([])
  })
})

describe('parseExtracurriculars', () => {
  it('keeps short comma/semicolon-separated activity names', () => {
    expect(parseExtracurriculars('Robotics team, Math team, Model UN')).toEqual([
      'Robotics team', 'Math team', 'Model UN',
    ])
  })

  it('drops fragments that read like prose sentences (contain a period)', () => {
    const result = parseExtracurriculars(
      'Chess Club, Debate Club; the school also runs a Saturday tutoring program for students.'
    )
    expect(result).toEqual(['Chess Club', 'Debate Club'])
  })

  it('drops overly long fragments even without punctuation', () => {
    const result = parseExtracurriculars('Yearbook, this fragment has way more than six words in it so it should drop')
    expect(result).toEqual(['Yearbook'])
  })

  it('strips a leading "Label:" section header from the first item', () => {
    expect(parseExtracurriculars('Clubs: Art, Band, Chess')).toEqual(['Art', 'Band', 'Chess'])
  })
})

describe('buildActivityGroups + getMissingActivityLabels', () => {
  it('includes only groups that have at least one item, in the fixed order', () => {
    const school = makeSchool({
      doe_data: {
        overview: '', language: 'Spanish', extracurriculars: '', website: '', phone: '', address: '', zip: '',
        advancedplacement_courses: 'AP Biology',
      },
    })
    const groups = buildActivityGroups(school)
    expect(groups.map((g) => g.key)).toEqual(['apCourses', 'languages'])
  })

  it('lists PSAL teams and AP courses as missing when both are absent, matching the design\'s 5b example', () => {
    const school = makeSchool({
      doe_data: {
        overview: '', language: 'Spanish', extracurriculars: 'Student government, Yearbook',
        website: '', phone: '', address: '', zip: '',
      },
    })
    expect(getMissingActivityLabels(school)).toEqual(['PSAL teams', 'AP courses'])
  })

  it('returns [] when every group has at least one item', () => {
    const school = makeSchool({
      doe_data: {
        overview: '', language: 'Spanish', extracurriculars: 'Yearbook', website: '', phone: '', address: '', zip: '',
        psal_sports_coed: 'Fencing',
        advancedplacement_courses: 'AP Biology',
      },
    })
    expect(getMissingActivityLabels(school)).toEqual([])
  })
})

describe('buildNotOfferedActivitiesSentence (NOT OFFERED — issue #116)', () => {
  it('matches the design\'s exact copy for missing PSAL + AP', () => {
    expect(buildNotOfferedActivitiesSentence(['PSAL teams', 'AP courses'])).toBe(
      'No PSAL teams and no AP courses are listed for this school.'
    )
  })

  it('returns null when nothing is missing', () => {
    expect(buildNotOfferedActivitiesSentence([])).toBeNull()
  })

  it('handles a single missing group', () => {
    expect(buildNotOfferedActivitiesSentence(['PSAL teams'])).toBe(
      'No PSAL teams are listed for this school.'
    )
  })
})

describe('NOT REPORTED vs NOT OFFERED are never blurred (issue #116)', () => {
  it('a school with no stats at all gets NOT REPORTED language ("published"/"gap in the DOE data")', () => {
    const sentence = buildNotReportedStatsSentence(['academic score'])
    expect(sentence).toMatch(/published/)
    expect(sentence).toMatch(/gap in the DOE data/)
    expect(sentence).not.toMatch(/offered/i)
  })

  it('a school with no activities in a group gets NOT OFFERED language ("listed for this school")', () => {
    const sentence = buildNotOfferedActivitiesSentence(['PSAL teams'])
    expect(sentence).toMatch(/listed for this school/)
    expect(sentence).not.toMatch(/published/)
    expect(sentence).not.toMatch(/gap in the DOE data/)
  })

  it('SchoolDetailClient uses the reported variant for stats and offered for activities', () => {
    const src = readSource('app/school/[dbn]/SchoolDetailClient.tsx')
    expect(src).toMatch(/notReportedStatsSentence[\s\S]{0,80}variant="reported"/)
    expect(src).toMatch(/notOfferedActivitiesSentence[\s\S]{0,300}variant="offered"/)
  })

  it('transit (subway/bus) absence uses the reported variant too — it is a data-source gap, not a fact about the school', () => {
    const src = readSource('app/school/[dbn]/SchoolDetailClient.tsx')
    expect(src).toMatch(/notReportedTransitLabel[\s\S]{0,40}variant="reported"/)
  })
})

// ── Matched-ask chip accenting (issue #116) ─────────────────────────────────

describe('chipIsMatched + sortChipsMatchedFirst', () => {
  it('matches case-insensitively as a substring', () => {
    expect(chipIsMatched('Soccer, boys', ['Soccer'])).toBe(true)
    expect(chipIsMatched('Computer Science A', ['computer science'])).toBe(true)
    expect(chipIsMatched('Basketball', ['Soccer'])).toBe(false)
  })

  it('sorts matched chips first, preserving relative order within each subset', () => {
    const items = ['Basketball', 'Soccer, boys', 'Volleyball', 'Soccer, girls']
    expect(sortChipsMatchedFirst(items, ['Soccer'])).toEqual([
      'Soccer, boys', 'Soccer, girls', 'Basketball', 'Volleyball',
    ])
  })

  it('returns items unchanged when nothing matches', () => {
    const items = ['Basketball', 'Volleyball']
    expect(sortChipsMatchedFirst(items, ['Soccer'])).toEqual(items)
  })
})

// ── Getting there: transit parsing + NOT REPORTED (issue #116) ─────────────

describe('parseSubwayLines', () => {
  it('extracts distinct line letters/numbers from the "X to Station; Y, Z to Station" format', () => {
    expect(parseSubwayLines('F to East Broadway; J, M, Z to Delancey St-Essex St')).toEqual([
      'F', 'J', 'M', 'Z',
    ])
  })

  it('dedupes a line repeated across segments', () => {
    expect(parseSubwayLines('1 to 137th St-City College; B, C to 135th St; 1 to Somewhere')).toEqual([
      '1', 'B', 'C',
    ])
  })

  it('returns [] for empty/undefined', () => {
    expect(parseSubwayLines('')).toEqual([])
    expect(parseSubwayLines(undefined)).toEqual([])
  })
})

describe('parseBusRoutes', () => {
  it('splits a comma-separated bus route string', () => {
    expect(parseBusRoutes('B39, M14A, M14D')).toEqual(['B39', 'M14A', 'M14D'])
  })
})

describe('buildNotReportedTransitLabel', () => {
  it('names the missing mode(s), matching the design\'s "Bus routes" example', () => {
    expect(buildNotReportedTransitLabel(['bus routes'])).toBe('Bus routes')
  })

  it('joins two missing modes with "and"', () => {
    expect(buildNotReportedTransitLabel(['subway routes', 'bus routes'])).toBe(
      'Subway routes and bus routes'
    )
  })

  it('returns null when both modes are present', () => {
    expect(buildNotReportedTransitLabel([])).toBeNull()
  })
})

// ── Programs ─────────────────────────────────────────────────────────────────

describe('dedupePrograms', () => {
  it('collapses exact duplicate (raw_method, admissions_type) rows', () => {
    const programs = [
      { admissions_type: 'Educational Option', raw_method: 'Ed. Opt.' },
      { admissions_type: 'Educational Option', raw_method: 'Ed. Opt.' },
      { admissions_type: 'Open', raw_method: 'Open' },
    ] as unknown as School['programs']
    expect(dedupePrograms(programs)).toEqual([
      { name: 'Ed. Opt.', method: 'Educational Option' },
      { name: 'Open', method: 'Open' },
    ])
  })

  it('falls back to admissions_type as the name when raw_method is missing', () => {
    const programs = [{ admissions_type: 'SHSAT' }] as unknown as School['programs']
    expect(dedupePrograms(programs)).toEqual([{ name: 'SHSAT', method: 'SHSAT' }])
  })

  it('preserves distinct MySchools program names and codes', () => {
    const programs = [
      {
        program_name: 'Dance',
        program_code: 'M80K',
        admissions_type: 'Audition',
        provenance: {
          source: 'MySchools',
          url: 'https://www.myschools.nyc/en/api/v2/schools/process/1/03M485/',
          fetched_at: '2026-08-07T00:00:00+00:00',
        },
      },
      {
        program_name: 'Drama',
        program_code: 'M80N',
        admissions_type: 'Audition',
        provenance: {
          source: 'MySchools',
          url: 'https://www.myschools.nyc/en/api/v2/schools/process/1/03M485/',
          fetched_at: '2026-08-07T00:00:00+00:00',
        },
      },
    ] as unknown as School['programs']

    expect(dedupePrograms(programs)).toEqual([
      { name: 'Dance', method: 'Audition', code: 'M80K' },
      { name: 'Drama', method: 'Audition', code: 'M80N' },
    ])
  })

  it('returns [] for an empty/undefined programs array', () => {
    expect(dedupePrograms([])).toEqual([])
    expect(dedupePrograms(undefined as unknown as School['programs'])).toEqual([])
  })
})

// ── Requirements ─────────────────────────────────────────────────────────────

describe('buildRequirementBlocks', () => {
  it('creates one block per admissions track', () => {
    const school = makeSchool({ admissions_types: ['SHSAT', 'Screened'] })
    const blocks = buildRequirementBlocks(school)
    expect(blocks.map((b) => b.track)).toEqual(['SHSAT', 'Screened'])
    expect(blocks[0].isPrimary).toBe(true)
    expect(blocks[1].isPrimary).toBe(false)
  })

  it('never fabricates a field the DOE data does not have', () => {
    const school = makeSchool({ admissions_types: ['Open'] })
    expect(buildRequirementBlocks(school)[0].fields).toEqual([])
  })

  it('surfaces prgdesc as the SHSAT admissions field when present', () => {
    const school = makeSchool({
      admissions_types: ['SHSAT'],
      doe_data: {
        overview: '', language: '', extracurriculars: '', website: '', phone: '', address: '', zip: '',
        prgdesc: 'Admission is based solely on the SHSAT score.',
      },
    })
    expect(buildRequirementBlocks(school)[0].fields).toContainEqual({
      label: 'Admissions',
      value: 'Admission is based solely on the SHSAT score.',
    })
  })

  it('turns colon-shaped requirement text into label/value pairs', () => {
    const school = makeSchool({
      admissions_types: ['Screened'],
      doe_data: {
        overview: '', language: '', extracurriculars: '', website: '', phone: '', address: '', zip: '',
        requirements: { requirement1_2: 'Course Grades: English (65-100), Math (66-100)' },
      },
    })
    expect(buildRequirementBlocks(school)[0].fields).toContainEqual({
      label: 'Course Grades',
      value: 'English (65-100), Math (66-100)',
    })
  })

  it('treats a bare (no-colon) requirement label as "Reviewed"', () => {
    const school = makeSchool({
      admissions_types: ['Screened'],
      doe_data: {
        overview: '', language: '', extracurriculars: '', website: '', phone: '', address: '', zip: '',
        requirements: { requirement1_2: 'Attendance' },
      },
    })
    expect(buildRequirementBlocks(school)[0].fields).toContainEqual({
      label: 'Attendance',
      value: 'Reviewed',
    })
  })
})

// ── Provenance ───────────────────────────────────────────────────────────────

describe('formatAdmissionsCycle', () => {
  it('formats "2025-2026" as "2025–26 admissions"', () => {
    expect(formatAdmissionsCycle('2025-2026')).toBe('2025–26 admissions')
  })

  it('returns null for empty/undefined', () => {
    expect(formatAdmissionsCycle('')).toBeNull()
    expect(formatAdmissionsCycle(undefined)).toBeNull()
  })
})

describe('MYSCHOOLS_URL', () => {
  it('points at the real myschools.nyc site rather than a guessed per-school deep link', () => {
    expect(MYSCHOOLS_URL).toBe('https://www.myschools.nyc')
  })
})

// ── Back navigation (filters survive via the URL, issue #116) ──────────────

describe('describeBackFilters', () => {
  it('formats boroughs and tracks matching the back-band example in the design', () => {
    const filters: FindFilters = { boroughs: ['Brooklyn', 'Queens'], tracks: ['Screened'], size: '' }
    expect(describeBackFilters(filters)).toBe('Brooklyn + Queens, Screened')
  })

  it('returns an empty string when no rail filters are active', () => {
    expect(describeBackFilters({ boroughs: [], tracks: [], size: '' })).toBe('')
  })
})

describe('parseMatchedSignals', () => {
  it('splits a comma-joined query param', () => {
    expect(parseMatchedSignals('Soccer,Computer Science')).toEqual(['Soccer', 'Computer Science'])
  })

  it('returns [] when absent', () => {
    expect(parseMatchedSignals(undefined)).toEqual([])
  })
})

// ── /find -> /school wiring (issue #116) ────────────────────────────────────

describe('FindClient links each row to /school/[dbn] without swallowing Add (issue #116)', () => {
  const src = readSource('app/find/FindClient.tsx')

  it('imports ADDED_SCHOOLS_KEY from lib/school-list-utils instead of redefining it', () => {
    expect(src).toContain('ADDED_SCHOOLS_KEY')
    expect(src).not.toContain("const ADDED_SCHOOLS_KEY = '")
  })

  it('wraps the row name in a Link to /school/${school.dbn}', () => {
    expect(src).toContain('href={detailHref}')
    expect(src).toContain('`/school/${school.dbn}?')
  })

  it('keeps the Add/Remove button as a separate action, not inside the name link', () => {
    const nameLinkStart = src.indexOf('name={')
    const actionStart = src.indexOf('action={')
    expect(actionStart).toBeGreaterThan(nameLinkStart)
    const nameBlock = src.slice(nameLinkStart, actionStart)
    // The name Link block must not itself contain the toggleAdded button.
    expect(nameBlock).not.toContain('toggleAdded')
  })
})

describe('lib/school-list-utils.ts exports ADDED_SCHOOLS_KEY (issue #116)', () => {
  it('is the same key used previously by FindClient', () => {
    const src = readSource('lib/school-list-utils.ts')
    expect(src).toContain("export const ADDED_SCHOOLS_KEY = 'admitday_find_added_schools'")
  })
})
