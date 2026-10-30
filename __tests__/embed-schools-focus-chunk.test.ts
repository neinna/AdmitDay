process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key'

import { schoolToChunks, DoeData, School } from '@/scripts/embed-schools'

const long = 'x'.repeat(300)

function makeSchool(small = false): School {
  const doe: DoeData = {
    overview: small ? '' : `Overview ${long}`,
    language: '',
    extracurriculars: small ? '' : `Chess club ${long}`,
    academic_opportunities: small ? '' : 'Research seminar',
    prgdesc: '',
    interests: small ? [] : ['Math', 'Physical Computing'],
    graduation_rate: 0.9,
    attendance_rate: 0.9,
    college_career_rate: 0.9,
    advancedplacement_courses: small ? '' : 'AP Calculus, AP Physics',
    neighborhood: 'N',
    address: '', zip: '', subway: '', bus: '',
    psal_sports_boys: 'Soccer',
    psal_sports_girls: '',
    psal_sports_coed: '',
    addtl_info: '',
  }
  return {
    dbn: '01M001', name: 'Test High School', borough: 'Manhattan', size: 'large',
    total_students: 3000, applicants_per_seat: 5, admissions_types: ['Screened'],
    programs: small ? [] : [
      { program_name: 'PCs and Math', seats: { total: 10 } },
      { program_name: 'PCs and Math' },
      { program_name: 'Robotics' },
    ],
    flags: {
      has_shsat: false, has_audition: false, has_screened: true, has_open: false,
      has_borough_priority: false, high_impact: false, has_consortium: false, has_ib: false,
    },
    doe_data: doe,
    shsat_cutoff_score: null,
  }
}

describe('focus and sports chunks', () => {
  const chunks = schoolToChunks(makeSchool())
  const text = (t: string) => chunks.find((c) => c.chunkType === t)!.chunk

  it('orders chunk types', () => {
    expect(chunks.map((c) => c.chunkType)).toEqual([
      'identity', 'focus', 'programs', 'academics', 'activities', 'sports',
    ])
  })

  it('focus holds the topical signal only', () => {
    const f = text('focus')
    expect(f).toContain('Focus areas: Math, Physical Computing.')
    expect(f).toContain('Programs: PCs and Math; Robotics.')
    expect(f).toContain('AP Calculus, AP Physics')
    for (const bad of ['Key stats', 'Admissions methods', 'Sports:', 'Seats and demand']) {
      expect(f).not.toContain(bad)
    }
  })

  it('moves sports out of activities', () => {
    expect(text('sports')).toContain('Sports:')
    expect(text('activities')).not.toContain('Sports:')
  })

  it('small school stays one full chunk with sports', () => {
    const r = schoolToChunks(makeSchool(true))
    expect(r).toHaveLength(1)
    expect(r[0].chunkType).toBe('full')
    expect(r[0].chunk).toContain('Sports:')
  })
})
