/**
 * lib/students.ts: what a student may hold, and which MySchools borough
 * priority groups apply.
 */
import { parseStudent, geoPriorityGroups } from '@/lib/students'

const VALID = {
  label: 'Kid 1',
  home_borough: 'K',
  home_district: 15,
  school_borough: 'M',
  school_district: 2,
  lottery: 63,
}

describe('parseStudent', () => {
  it('accepts a full valid student', () => {
    expect(parseStudent(VALID)).toEqual({ ok: true, student: VALID })
  })

  it('drops fields it does not know (a name, a full lottery number)', () => {
    const r = parseStudent({ ...VALID, name: 'Real Name', lottery_full: '3f2a9c0b7d114e2a9b3c0123456789ab' })
    expect(r).toEqual({ ok: true, student: VALID })
  })

  it('accepts only label and home borough, the rest null', () => {
    expect(parseStudent({ label: 'Kid 1', home_borough: 'Q' })).toEqual({
      ok: true,
      student: { label: 'Kid 1', home_borough: 'Q', home_district: null, school_borough: null, school_district: null, lottery: null },
    })
  })

  it.each([
    [{ ...VALID, label: '' }, 'label is required'],
    [{ ...VALID, label: 'x'.repeat(21) }, 'label must be 20 characters or fewer'],
    [{ ...VALID, home_borough: 'Z' }, 'home_borough is required'],
    [{ ...VALID, home_district: 2 }, 'District 2 is not in Brooklyn'],
    [{ ...VALID, school_borough: null, school_district: 2 }, 'school_district needs a borough'],
    [{ ...VALID, lottery: 300 }, 'lottery must be 0-255'],
    [{ ...VALID, lottery: '3f2a9c0b7d114e2a9b3c0123456789ab' }, 'lottery must be 0-255'],
  ])('rejects %j', (body, error) => {
    expect(parseStudent(body)).toEqual({ ok: false, error })
  })

  it('rejects a missing body', () => {
    expect(parseStudent(undefined).ok).toBe(false)
  })
})

describe('geoPriorityGroups', () => {
  it('counts both the home and the school borough, named as MySchools names them', () => {
    expect(geoPriorityGroups({ home_borough: 'K', school_borough: 'M' })).toEqual([
      'Brooklyn students or residents',
      'Manhattan students or residents',
      'New York City residents',
    ])
  })

  it('lists a borough once when home and school match', () => {
    expect(geoPriorityGroups({ home_borough: 'X', school_borough: 'X' })).toEqual([
      'Bronx students or residents',
      'New York City residents',
    ])
  })

  it('works with no school borough', () => {
    expect(geoPriorityGroups({ home_borough: 'R', school_borough: null })).toEqual([
      'Staten Island students or residents',
      'New York City residents',
    ])
  })
})
