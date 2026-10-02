import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'

// review_change keeps a copy of the reviewer's text in RUN_METADATA_DIR.

const source = fs.readFileSync(path.join(__dirname, '../agent-coordinator.sh'), 'utf-8')

function extractFunction(name: string): string {
  const start = source.indexOf(`${name}() {`)
  expect(start).toBeGreaterThan(-1)
  const end = source.indexOf('\n}\n', start)
  return source.slice(start, end + 2)
}

function runReview(reviewText: string, metaDir: (dir: string) => string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-keep-'))
  const app = path.join(dir, 'app')
  fs.mkdirSync(app)
  const git = (...args: string[]) => execFileSync('git', args, { cwd: app, stdio: 'pipe' })
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 't@t')
  git('config', 'user.name', 't')
  fs.writeFileSync(path.join(app, 'a.txt'), 'base\n')
  git('add', '-A')
  git('commit', '-qm', 'base')
  git('update-ref', 'refs/remotes/origin/main', 'HEAD')
  git('checkout', '-qb', 'task')
  fs.writeFileSync(path.join(app, 'a.txt'), 'changed\n')
  git('commit', '-qam', 'change')

  const meta = metaDir(dir)
  fs.writeFileSync(path.join(dir, 'review.txt'), reviewText)
  const script = `
APP_DIR="${app}"
LOG_FILE="${path.join(dir, 'log')}"
RUN_METADATA_DIR="${meta}"
REVIEW_DIFF_MAX_BYTES=60000
CLAUDE_REVIEW_MODEL=m; CLAUDE_REVIEW_MAX_USD=1; CLAUDE_REVIEW_FALLBACK_MODEL=""
log() { echo "$1" >> "$LOG_FILE"; }
lf_now_ns() { echo 1; }
lf_record() { :; }
claude_ran_on_fallback() { return 1; }
claude_json_field() { cat "${path.join(dir, 'review.txt')}"; }
run_claude() { return 0; }
${extractFunction('review_verdict')}
${extractFunction('review_change')}
caller() {
  local REVIEWER_RESULT="not-run" REVIEW_TEXT="" REVIEW_DIFF_BYTES=0
  review_change 7 "Title" "Body"
  local RC=$?
  echo "rc=$RC result=$REVIEWER_RESULT"
}
caller
`
  const out = execFileSync('bash', ['-c', script]).toString().trim()
  return { out, meta }
}

describe('review_change keeps review text', () => {
  const text = 'Looks right.\nVERDICT: APPROVE'

  it('writes exactly one review-<issue>-*.txt with the text', () => {
    const { out, meta } = runReview(text, (d) => path.join(d, 'meta'))
    expect(out).toBe('rc=0 result=approved')
    const files = fs.readdirSync(meta)
    expect(files).toHaveLength(1)
    expect(files[0]).toMatch(/^review-7-\d{8}T\d{6}Z\.txt$/)
    expect(fs.readFileSync(path.join(meta, files[0]), 'utf-8')).toContain(text)
  })

  it('ignores an unwritable directory without changing the outcome', () => {
    const { out } = runReview(text, () => '/proc/nope/meta')
    expect(out).toBe('rc=0 result=approved')
  })

  it('writes nothing for an empty review', () => {
    const { meta } = runReview('', (d) => path.join(d, 'meta'))
    expect(fs.existsSync(meta)).toBe(false)
  })
})
