/**
 * A D75 Inclusion Program hosted inside a general-education school must not
 * label the host school "District 75" (the citywide special-education
 * district). Regression test for the mislabeled Millennium HS, The Clinton
 * School and Manhattan Center for Science and Mathematics.
 */
import schools from '../schools.json'
import {
  ADMISSION_METHOD_COPY,
  IEP_ENGLISH_LEARNER_TRACKS,

  splitTrackOptionsForRail,
} from '../lib/school-list-utils'
import { findBannedPhrases } from '../lib/banned-phrases'

type RawProgram = { admissions_type?: string; admissions_method?: string; raw_method?: string }
type RawSchool = { dbn: string; admissions_types: string[]; programs: RawProgram[] }
const all = schools as unknown as RawSchool[]

describe('D75 inclusion programs', () => {
  it('never classify an inclusion program as "District 75"', () => {
    for (const s of all) {
      for (const p of s.programs) {
        const raw = (p.raw_method || p.admissions_method || '').toLowerCase()
        if (raw.includes('inclusi')) expect(p.admissions_type).toBe('D75 Inclusion')
      }
    }
  })

  it.each(['02M418', '02M260', '04M435'])('%s is not labeled District 75 and leads with a general-ed method', (dbn) => {
    const s = all.find((x) => x.dbn === dbn)!
    expect(s.admissions_types).not.toContain('District 75')
    expect(s.admissions_types).toContain('D75 Inclusion')
    expect(s.admissions_types[0]).toBe('Screened')
  })

  it('only schools in District 75 itself (DBN prefix 75) may carry the District 75 method', () => {
    for (const s of all) {
      if (s.admissions_types.includes('District 75')) expect(s.dbn.startsWith('75')).toBe(true)
    }
  })

  it('has explanatory copy and sits in the IEP rail group', () => {
    expect(IEP_ENGLISH_LEARNER_TRACKS).toContain('D75 Inclusion')
    expect(ADMISSION_METHOD_COPY['D75 Inclusion']).toMatch(/general-education school/)
    expect(splitTrackOptionsForRail(['Screened', 'D75 Inclusion']).iep).toEqual(['D75 Inclusion'])
  })
})

describe('D75 Inclusion copy', () => {
  it('passes the banned-phrase guard', () => {
    expect(findBannedPhrases(ADMISSION_METHOD_COPY['D75 Inclusion'])).toEqual([])
  })
})
