import { execFileSync } from 'child_process'
import path from 'path'

// Issue #508: applicants_per_seat is computed from MySchools general-ed seats.
const REPO_ROOT = path.join(__dirname, '..')

function apsFor(programs: unknown[]): number | null {
  const code = `
import json, sys
sys.path.insert(0, ${JSON.stringify(REPO_ROOT)})
import build_school_data as b
programs = json.loads(sys.argv[1])
b.fetch_myschools_program_detail = lambda dbn: (["Open"], programs, {})
b.fetch_myschools_school_location = lambda dbn: {}
b.time.sleep = lambda s: None
out, _ = b.build_school_json([{"dbn": "01M001", "name": "Fixture", "borough": "Bronx"}], {})
print(json.dumps(out[0]["applicants_per_seat"]))
`
  const out = execFileSync('python3', ['-c', code, JSON.stringify(programs)], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
  return JSON.parse(out.trim().split('\n').pop() as string)
}

describe('applicants_per_seat', () => {
  it('sums only programs with positive general-ed seats and numeric applicants', () => {
    const aps = apsFor([
      { seats: { general_education: { seats: 70, applicants: 49 } } },
      { seats: { general_education: { seats: 0, applicants: 12 } } },
      { name: 'no seats key' },
    ])
    expect(aps).toBe(0.7)
  })

  it('is null when no program qualifies', () => {
    expect(
      apsFor([
        { seats: { general_education: { seats: 0, applicants: 5 } } },
        { seats: { general_education: { seats: 30, applicants: null } } },
        {},
      ])
    ).toBeNull()
  })
})
