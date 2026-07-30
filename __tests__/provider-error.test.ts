/**
 * __tests__/provider-error.test.ts
 *
 * Unit tests for lib/provider-error.ts (issue #128).
 * The chat/rationale routes must never leak raw upstream provider
 * errors (vendor detail, request IDs, billing/quota language) to the
 * client — this module is the single place that decides what the
 * client is allowed to see.
 */

import {
  classifyProviderError,
  RATE_LIMIT_MESSAGE,
  UNAVAILABLE_MESSAGE,
  GENERIC_MESSAGE,
} from '@/lib/provider-error'

const FORBIDDEN_SUBSTRINGS = [
  'usage limit',
  'credit',
  'quota',
  'regain access',
  'request_id',
  'anthropic',
]

function fakeProviderError(message: string, status?: number): Error {
  const err = new Error(message)
  if (status !== undefined) {
    ;(err as unknown as { status: number }).status = status
  }
  return err
}

describe('classifyProviderError (issue #128)', () => {
  it('maps a usage-limit error (the real production incident) to the unavailable message, not a raw 400', () => {
    const err = fakeProviderError(
      '400 {"type":"error","error":{"type":"invalid_request_error","message":"You have reached your specified API usage limits. You will regain access on 2026-08-01 at 00:00 UTC."}} request_id: req_abc123',
      400
    )
    const result = classifyProviderError(err)
    expect(result.status).toBe(503)
    expect(result.body).toEqual({ error: UNAVAILABLE_MESSAGE })
  })

  it('maps a credit-exhaustion error to the unavailable message', () => {
    const err = fakeProviderError('Your credit balance is too low to access the API.', 400)
    const result = classifyProviderError(err)
    expect(result.status).toBe(503)
    expect(result.body).toEqual({ error: UNAVAILABLE_MESSAGE })
  })

  it('maps a provider 5xx outage to the unavailable message', () => {
    const err = fakeProviderError('Internal server error', 529)
    const result = classifyProviderError(err)
    expect(result.status).toBe(503)
    expect(result.body).toEqual({ error: UNAVAILABLE_MESSAGE })
  })

  it('maps a timeout/connection error with no status to the unavailable message', () => {
    const err = fakeProviderError('Request timed out (ETIMEDOUT)')
    const result = classifyProviderError(err)
    expect(result.status).toBe(503)
    expect(result.body).toEqual({ error: UNAVAILABLE_MESSAGE })
  })

  it('maps a provider 429 to the existing rate-limit message and status, unchanged', () => {
    const err = fakeProviderError('429 {"type":"error","error":{"type":"rate_limit_error"}}', 429)
    const result = classifyProviderError(err)
    expect(result.status).toBe(429)
    expect(result.body).toEqual({ error: RATE_LIMIT_MESSAGE })
  })

  it('maps an unrecognized error to the generic failure message', () => {
    const err = fakeProviderError('Something exploded unexpectedly', 418)
    const result = classifyProviderError(err)
    expect(result.status).toBe(500)
    expect(result.body).toEqual({ error: GENERIC_MESSAGE })
  })

  it('maps a non-Error thrown value to the generic failure message', () => {
    const result = classifyProviderError('a plain string throw')
    expect(result.status).toBe(500)
    expect(result.body).toEqual({ error: GENERIC_MESSAGE })
  })

  it.each([
    ['usage-limit', fakeProviderError('You have reached your specified API usage limits. You will regain access on 2026-08-01 at 00:00 UTC.', 400)],
    ['outage', fakeProviderError('Internal server error', 500)],
    ['rate-limit', fakeProviderError('rate_limit_error', 429)],
    ['generic', fakeProviderError('unexpected failure', 418)],
  ])('never includes forbidden vendor/billing language for a %s error', (_label, err) => {
    const result = classifyProviderError(err)
    const serialized = JSON.stringify(result.body).toLowerCase()
    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      expect(serialized).not.toContain(forbidden)
    }
  })
})
