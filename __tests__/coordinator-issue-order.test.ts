import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'

// ── agent-coordinator.sh: ascending issue-number order (issue #171) ────────
// The coordinator used to print issue numbers in whatever order the GitHub
// issues API returned them (updated-order by default), not ascending issue
// number. That let a just-labeled issue (e.g. #164) jump ahead of
// earlier-filed ones (e.g. #160) that were labeled first. This pins that the
// script sorts numerically before the run loop ever sees the list.

const coordinatorSource = fs.readFileSync(path.join(__dirname, '../agent-coordinator.sh'), 'utf-8')

function extractIssueNumbersScript(): string {
  const match = coordinatorSource.match(
    /ISSUE_NUMBERS=\$\(curl[\s\S]*?\| python3 -c "\n([\s\S]*?)\n"\)/
  )
  if (!match) {
    throw new Error('Could not locate the ISSUE_NUMBERS python3 snippet in agent-coordinator.sh')
  }
  return match[1]
}

function runIssueNumbersScript(githubIssuesResponse: unknown): number[] {
  const script = extractIssueNumbersScript()
  const out = execFileSync('python3', ['-c', script], {
    input: JSON.stringify(githubIssuesResponse),
    encoding: 'utf-8',
  })
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(Number)
}

describe('agent-coordinator.sh issue ordering (issue #171)', () => {
  it('sorts issue numbers ascending even when the API returns them in updated-order', () => {
    // Mirrors the real incident: #160-#163 were labeled first, but #164 was
    // labeled last and thus most-recently-updated, so GitHub's default
    // ordering put it first in the response.
    const githubResponse = [
      { number: 164 },
      { number: 160 },
      { number: 163 },
      { number: 161 },
      { number: 162 },
    ]
    expect(runIssueNumbersScript(githubResponse)).toEqual([160, 161, 162, 163, 164])
  })

  it('still excludes pull requests from the eligible list', () => {
    const githubResponse = [
      { number: 170, pull_request: {} },
      { number: 165 },
      { number: 166, pull_request: {} },
    ]
    expect(runIssueNumbersScript(githubResponse)).toEqual([165])
  })

  it('does not rely on the source text already being in ascending order', () => {
    // Guards against a fix that only reorders the JSON fixture instead of
    // actually sorting: feed it already-ascending input too.
    const githubResponse = [{ number: 1 }, { number: 2 }, { number: 3 }]
    expect(runIssueNumbersScript(githubResponse)).toEqual([1, 2, 3])
  })
})
