import { getExtrasCallout } from '../lib/requirements-utils'

describe('getExtrasCallout (issue #64)', () => {
  it('returns undefined when requirements is empty', () => {
    expect(getExtrasCallout({})).toBeUndefined()
  })

  it('returns undefined when all values are attendance/grades/test-scores', () => {
    expect(getExtrasCallout({
      req1: 'Attendance',
      req2: 'Punctuality',
      req3: 'Course Grades: Average (80-100)',
      req4: 'Standardized Test Scores: English Language Arts (2-4.5)',
    })).toBeUndefined()
  })

  it('detects interview requirement', () => {
    expect(getExtrasCallout({
      req1: 'Attendance',
      req2: 'Individual Interview (on-site)',
    })).toBe('Requires interview')
  })

  it('detects group interview requirement', () => {
    expect(getExtrasCallout({
      req1: 'Group Interview (on-site)',
    })).toBe('Requires interview')
  })

  it('detects written assessment from Writing Exercise', () => {
    expect(getExtrasCallout({
      req1: 'Writing Exercise (on-site)',
    })).toBe('Requires written assessment')
  })

  it('detects written assessment from Writing Sample', () => {
    expect(getExtrasCallout({
      req1: 'Writing Sample',
    })).toBe('Requires written assessment')
  })

  it('detects portfolio requirement', () => {
    expect(getExtrasCallout({
      req1: 'Portfolio of Student Work',
    })).toBe('Requires portfolio')
  })

  it('detects on-site assessment from Math Test (on-site)', () => {
    expect(getExtrasCallout({
      req1: 'Math Test (on-site)',
    })).toBe('Requires on-site assessment')
  })

  it('detects on-site assessment from Math Exercise (on-site)', () => {
    expect(getExtrasCallout({
      req1: 'Math Exercise (on-site)',
    })).toBe('Requires on-site assessment')
  })

  it('detects additional assessment from Demonstrated Special Talent', () => {
    expect(getExtrasCallout({
      req1: 'Demonstrated Special Talent',
    })).toBe('Requires additional assessment')
  })

  it('detects audition requirement', () => {
    expect(getExtrasCallout({
      req1: 'Audition',
    })).toBe('Requires audition')
  })

  it('skips initial filter lines', () => {
    expect(getExtrasCallout({
      req1: 'Initial filter: 80 grade average, 90% attendance, 90% punctuality',
      req2: 'Course Grades: Average (80-100)',
    })).toBeUndefined()
  })

  it('skips NYSESLAT line', () => {
    expect(getExtrasCallout({
      req1: 'NYSESLAT Score, if available',
    })).toBeUndefined()
  })

  it('skips Demonstrated Interest: School Visit', () => {
    expect(getExtrasCallout({
      req1: 'Demonstrated Interest: School Visit',
    })).toBeUndefined()
  })

  it('deduplicates the same extras type across programs', () => {
    expect(getExtrasCallout({
      req1_1: 'Individual Interview (on-site)',
      req1_2: 'Group Interview (on-site)',
    })).toBe('Requires interview')
  })

  it('combines multiple different extras with and', () => {
    const result = getExtrasCallout({
      req1: 'Portfolio of Student Work',
      req2: 'Individual Interview (on-site)',
    })
    expect(result).toBe('Requires portfolio and interview')
  })

  it('ignores attendance when mixed with extras', () => {
    expect(getExtrasCallout({
      req1: 'Attendance',
      req2: 'Course Grades: Average (85-100)',
      req3: 'Writing Exercise (on-site)',
    })).toBe('Requires written assessment')
  })

  it('ignores standardized test scores when mixed with extras', () => {
    expect(getExtrasCallout({
      req1: 'Standardized Test Scores: ELA (3-4.5)',
      req2: 'Portfolio of Student Work',
    })).toBe('Requires portfolio')
  })
})
