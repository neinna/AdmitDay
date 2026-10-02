import { execFileSync } from 'child_process'
import path from 'path'

// Issue #506: build_school_json writes `sqr` and flags.high_impact
// (impact_pctl >= 80) in place of is_hidden_gem. Network fetchers are stubbed.

const REPO_ROOT = path.join(__dirname, '..')

const PY = `
import json
import build_school_data as b

def stub_detail(dbn):
    return ["Open"], [], {}

b.fetch_myschools_program_detail = stub_detail
b.fetch_myschools_school_location = lambda dbn: None
b.time.sleep = lambda s: None

schools = [{"dbn": d, "name": "School " + d, "borough": "Bronx"} for d in "ABC"]
sqr = {"A": {"impact_pctl": 80, "x": 1}, "B": {"impact_pctl": 79, "x": 2}}
out, _ = b.build_school_json(schools, {}, sqr)
print("RESULT:" + json.dumps(out))
`

describe('build_school_json sqr + high_impact (#506)', () => {
  const stdout = execFileSync('python3', ['-c', PY], { cwd: REPO_ROOT, encoding: 'utf-8' })
  const line = stdout.split('\n').find((l) => l.startsWith('RESULT:')) as string
  const records = JSON.parse(line.slice('RESULT:'.length)) as Record<string, any>[]
  const byDbn = Object.fromEntries(records.map((r) => [r.dbn, r]))

  it('A (80) has sqr and high_impact true', () => {
    expect(byDbn.A.sqr).toEqual({ impact_pctl: 80, x: 1 })
    expect(byDbn.A.flags.high_impact).toBe(true)
  })

  it('B (79) has sqr and high_impact false', () => {
    expect(byDbn.B.sqr).toEqual({ impact_pctl: 79, x: 2 })
    expect(byDbn.B.flags.high_impact).toBe(false)
  })

  it('C (absent) has no sqr key and high_impact false', () => {
    expect('sqr' in byDbn.C).toBe(false)
    expect(byDbn.C.flags.high_impact).toBe(false)
  })

  it('no record has is_hidden_gem', () => {
    for (const r of records) expect('is_hidden_gem' in r.flags).toBe(false)
  })
})
