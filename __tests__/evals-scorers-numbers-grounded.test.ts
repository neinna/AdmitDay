import { scoreNumbersGrounded } from '../evals/scorers'

const CHUNK =
  'It has 258 students with an applicants-per-seat ratio of 4.17.\nKey stats: graduation rate 66%, attendance rate 87%.\nProgram: code M46X; grades 9 to 12.'
const retrieved = [{ dbn: '01M292', chunk: CHUNK }]
const score = (reason: string, data = retrieved, dbn = '01M292') =>
  scoreNumbersGrounded(data, [{ dbn, reason }])

describe('scoreNumbersGrounded', () => {
  it('passes numbers present in the data', () => {
    expect(score('Graduation rate is 66% with 258 students.').pass).toBe(true)
  })

  it('grounds an integer by rounding a decimal', () => {
    expect(score('About 4 applicants per seat.').pass).toBe(true)
  })

  it('fails a number the data does not contain', () => {
    const r = score('Graduation rate is 95%.')
    expect(r.pass).toBe(false)
    expect(r.detail).toContain('01M292: 95')
  })

  it('ignores codes and ordinals', () => {
    expect(score('Program M46X serves 9th graders.').pass).toBe(true)
  })

  it('normalizes thousands separators', () => {
    const data = [{ dbn: '01M292', chunk: 'It has 1200 students.' }]
    expect(score('1,200 students.', data).pass).toBe(true)
  })

  it('fails every number for a DBN that was not retrieved', () => {
    const r = score('66%', retrieved, '99X999')
    expect(r.pass).toBe(false)
    expect(r.detail).toBe('99X999: 66')
  })
})
