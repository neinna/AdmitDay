import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'

// ── agent-coordinator.sh: no leftovers between issues ───────────────────────
// Observed 2026-09-17: #162 exhausted its budget mid-edit. Its three modified
// product files and one untracked test file followed the coordinator through
// `git checkout main` and `git checkout -b task-166-…` onto the NEXT issue's
// branch, where the `git add -A` fallback was about to commit them into #166's
// pull request. Git carries modified tracked files across a branch switch when
// they do not conflict, so neither checkout dropped them.
//
// These tests pin the entry guard that scrubs the tree, and pin the property
// the guard depends on: that discarding leftovers does not also discard the
// environment-specific files the app needs (data/schools.json, .env.local).

const coordinatorSource = fs.readFileSync(
  path.join(__dirname, '../agent-coordinator.sh'),
  'utf-8',
)

describe('agent-coordinator.sh scrubs the tree before starting an issue', () => {
  it('resets and cleans before switching branches, not after', () => {
    const scrubAt = coordinatorSource.indexOf('working tree dirty on entry')
    const checkoutAt = coordinatorSource.indexOf(
      'git checkout main >> "$LOG_FILE" 2>&1 && git pull origin main',
    )
    expect(scrubAt).toBeGreaterThan(-1)
    expect(checkoutAt).toBeGreaterThan(-1)
    // A guard that runs after the branch switch is no guard at all.
    expect(scrubAt).toBeLessThan(checkoutAt)

    const guard = coordinatorSource.slice(scrubAt, checkoutAt)
    expect(guard).toContain('git reset --hard')
    expect(guard).toContain('git clean -fd')
  })

  it('logs what it is about to stage before running git add -A', () => {
    const stageAt = coordinatorSource.indexOf('agent left work uncommitted, staging:')
    const addAt = coordinatorSource.indexOf('git add -A && git commit -m "$COMMIT_TITLE"')
    expect(stageAt).toBeGreaterThan(-1)
    expect(addAt).toBeGreaterThan(-1)
    expect(stageAt).toBeLessThan(addAt)
  })

  it('never uses `git clean -x`, which would delete .env.local and data/schools.json', () => {
    expect(coordinatorSource).not.toMatch(/git clean [^\n]*-[a-z]*x/)
  })
})

describe('reset --hard + clean -fd keeps ignored environment files', () => {
  // The guard is only safe because ignored files survive `git clean -fd`. That
  // is the claim worth testing rather than assuming: data/schools.json is
  // gitignored and copied in at deploy time, and AGENTS.md forbids touching it.
  let repo: string

  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: repo, encoding: 'utf-8' })

  beforeAll(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'coord-clean-'))
    git('init', '-q')
    git('config', 'user.email', 'test@example.com')
    git('config', 'user.name', 'test')
    fs.writeFileSync(path.join(repo, '.gitignore'), 'data/schools.json\n.env.local\n')
    fs.mkdirSync(path.join(repo, 'data'))
    fs.writeFileSync(path.join(repo, 'tracked.ts'), 'original\n')
    git('add', '-A')
    git('commit', '-qm', 'initial')

    // Recreate the observed state: an edited tracked file, an untracked test
    // file, and the two ignored files that must survive.
    fs.writeFileSync(path.join(repo, 'tracked.ts'), 'half-finished edit\n')
    fs.writeFileSync(path.join(repo, 'selectivity.test.ts'), 'leftover\n')
    fs.writeFileSync(path.join(repo, 'data/schools.json'), '{"schools":[]}\n')
    fs.writeFileSync(path.join(repo, '.env.local'), 'SECRET=keep-me\n')

    git('reset', '--hard')
    git('clean', '-fd')
  })

  afterAll(() => fs.rmSync(repo, { recursive: true, force: true }))

  it('restores the edited tracked file', () => {
    expect(fs.readFileSync(path.join(repo, 'tracked.ts'), 'utf-8')).toBe('original\n')
  })

  it('removes the untracked leftover', () => {
    expect(fs.existsSync(path.join(repo, 'selectivity.test.ts'))).toBe(false)
  })

  it('keeps ignored data/schools.json and .env.local', () => {
    expect(fs.existsSync(path.join(repo, 'data/schools.json'))).toBe(true)
    expect(fs.readFileSync(path.join(repo, '.env.local'), 'utf-8')).toBe('SECRET=keep-me\n')
  })

  it('leaves the tree clean', () => {
    expect(git('status', '--porcelain').trim()).toBe('')
  })
})
