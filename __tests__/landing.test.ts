import fs from 'fs'
import path from 'path'
import { buildLandscape, landscapeIsPublishable, roundDownTo } from '@/lib/landscape'
import type { School } from '@/types'

const pageSrc = fs.readFileSync(path.join(__dirname, '../app/page.tsx'), 'utf-8')
/** JSX wraps copy across lines, so assertions about sentences read this. */
const pageCopy = pageSrc.replace(/\s+/g, ' ')

function s(over: Partial<School> & { dbn: string }): School {
  return {
    name: 'S', borough: 'Brooklyn', size: 'Medium', total_students: 1,
    applicants_per_seat: 1, academic_score_pct: 1, survey_score_pct: 1,
    admissions_types: ['Open'], programs: [{} as never], flags: {} as School['flags'],
    doe_data: {} as School['doe_data'], sift_url: '', last_verified: '', ...over,
  } as School
}

describe('landscape numbers are derived, never claimed', () => {
  it('rounds down so the claim stays true as the data shifts', () => {
    expect(roundDownTo(780, 100)).toBe(700)
    expect(roundDownTo(457, 100)).toBe(400)
    expect(roundDownTo(0, 100)).toBe(0)
  })

  it('counts programs, schools and distinct admissions methods from the data', () => {
    const l = buildLandscape([
      s({ dbn: 'A', admissions_types: ['Screened'], programs: [{}, {}] as never }),
      s({ dbn: 'B', admissions_types: ['Screened', 'Audition'], programs: [{}] as never }),
    ])
    expect(l.schools).toBe(2)
    expect(l.programs).toBe(3)
    expect(l.methods).toBe(2) // Screened, Audition — deduped
  })

  it('refuses to publish a landscape it cannot back', () => {
    // getAllSchools() returns [] on a DB error by design; the page must not
    // then advertise "0+ programs".
    expect(landscapeIsPublishable(buildLandscape([]))).toBe(false)
  })
})

describe('the landing page keeps the product’s promises', () => {
  it('states the refusal to predict', () => {
    expect(pageSrc).toMatch(/No chance of admission/i)
    expect(pageSrc).toMatch(/No reach, target or likely/i)
  })

  it('uses no odds or rating language of its own', () => {
    const copy = pageSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(copy).not.toMatch(/your odds|chance of getting|we predict|guarantee/i)
  })

  it('carries the mandatory non-affiliation line', () => {
    expect(pageCopy).toMatch(/not affiliated with, or endorsed by, the New York City Department of Education/i)
  })

  it('admits the data can be older than the current cycle', () => {
    expect(pageSrc).toMatch(/older than the current cycle/i)
  })

  it('invents no social proof', () => {
    expect(pageSrc).not.toMatch(/trusted by|\d+[,\d]* (families|parents|users) (use|trust)|testimonial/i)
  })

  it('has exactly one destination, used twice', () => {
    const links = Array.from(pageSrc.matchAll(/href="\/(find|my-schools)"/g)).map((m) => m[1])
    expect(links.filter((l) => l === 'find').length).toBeGreaterThanOrEqual(2)
    expect(pageSrc).not.toMatch(/href="\/(pricing|about|faq|signup|login)"/)
  })

  it('is a server component so the numbers render without JS', () => {
    expect(pageSrc).not.toMatch(/^['"]use client['"]/m)
  })
})
