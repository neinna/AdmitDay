/**
 * P1.2 lottery decoder: lib/lottery.ts reads the first two hex characters of
 * the DOE's 32-character lottery number as 0-255.
 */
import { parseLottery, percentLower, isLotteryValue, normalizeLottery } from '@/lib/lottery'

const FULL = '3f2a9c0b-7d11-4e2a-9b3c-0123456789ab'

describe('parseLottery', () => {
  it('reads the first two characters of a full dashed number', () => {
    expect(parseLottery(FULL)).toEqual({ ok: true, value: 63, prefix: '3f' })
  })

  it('accepts the 32 characters without dashes, upper case, with spaces', () => {
    expect(parseLottery(' 3F2A9C0B7D114E2A9B3C0123456789AB ')).toEqual({ ok: true, value: 63, prefix: '3f' })
  })

  it('accepts just the first two characters', () => {
    expect(parseLottery('00')).toEqual({ ok: true, value: 0, prefix: '00' })
    expect(parseLottery('ff')).toEqual({ ok: true, value: 255, prefix: 'ff' })
    expect(parseLottery('80')).toEqual({ ok: true, value: 128, prefix: '80' })
  })

  it('rejects empty, non-hex and wrong-length input', () => {
    expect(parseLottery('').ok).toBe(false)
    expect(parseLottery('zz').ok).toBe(false)
    expect(parseLottery('3f2').ok).toBe(false)
    const r = parseLottery('3f2a')
    expect(r).toEqual({ ok: false, error: 'Enter all 32 characters or just the first 2 (you entered 4).' })
  })

  it('normalizeLottery strips dashes and spaces', () => {
    expect(normalizeLottery('3F-2a 9c')).toBe('3f2a9c')
  })
})

describe('percentLower', () => {
  it('is the share of numbers that start lower, rounded down', () => {
    expect(percentLower(0)).toBe(0)
    expect(percentLower(63)).toBe(24)
    expect(percentLower(128)).toBe(50)
    expect(percentLower(255)).toBe(99)
  })

  it('throws outside 0-255', () => {
    expect(() => percentLower(256)).toThrow(RangeError)
    expect(() => percentLower(-1)).toThrow(RangeError)
    expect(() => percentLower(1.5)).toThrow(RangeError)
  })

  it('isLotteryValue accepts only integers 0-255', () => {
    expect(isLotteryValue(0)).toBe(true)
    expect(isLotteryValue(255)).toBe(true)
    expect(isLotteryValue(256)).toBe(false)
    expect(isLotteryValue('3f')).toBe(false)
  })
})
