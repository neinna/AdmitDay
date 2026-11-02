/**
 * Issue #695: no school page shows the same program row twice, checked against
 * every school in the real schools.json (dedupePrograms is only unit-tested on
 * fixtures elsewhere).
 */

import * as fs from 'fs'
import * as path from 'path'
import { dedupePrograms } from '../lib/school-detail-utils'
import { School } from '../types'

const SCHOOLS_PATH = path.resolve(__dirname, '../schools.json')

describe('real schools.json program rows (issue #695)', () => {
  // No existsSync/skip: a missing file must fail, not pass on nothing.
  const schools: School[] = JSON.parse(fs.readFileSync(SCHOOLS_PATH, 'utf-8'))

  it('holds at least 400 schools', () => {
    expect(schools.length).toBeGreaterThanOrEqual(400)
  })

  it('no school renders two program rows with the same name and method', () => {
    const offenders: string[] = []
    for (const school of schools) {
      const seen = new Set<string>()
      const reported = new Set<string>()
      for (const row of dedupePrograms(school.programs)) {
        const key = `${row.name.trim().toLowerCase()}||${row.method}`
        if (seen.has(key) && !reported.has(key)) {
          reported.add(key)
          offenders.push(`${school.dbn}: "${row.name.trim()}" (${row.method})`)
        }
        seen.add(key)
      }
    }
    expect(offenders).toEqual([])
  })
})
