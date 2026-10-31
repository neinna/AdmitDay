import { scrubText, scrubMessage, scrubError } from '../lib/scrub-error'
import { serverBeforeSend } from '../lib/sentry-filters'

describe('scrubText', () => {
  it.each([
    ['sk-test-FAKEFAKEFAKEFAKEFAKE'],
    ['sk-proj-FAKEFAKEFAKE1234'],
    ['sk-ant-api03-FAKEFAKEFAKE1234'],
    ['Bearer abc.DEF-ghi123'],
    ['key ****abcd'],
    ['0123456789abcdef0123456789abcdef'],
    ['QUJDREVGR0hJSktMTU5PUFFSU1RVVldY'],
  ])('redacts %s', (secret) => {
    const out = scrubText(`Incorrect API key provided: ${secret}. Try again`)
    expect(out).toContain('[redacted]')
    expect(out).not.toContain(secret)
    expect(out).toContain('Try again')
  })

  it('leaves ordinary messages unchanged', () => {
    const msg = 'Request timed out after 30 seconds (status 529)'
    expect(scrubText(msg)).toBe(msg)
  })

  it('handles non-string and undefined input', () => {
    expect(scrubMessage(undefined)).toBe('')
    expect(scrubMessage(null)).toBe('')
    expect(scrubMessage(42)).toBe('42')
    expect(scrubMessage({ a: 1 })).toBe('[object Object]')
    expect(scrubError(undefined)).toBeUndefined()
    expect(scrubError('Bearer abcdefgh')).toBe('[redacted]')
  })
})

describe('scrubError', () => {
  it('keeps type and stack, changes only message text', () => {
    class ProviderError extends Error {}
    const err = new ProviderError('bad key sk-test-FAKEFAKEFAKEFAKEFAKE')
    const out = scrubError(err) as Error
    expect(out).toBeInstanceOf(ProviderError)
    expect(out.message).toBe('bad key [redacted]')
    expect(out.stack).toContain('scrub-error.test')
    expect(out.stack).not.toContain('FAKEFAKE')
  })
})

describe('serverBeforeSend', () => {
  it('scrubs exception, message and breadcrumbs', () => {
    const event = {
      message: 'sk-test-FAKEFAKEFAKEFAKEFAKE',
      exception: { values: [{ value: '401 Incorrect API key: sk-test-FAKEFAKEFAKEFAKEFAKE' }] },
      breadcrumbs: [{ message: 'Bearer FAKETOKEN12345' }],
    }
    const out = serverBeforeSend(event)!
    expect(JSON.stringify(out)).not.toMatch(/FAKE/)
    expect(out.exception!.values![0].value).toContain('[redacted]')
  })

  it('still drops the digest false positive', () => {
    const err = new TypeError("Cannot read properties of null (reading 'digest')")
    expect(serverBeforeSend({}, { originalException: err })).toBeNull()
  })
})
