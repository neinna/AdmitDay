/**
 * Issue #271: recognize MySchools' District 75, ASD/ACES and Language
 * admissions methods, and drop Transfer programs. Covers the app-side
 * pieces: the three new tracks are ordered and captioned correctly, and the
 * /find rail groups them separately from the seven main tracks.
 */

import {
  ADMISSION_METHOD_COPY,
  IEP_ENGLISH_LEARNER_TRACKS,
  admissionMethodCopy,
  admissionMethods,
  splitTrackOptionsForRail,
} from '../lib/school-list-utils'
import { findBannedPhrases } from '../lib/banned-phrases'
import { School, SchoolProgram } from '../types'

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

function program(admissions_type: string): SchoolProgram {
  return { admissions_type }
}

describe('admissionMethods ordering includes the three new tracks (issue #271)', () => {
  it('places District 75, ASD / ACES, and Language Program after Zoned', () => {
    const school = makeSchool({
      programs: [
        program('Language Program'),
        program('District 75'),
        program('Zoned'),
        program('ASD / ACES'),
        program('SHSAT'),
      ],
    })
    expect(admissionMethods(school)).toEqual(['SHSAT', 'Zoned', 'District 75', 'ASD / ACES', 'Language Program'])
  })
})

describe('ADMISSION_METHOD_COPY for the three new tracks (issue #271)', () => {
  it('matches the approved wording exactly', () => {
    expect(ADMISSION_METHOD_COPY['District 75']).toBe(
      'District 75: a special education program for students whose IEP recommends a District 75 setting'
    )
    expect(ADMISSION_METHOD_COPY['ASD / ACES']).toBe(
      'ASD / ACES: a specialized program for students with IEPs, including autism spectrum support'
    )
    expect(ADMISSION_METHOD_COPY['Language Program']).toBe(
      "Language program: admission considers English-learner status or the program's target language"
    )
  })

  it('passes findBannedPhrases for all three', () => {
    for (const method of IEP_ENGLISH_LEARNER_TRACKS) {
      expect(findBannedPhrases(admissionMethodCopy(method, makeSchool()))).toEqual([])
    }
  })
})

describe('splitTrackOptionsForRail (issue #271)', () => {
  it('keeps the seven main tracks in the main group when no IEP tracks are present', () => {
    const { main, iep } = splitTrackOptionsForRail(['SHSAT', 'Zoned', 'Open'])
    expect(main).toEqual(['SHSAT', 'Zoned', 'Open'])
    expect(iep).toEqual([])
  })

  it('separates the three new tracks into their own group, in fixed order regardless of input order', () => {
    const { main, iep } = splitTrackOptionsForRail(['Language Program', 'SHSAT', 'District 75', 'ASD / ACES'])
    expect(main).toEqual(['SHSAT'])
    expect(iep).toEqual(['District 75', 'ASD / ACES', 'Language Program'])
  })

  it('returns an empty iep group when none of the three tracks are present, so the rail can skip the heading', () => {
    const { iep } = splitTrackOptionsForRail(['SHSAT', 'Audition'])
    expect(iep).toEqual([])
  })
})
