/**
 * lib/students.ts: what a student may hold, and which MySchools borough
 * priority groups apply.
 */
import { parseStudent, geoPriorityGroups, zonedSchools, ZONED_GROUP } from '@/lib/students'
import type { School } from '@/types'

const VALID = {
  label: 'Kid 1',
  home_borough: 'K',
  home_district: 15,
  school_borough: 'M',
  school_district: 2,
  zoned_dbn: '15K448',
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

  it('never keeps disability seat or lunch eligibility, even when sent', () => {
    const r = parseStudent({ ...VALID, swd: true, frl: true })
    expect(r).toEqual({ ok: true, student: VALID })
    if (r.ok) {
      expect(r.student).not.toHaveProperty('swd')
      expect(r.student).not.toHaveProperty('frl')
    }
  })

  it('accepts only label and home borough, the rest null', () => {
    expect(parseStudent({ label: 'Kid 1', home_borough: 'Q' })).toEqual({
      ok: true,
      student: { label: 'Kid 1', home_borough: 'Q', home_district: null, school_borough: null, school_district: null, zoned_dbn: null, lottery: null },
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
    [{ ...VALID, zoned_dbn: 'Brooklyn Tech' }, 'zoned_dbn is not a DBN'],
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

describe('zoned school', () => {
  it('adds the zoned group first, naming the school', () => {
    expect(geoPriorityGroups({ home_borough: 'K', school_borough: null, zoned_dbn: '15K448' }, 'Sunset Park High School')).toEqual([
      'Students who live in the zoned area (Sunset Park High School only)',
      'Brooklyn students or residents',
      'New York City residents',
    ])
  })

  it('zonedSchools lists only schools with a zoned priority group, sorted by name', () => {
    const school = (dbn: string, name: string, groups: string[]) =>
      ({ dbn, name, programs: [{ eligibility: { priority_groups: groups.map((g) => ({ name: g })) } }] }) as unknown as School
    const schools = [
      school('02M001', 'Zeta HS', [ZONED_GROUP, 'New York City residents']),
      school('02M002', 'Open HS', ['New York City residents']),
      school('15K003', 'Alpha HS', [ZONED_GROUP]),
      { dbn: '15K004', name: 'No programs' } as unknown as School,
    ]
    expect(zonedSchools(schools)).toEqual([
      { dbn: '15K003', name: 'Alpha HS' },
      { dbn: '02M001', name: 'Zeta HS' },
    ])
  })
})
