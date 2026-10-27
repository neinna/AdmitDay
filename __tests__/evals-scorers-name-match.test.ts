/**
 * __tests__/evals-scorers-name-match.test.ts
 *
 * School names that sit inside longer names ("Park East High School" inside
 * "Central Park East High School") must not count as named when only the
 * longer school is mentioned. Names are taken from schools.json.
 */

import fs from 'fs'
import path from 'path'
import yaml from 'js-yaml'
import { findNamedSchools, scoreHallucination, scoreCoverage } from '../evals/scorers'

const ALL = [
  'Park East High School',
  'Central Park East High School',
  'Eagle Academy for Young Men',
  'Eagle Academy for Young Men II',
  'Eagle Academy for Young Men III',
]

describe('findNamedSchools', () => {
  it('does not credit a name that only appears inside a longer one', () => {
    const named = findNamedSchools('Central Park East High School has small classes.', ALL)
    expect(Array.from(named)).toEqual(['Central Park East High School'])
  })

  it('credits both when each appears on its own', () => {
    const named = findNamedSchools(
      'Central Park East High School and Park East High School are both in Manhattan.',
      ALL
    )
    expect(named).toEqual(new Set(['Central Park East High School', 'Park East High School']))
  })

  it('keeps numbered schools apart', () => {
    const named = findNamedSchools('Eagle Academy for Young Men III offers PSAL basketball.', ALL)
    expect(Array.from(named)).toEqual(['Eagle Academy for Young Men III'])
  })
})

describe('scoreHallucination with nested names', () => {
  it('passes when only the retrieved longer school is named', () => {
    const result = scoreHallucination(
      'Central Park East High School has small classes.',
      ['Central Park East High School'],
      ALL
    )
    expect(result.pass).toBe(true)
  })

  it('still fails a real unretrieved school', () => {
    const result = scoreHallucination(
      'Park East High School has small classes.',
      ['Central Park East High School'],
      ALL
    )
    expect(result.pass).toBe(false)
    expect(result.detail).toContain('Park East High School')
  })
})

describe('scoreCoverage with nested names', () => {
  it('fails when the retrieved shorter school is only present inside a longer name', () => {
    const result = scoreCoverage(
      'Central Park East High School has small classes.',
      ['Park East High School'],
      ALL
    )
    expect(result.pass).toBe(false)
  })
})

describe('eval-ask workflow', () => {
  it('uploads the per-case results even when the eval fails', () => {
    const file = path.join(__dirname, '..', '.github', 'workflows', 'eval-ask.yml')
    const wf = yaml.load(fs.readFileSync(file, 'utf-8')) as {
      jobs: Record<string, { steps: { name?: string; if?: string; with?: Record<string, string> }[] }>
    }
    const step = wf.jobs['eval-ask'].steps.find((s) => s.name === 'Upload eval results')
    expect(step?.if).toBe('always()')
    expect(step?.with?.path).toBe('evals/results/')
  })
})
