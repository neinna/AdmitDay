import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'

// Issue #463: agent-run-metadata must not grow without bound. After a
// successful trace submit, lf_emit prunes files older than 14 days.

const source = fs.readFileSync(path.join(__dirname, '../agent-coordinator.sh'), 'utf-8')

function extractFunction(name: string): string {
  const start = source.indexOf(`${name}() {`)
  expect(start).toBeGreaterThan(-1)
  let depth = 0
  let i = source.indexOf('{', start)
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++
    if (source[i] === '}' && --depth === 0) break
  }
  return source.slice(start, i + 1)
}

describe('lf_emit metadata prune', () => {
  let dir: string
  let metaDir: string
  let oldFile: string
  let newFile: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coord-prune-'))
    metaDir = path.join(dir, 'meta')
    fs.mkdirSync(metaDir)
    oldFile = path.join(metaDir, 'issue-1-old.json')
    newFile = path.join(metaDir, 'issue-2-new.json')
    fs.writeFileSync(oldFile, '{}')
    fs.writeFileSync(newFile, '{}')
    const past = new Date(Date.now() - 20 * 86400 * 1000)
    fs.utimesSync(oldFile, past, past)
  })

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  function run(stubBody: string, findPrefix = ''): number {
    const stub = path.join(dir, 'stub.py')
    fs.writeFileSync(stub, `import sys\nsys.stdin.read()\n${stubBody}\nsys.exit(0)\n`)
    const logFile = path.join(dir, 'log')
    fs.writeFileSync(logFile, '')
    const out = execFileSync(
      'bash',
      [
        '-c',
        `
LOG_FILE="${logFile}"
LF_TRACE_SCRIPT="${stub}"
LF_TRACE_PYTHON="python3"
RUN_METADATA_DIR="${metaDir}"
GITHUB_REPO="t/r"
log() { :; }
${findPrefix}
${['lf_now_ns', 'lf_record', 'lf_emit'].map(extractFunction).join('\n')}
LF_RUN_FILE="${dir}/run.jsonl"
: > "$LF_RUN_FILE"
lf_emit "463" "t" "b" "success" "1" "l" "1000" "2000" "ok" "ok" "ok" "merged"
echo "exit=$?"
`,
      ],
      { cwd: dir, encoding: 'utf-8' },
    )
    return Number(/exit=(\d+)/.exec(out)![1])
  }

  it('prunes only files older than 14 days after a successful submit', () => {
    const code = run(`sys.stderr.write("langfuse_trace: submitted trace for issue #463 (outcome=success, spans=0)\\n")`)
    expect(code).toBe(0)
    expect(fs.existsSync(oldFile)).toBe(false)
    expect(fs.existsSync(newFile)).toBe(true)
  })

  it('does not prune when the submit failed', () => {
    const code = run(`sys.stderr.write("langfuse_trace: ConnectionError: boom\\n")`)
    expect(code).toBe(0)
    expect(fs.existsSync(oldFile)).toBe(true)
  })

  it('a failing find does not change the exit path', () => {
    const code = run(
      `sys.stderr.write("langfuse_trace: submitted trace for issue #463 (outcome=success, spans=0)\\n")`,
      'find() { return 1; }',
    )
    expect(code).toBe(0)
  })
})
