import { dedupePrograms, formatProgramSeats } from '@/lib/school-detail-utils'
import { School } from '@/types'

function rowFor(extra: Record<string, unknown>) {
  return dedupePrograms([
    { program_name: 'K76A', program_code: 'K76A', admissions_type: 'Open', ...extra },
  ] as unknown as School['programs'])[0]
}

describe('formatProgramSeats', () => {
  it('formats GE and SWD for K76A', () => {
    const row = rowFor({
      seats: {
        general_education: { seats: 207, applicants: 1307 },
        students_with_disabilities: { seats: 47, applicants: 69 },
      },
    })
    expect(formatProgramSeats(row)).toBe('6.3 apps/seat · 207 seats · SWD 1.5 apps/seat · 47 seats')
  })

  it('formats GE only', () => {
    const row = rowFor({ seats: { general_education: { seats: 207, applicants: 1307 } } })
    expect(formatProgramSeats(row)).toBe('6.3 apps/seat · 207 seats')
  })

  it('gives no GE part when seats is 0', () => {
    const row = rowFor({ seats: { general_education: { seats: 0, applicants: 10 } } })
    expect(row.seats).toBeUndefined()
    expect(formatProgramSeats(row)).toBeNull()
  })

  it('returns null with nothing', () => {
    expect(formatProgramSeats(rowFor({}))).toBeNull()
  })

  it('returns only the seats-left phrase when that is all there is', () => {
    const row = rowFor({ seats_filled_last_year: { general_education: false } })
    expect(formatProgramSeats(row)).toBe('Seats left last year')
  })
})
