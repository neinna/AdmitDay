import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

const script = path.join(__dirname, '../scripts/merge-gate.sh')
const DATA_FILES = 'schools.json\ndata/schema-summary.json\ndata/school-embeddings.json'

let stubDir: string

beforeAll(() => {
  stubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-gate-'))
  fs.writeFileSync(
    path.join(stubDir, 'gh'),
    '#!/bin/sh\n[ "$STUB_FAIL" = "1" ] && exit 1\n[ -n "$STUB_FILES" ] && printf \'%s\\n\' "$STUB_FILES"\nexit 0\n',
    { mode: 0o755 },
  )
})

afterAll(() => {
  fs.rmSync(stubDir, { recursive: true, force: true })
})

function run(env: Record<string, string>): number | null {
  return spawnSync('bash', [script], {
    env: { ...process.env, PR: '1', REPO: 'o/r', PATH: `${stubDir}:${process.env.PATH}`, ...env },
  }).status
}

describe('scripts/merge-gate.sh', () => {
  it('passes an ai-approved PR', () => {
    expect(run({ LABELS: 'ai-approved', HEAD_REF: 'task-1-x' })).toBe(0)
  })

  it('blocks when needs-you is also set', () => {
    expect(run({ LABELS: 'ai-approved,needs-you', HEAD_REF: 'task-1-x' })).toBe(1)
  })

  it('blocks a PR with no labels', () => {
    expect(run({ LABELS: '', HEAD_REF: 'task-1-x' })).toBe(1)
  })

  it('passes a data refresh PR that lists exactly the data files', () => {
    expect(run({ LABELS: '', HEAD_REF: 'data/weekly-refresh', STUB_FILES: DATA_FILES })).toBe(0)
  })

  it('blocks a data refresh PR that changes another file', () => {
    expect(
      run({ LABELS: '', HEAD_REF: 'data/weekly-refresh', STUB_FILES: `${DATA_FILES}\nlib/app.ts` }),
    ).toBe(1)
  })

  it('blocks when gh fails', () => {
    expect(run({ LABELS: '', HEAD_REF: 'data/weekly-refresh', STUB_FAIL: '1' })).toBe(1)
  })

  it('blocks when gh lists no files', () => {
    expect(run({ LABELS: '', HEAD_REF: 'data/weekly-refresh', STUB_FILES: '' })).toBe(1)
  })

  it('blocks a data refresh PR labelled needs-you', () => {
    expect(
      run({ LABELS: 'needs-you', HEAD_REF: 'data/weekly-refresh', STUB_FILES: DATA_FILES }),
    ).toBe(1)
  })
})
