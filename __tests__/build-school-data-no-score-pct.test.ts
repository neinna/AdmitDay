import { execFileSync } from 'child_process'
import path from 'path'

// Issue #509: build_school_json no longer writes academic_score_pct or
// survey_score_pct (removed from the data in #302). Network fetchers are stubbed.

const REPO_ROOT = path.join(__dirname, '..')

const PY = `
import json
import build_school_data as b

b.fetch_myschools_program_detail = lambda dbn: (["Open"], [], {})
b.fetch_myschools_school_location = lambda dbn: None
b.time.sleep = lambda s: None

schools = [{"dbn": "A", "name": "School A", "borough": "Bronx", "academic_score_pct": 55}]
out, _ = b.build_school_json(schools, {}, {})
print("RESULT:" + json.dumps(out))
`

describe('build_school_json score pct fields (#509)', () => {
  const stdout = execFileSync('python3', ['-c', PY], { cwd: REPO_ROOT, encoding: 'utf-8' })
  const line = stdout.split('\n').find((l) => l.startsWith('RESULT:')) as string
  const records = JSON.parse(line.slice('RESULT:'.length)) as Record<string, unknown>[]

  it('writes a record with neither academic_score_pct nor survey_score_pct', () => {
    expect(records).toHaveLength(1)
    expect('academic_score_pct' in records[0]).toBe(false)
    expect('survey_score_pct' in records[0]).toBe(false)
  })
})
