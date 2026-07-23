import { execSync } from 'child_process'

// ── Public-repo privacy guard ────────────────────────────────────────────────
// This repo is PUBLIC. Planning/strategy/PRD docs must never be committed here
// (a strategy PRD leaked for months before being purged from history — see the
// md-privacy-guard change). Only the two markdown files below may be tracked.
//
// To intentionally add another markdown file, add its exact repo-relative path
// to ALLOWED in the SAME pull request — that makes the decision explicit and
// reviewable rather than accidental.
const ALLOWED = ['README.md', 'CLAUDE.md']

describe('markdown allowlist (public-repo privacy guard)', () => {
  it('only the allowlisted markdown files are tracked in the repo', () => {
    const tracked = execSync('git ls-files', { encoding: 'utf-8' })
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    const markdown = tracked.filter((f) => f.toLowerCase().endsWith('.md'))
    const unexpected = markdown.filter((f) => !ALLOWED.includes(f))
    expect(unexpected).toEqual([])
  })
})
