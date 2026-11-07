/**
 * P1.2: the decoder must never send or store the number. The component holds
 * it in React state only: no fetch, no storage, no analytics, no URL.
 */
import * as fs from 'fs'
import * as path from 'path'

const src = fs.readFileSync(path.join(__dirname, '../app/lottery/LotteryDecoder.tsx'), 'utf-8')

describe('LotteryDecoder keeps the number in the browser', () => {
  it.each(['fetch(', 'localStorage', 'sessionStorage', 'posthog', 'usePostHog', 'router.push', 'searchParams', 'Sentry'])(
    'never uses %s',
    (needle) => {
      expect(src).not.toContain(needle)
    }
  )

  it('cites the DOE page', () => {
    expect(src).toContain('DOE_RANDOM_NUMBERS_URL')
  })

  it("quotes the DOE's own statement that the number alone can't determine chances", () => {
    expect(src.replace(/\s+/g, ' ')).toContain(
      'Random numbers, on their own, cannot determine your chances of getting into a specific program.'
    )
  })
})
