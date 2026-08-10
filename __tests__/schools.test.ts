import * as fs from 'fs'
import * as path from 'path'
import schoolsData from '../schools.json'
import { parseIssueCommand } from '../lib/telegram-utils'
import { getVisibleGroups, capSchoolsByCategory, FREE_TIER_CAP, PAID_TIER_CAP } from '../lib/school-list-utils'
import { SectionGroup, School } from '../types'

describe('schools.json', () => {
  it('loads and is an array', () => {
    expect(Array.isArray(schoolsData)).toBe(true)
  })

  it('has at least 100 schools', () => {
    expect(schoolsData.length).toBeGreaterThan(100)
  })

  it('each school has a name field', () => {
    schoolsData.forEach((school: any) => {
      expect(school).toHaveProperty('name')
    })
  })
})

// ── Issue #4: Footer disclaimer text ────────────────────────────────────────

describe('Footer disclaimer text', () => {
  const footerSource = fs.readFileSync(path.join(__dirname, '../components/Footer.tsx'), 'utf-8')

  it('contains the new disclaimer text', () => {
    expect(footerSource).toContain('Every effort was made to keep this data current.')
  })

  it('contains the AI caveat', () => {
    expect(footerSource).toContain('AI can make mistakes and school data can change.')
  })

  it('contains the confirm deadlines text', () => {
    expect(footerSource).toContain('confirm deadlines and requirements at')
  })

  it('does NOT contain the old NYC-SIFT disclaimer', () => {
    expect(footerSource).not.toContain('Data from NYC-SIFT and NYC DOE Open Data')
  })

  it('links to https://www.myschools.nyc (with www)', () => {
    expect(footerSource).toContain('https://www.myschools.nyc')
  })

  it('myschools.nyc link opens in a new tab', () => {
    expect(footerSource).toContain('target="_blank"')
    expect(footerSource).toContain('rel="noopener noreferrer"')
  })
})

// ── Issue #5: myschools.nyc clickable link ───────────────────────────────────


// ── Issue #3: Telegram /issue command parsing ────────────────────────────────

describe('parseIssueCommand', () => {
  it('returns the title when message starts with /issue', () => {
    expect(parseIssueCommand('/issue Fix SHSAT bug')).toBe('Fix SHSAT bug')
  })

  it('trims leading/trailing whitespace from the title', () => {
    expect(parseIssueCommand('/issue   Add dark mode  ')).toBe('Add dark mode')
  })

  it('returns null for messages not starting with /issue', () => {
    expect(parseIssueCommand('hello')).toBeNull()
    expect(parseIssueCommand('/start')).toBeNull()
    expect(parseIssueCommand('/issue')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseIssueCommand('')).toBeNull()
  })

  it('handles multi-word titles', () => {
    expect(parseIssueCommand('/issue Add Load 15 more button to school list')).toBe(
      'Add Load 15 more button to school list'
    )
  })
})

// ── agent-coordinator.sh: PR-flow invariants (replaces retired pm2 deploy) ──
// The coordinator no longer deploys from the VPS (Vercel deploys from main).
// It runs the agent on a branch, verifies objectively, and opens a PR for
// human review. These tests pin that contract so a regression can't quietly
// reintroduce self-merge-to-main or app deploy steps.

describe('agent-coordinator.sh PR flow', () => {
  const coordinatorSource = fs.readFileSync(path.join(__dirname, '../agent-coordinator.sh'), 'utf-8')
  const langfuseTraceSource = fs.readFileSync(path.join(__dirname, '../scripts/langfuse_trace.py'), 'utf-8')
  const envAgentsExampleSource = fs.readFileSync(path.join(__dirname, '../.env.agents.example'), 'utf-8')

  it('uses the "agent-ok" trigger label (nothing runs unless deliberately labeled)', () => {
    expect(coordinatorSource).toContain('TRIGGER_LABEL="agent-ok"')
  })

  it('does NOT manage the app with pm2 (Vercel deploys the app from main)', () => {
    expect(coordinatorSource).not.toMatch(/pm2\s+(start|restart|reload|delete)\s+(hs-navigator|admitday|next|npm)/)
  })

  it('never merges or pushes to main — it opens a PR for review instead', () => {
    expect(coordinatorSource).not.toMatch(/git merge(\s|$)/)
    expect(coordinatorSource).not.toMatch(/git push origin main\b/)
  })

  it('opens a pull request against main via the PR API', () => {
    expect(coordinatorSource).toContain('github_open_pr')
    expect(coordinatorSource).toContain('POST "/pulls"')
    // JSON body is embedded in a shell double-quoted string, so quotes are escaped
    expect(coordinatorSource).toMatch(/\\"base\\":\\"main\\"/)
  })

  it('objectively verifies by running npm test and npm run build itself', () => {
    expect(coordinatorSource).toContain('npm test')
    expect(coordinatorSource).toContain('npm run build')
  })

  it('enables GitHub auto-merge via the GraphQL mutation on clean approval', () => {
    expect(coordinatorSource).toContain('github_enable_automerge')
    expect(coordinatorSource).toContain('enablePullRequestAutoMerge')
    expect(coordinatorSource).toContain('https://api.github.com/graphql')
    expect(coordinatorSource).toMatch(/mergeMethod:\s*\$?\{?SQUASH|"SQUASH"|mergeMethod, SQUASH/)
  })

  it('extends the reviewer prompt to flag risky changes for live verification', () => {
    expect(coordinatorSource).toContain('RISK: LIVE-VERIFY-NEEDED')
    // The prompt must name the risk categories from the issue's escalation carve-out
    expect(coordinatorSource).toMatch(/database\/connection layer, migrations, seeding/)
  })

  it('escalates a RISK: LIVE-VERIFY-NEEDED review instead of auto-merging', () => {
    // Isolate the success branch that runs after a PR is opened
    const successBranch = coordinatorSource.match(
      /if \[ -n "\$PR_URL" \]; then([\s\S]*?)\n    else\n/
    )
    expect(successBranch).not.toBeNull()
    const body = successBranch![1]
    // The risk check must gate auto-merge: escalated diffs get "needs-review"
    // and skip github_enable_automerge; everything else gets "pr-open" and
    // auto-merge enabled.
    expect(body).toMatch(/RISK: LIVE-VERIFY-NEEDED/)
    expect(body).toMatch(/needs-review/)
    expect(body).toMatch(/github_enable_automerge/)
    expect(body).toMatch(/pr-open/)
  })

  it('escalates instead of auto-merging when the reviewer itself was unavailable (REVIEW_RC 2)', () => {
    // review_change returns 2 when the reviewer call errors/times out — an
    // unreviewed diff is the most extreme case of "can't truly verify" and
    // must never auto-merge unattended, even though REVIEW_TEXT is empty.
    const successBranch = coordinatorSource.match(
      /if \[ -n "\$PR_URL" \]; then([\s\S]*?)\n    else\n/
    )
    expect(successBranch).not.toBeNull()
    const body = successBranch![1]
    expect(body).toMatch(/REVIEW_RC.*-eq 2/)
  })

  it('writes a sanitized run metadata artifact for every Langfuse trace', () => {
    expect(coordinatorSource).toContain('RUN_METADATA_DIR="/home/agent/agent-run-metadata"')
    expect(coordinatorSource).toContain('LF_METADATA_DIR="$RUN_METADATA_DIR"')
    expect(coordinatorSource).toContain('metadata_file')
  })

  it('uses the dedicated agent observability venv for Langfuse emission when present', () => {
    expect(coordinatorSource).toContain('LF_TRACE_PYTHON="${LF_TRACE_PYTHON:-/home/agent/.venvs/agent-observability/bin/python}"')
    expect(coordinatorSource).toContain('timeout 30 "$LF_TRACE_PYTHON" "$LF_TRACE_SCRIPT"')
  })

  it('self-updates from origin/main only while idle on main', () => {
    expect(coordinatorSource).toContain('SELF_UPDATE_INTERVAL_SECONDS="${SELF_UPDATE_INTERVAL_SECONDS:-300}"')
    expect(coordinatorSource).toContain('self_update_from_main()')
    expect(coordinatorSource).toContain('git fetch --quiet origin main')
    expect(coordinatorSource).toContain('git pull --ff-only --quiet origin main')
    expect(coordinatorSource).toContain('pm2 restart agent-coordinator --update-env')
    expect(coordinatorSource).toContain('if [ "$BRANCH" != "main" ]; then')
    expect(coordinatorSource).toContain('git status --porcelain --untracked-files=no')
    expect(coordinatorSource).toContain('maybe_self_update_or_exit')
  })

  it('treats provider or billing outages as provider-unavailable, not failed implementation', () => {
    expect(coordinatorSource).toContain('claude_provider_unavailable()')
    expect(coordinatorSource).toContain('credit balance|usage limit|rate limit|overloaded|temporarily unavailable|api_error')
    expect(coordinatorSource).toContain('OUTCOME="provider-unavailable"')
    expect(coordinatorSource).toContain('github_label "$ISSUE_NUMBER" "$TRIGGER_LABEL"')
    expect(coordinatorSource).toContain('return 75')
    expect(coordinatorSource).toContain('Provider halt: sleeping 10 minutes before retrying.')
  })

  it('treats Claude max-budget hits as budget-exhausted, not provider outage or implementation failure', () => {
    expect(coordinatorSource).toContain('claude_budget_exhausted()')
    expect(coordinatorSource).toContain('--max-budget-usd|max(?:imum)? budget')
    expect(coordinatorSource).toContain('OUTCOME="budget-exhausted"')
    expect(coordinatorSource).toContain('This is a controlled cost stop')
    expect(coordinatorSource).toContain('GH_LABEL="needs-review"')
    expect(coordinatorSource).toContain('return 0')
  })

  it('keeps Claude API but caps cost and chooses models per coordinator phase', () => {
    for (const setting of [
      'CLAUDE_IMPLEMENT_MODEL="${CLAUDE_IMPLEMENT_MODEL:-sonnet}"',
      'CLAUDE_REVIEW_MODEL="${CLAUDE_REVIEW_MODEL:-sonnet}"',
      'CLAUDE_PLANNER_MODEL="${CLAUDE_PLANNER_MODEL:-sonnet}"',
      'CLAUDE_IMPLEMENT_MAX_USD="${CLAUDE_IMPLEMENT_MAX_USD:-2.00}"',
      'CLAUDE_REVIEW_MAX_USD="${CLAUDE_REVIEW_MAX_USD:-0.75}"',
      'CLAUDE_PLANNER_MAX_USD="${CLAUDE_PLANNER_MAX_USD:-0.50}"',
      '--model "$MODEL"',
      '--max-budget-usd "$MAX_BUDGET_USD"',
      '< /dev/null',
    ]) {
      expect(coordinatorSource).toContain(setting)
    }

    expect(coordinatorSource).toContain('"$CLAUDE_REVIEW_MODEL" "$CLAUDE_REVIEW_MAX_USD"')
    expect(coordinatorSource).toContain('"$CLAUDE_PLANNER_MODEL" "$CLAUDE_PLANNER_MAX_USD"')
    expect(coordinatorSource).toContain('"$CLAUDE_IMPLEMENT_MODEL" "$CLAUDE_IMPLEMENT_MAX_USD"')
    expect(envAgentsExampleSource).toContain('CLAUDE_IMPLEMENT_MAX_USD=2.00')
    expect(envAgentsExampleSource).toContain('Max budgets cap each individual')
  })

  it('records the baseline fields needed before model routing', () => {
    for (const field of ['test_result', 'build_result', 'reviewer_result', 'pr_outcome']) {
      expect(coordinatorSource).toContain(field)
      expect(langfuseTraceSource).toContain(`"${field}"`)
    }
  })

  it('attributes Langfuse dashboard user consumption to the coding agent', () => {
    expect(langfuseTraceSource).toContain('user_id="coding-agent"')
  })

  it('keeps private task context out of Langfuse payloads', () => {
    expect(langfuseTraceSource).toContain('No prompt text, no diffs, no file contents')
    expect(langfuseTraceSource).not.toContain('"issue_body"')
    expect(langfuseTraceSource).not.toContain('"prompt"')
    expect(langfuseTraceSource).not.toContain('"diff"')
  })

  it('documents Langfuse Cloud as the configured VPS baseline', () => {
    expect(envAgentsExampleSource).toContain('Keys come from your Langfuse Cloud project')
    expect(envAgentsExampleSource).toContain('LANGFUSE_HOST=https://cloud.langfuse.com')
  })
})

// ── Issue #187: Coordinator should reconcile its own stuck PRs ──────────────
// The pipeline is event-driven and events get dropped (e.g. the 2026-08-06
// GitHub Actions outage that left PRs #165/#167 with no "test" check run at
// all, permanently blocked by branch protection for four days). These tests
// pin the periodic reconciliation sweep: it only ever touches PRs this
// coordinator itself opened, it re-triggers CI rather than merging, and it
// escalates real conflicts instead of trying to auto-resolve them.

describe('agent-coordinator.sh reconcile_open_prs', () => {
  const coordinatorSource = fs.readFileSync(path.join(__dirname, '../agent-coordinator.sh'), 'utf-8')
  const reconcileFn = coordinatorSource.match(/reconcile_open_prs\(\) \{[\s\S]*?\n\}\n/)

  it('defines reconcile_open_prs and runs it from the main loop, throttled independently of the self-update pass', () => {
    expect(reconcileFn).not.toBeNull()
    expect(coordinatorSource).toContain('maybe_reconcile_open_prs')
    // Wired in alongside maybe_self_update_or_exit, not on every 60s tick
    expect(coordinatorSource).toMatch(/maybe_self_update_or_exit\n\s*maybe_reconcile_open_prs\n/)
    expect(coordinatorSource).toContain('RECONCILE_INTERVAL_SECONDS="${RECONCILE_INTERVAL_SECONDS:-1800}"')
  })

  it('only touches PRs carrying this coordinator\'s own task-<issue>- branch prefix', () => {
    const body = reconcileFn![0]
    expect(body).toMatch(/re\.match\(r'\^task-\[0-9\]\+-', ref\)/)
  })

  it('re-triggers CI / brings the branch current via update-branch when the test check is missing or the branch is behind', () => {
    const body = reconcileFn![0]
    expect(body).toContain('/pulls/${NUM}/update-branch')
    expect(body).toMatch(/HAS_TEST_CHECK.*!=.*1.*MERGEABLE_STATE.*=.*behind/)
    expect(body).toContain('check-runs')
  })

  it('escalates a real merge conflict with needs-review instead of trying to resolve it', () => {
    const body = reconcileFn![0]
    expect(body).toMatch(/MERGEABLE_STATE.*=.*dirty/)
    expect(body).toContain('github_label "$ISSUE_NUM" "needs-review"')
    expect(body).toContain('github_comment')
    expect(body).toMatch(/merge conflict/)
  })

  it('never merges and never pushes to main from within reconciliation', () => {
    const body = reconcileFn![0]
    expect(body).not.toMatch(/git merge(\s|$)/)
    expect(body).not.toMatch(/git push origin main\b/)
    expect(body).not.toContain('gh_api PUT "/pulls/${NUM}/merge"')
    expect(body).not.toContain('"/merge"')
  })

  it('does not use Telegram for escalation — needs-review label plus an issue comment only', () => {
    const body = reconcileFn![0]
    expect(body).not.toContain('telegram ')
    expect(body).not.toContain('telegram"')
  })

  it('emits a reconcile span via lf_record, consistent with the other phases', () => {
    const body = reconcileFn![0]
    expect(body).toContain('lf_record "reconcile"')
  })

  it('never lets a reconciliation failure kill the main loop', () => {
    expect(coordinatorSource).toContain('reconcile_open_prs || log')
  })
})

// ── Issue #2: Pagination — getVisibleGroups ──────────────────────────────────

function makeGroup(type: string, count: number, startIndex: number): SectionGroup {
  const schools = Array.from({ length: count }, (_, i) => ({
    dbn: `${type}-${i}`,
    name: `School ${i}`,
    borough: 'Manhattan',
    size: 'medium',
    total_students: null,
    applicants_per_seat: null,
    academic_score_pct: null,
    survey_score_pct: null,
    admissions_types: [],
    programs: [],
    flags: {
      has_shsat: false, has_audition: false, has_screened: false,
      has_open: true, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false,
    },
    doe_data: { overview: '', language: '', extracurriculars: '', website: '', phone: '', address: '', zip: '' },
    sift_url: '',
    last_verified: '',
  })) as any[]
  return { type: type as any, label: type, schools, startIndex }
}

describe('getVisibleGroups', () => {
  it('returns only the first visibleCount schools across groups', () => {
    const groups = [makeGroup('lottery', 10, 0), makeGroup('screened', 10, 10)]
    const visible = getVisibleGroups(groups, 15)
    const totalVisible = visible.reduce((sum, g) => sum + g.schools.length, 0)
    expect(totalVisible).toBe(15)
  })

  it('returns all schools when visibleCount exceeds total', () => {
    const groups = [makeGroup('lottery', 5, 0), makeGroup('screened', 3, 5)]
    const visible = getVisibleGroups(groups, 100)
    expect(visible[0].schools.length).toBe(5)
    expect(visible[1].schools.length).toBe(3)
  })

  it('fills from first group before moving to next', () => {
    const groups = [makeGroup('lottery', 20, 0), makeGroup('screened', 10, 20)]
    const visible = getVisibleGroups(groups, 15)
    expect(visible.length).toBe(1)
    expect(visible[0].schools.length).toBe(15)
  })

  it('returns empty array when visibleCount is 0', () => {
    const groups = [makeGroup('lottery', 10, 0)]
    expect(getVisibleGroups(groups, 0)).toEqual([])
  })

  it('preserves startIndex from original groups', () => {
    const groups = [makeGroup('lottery', 20, 0), makeGroup('screened', 10, 20)]
    const visible = getVisibleGroups(groups, 25)
    expect(visible[1].startIndex).toBe(20)
  })
})

// ── Issue #7: Remove Note box from list page ────────────────────────────────


// ── Issue #8: Unified Footer disclaimer + no Note box on list page ───────────

describe('Issue #8: Footer unified disclaimer', () => {
  const footerSource = fs.readFileSync(path.join(__dirname, '../components/Footer.tsx'), 'utf-8')

  it('contains the DOE tiebreaker sentence', () => {
    expect(footerSource).toContain("DOE&apos;s own prediction tool uses randomness as a tiebreaker")
  })

  it('contains the no-guarantee clause', () => {
    expect(footerSource).toContain('no tool can guarantee an offer')
  })

  it('uses the shortened before-submitting text', () => {
    expect(footerSource).toContain('Before submitting, confirm deadlines and requirements at')
  })

  it('does NOT contain the old verbose phrasing', () => {
    expect(footerSource).not.toContain('Before submitting your application,')
  })

  it('does NOT contain the old "Also," phrasing', () => {
    expect(footerSource).not.toContain('Also, AI can make mistakes')
  })
})


// ── Issue #13: Last verified date on deadline items ─────────────────────────


// ── Issue #14: Test step in GitHub Actions deploy pipeline ──────────────────


// ── Issue #9: Jest wired up ──────────────────────────────────────────────────

describe('Issue #9: Jest setup in package.json', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8'))

  it('has "test": "jest" in scripts', () => {
    expect(pkg.scripts?.test).toBe('jest')
  })

  it('has jest in devDependencies', () => {
    expect(pkg.devDependencies).toHaveProperty('jest')
  })

  it('has @types/jest in devDependencies', () => {
    expect(pkg.devDependencies).toHaveProperty('@types/jest')
  })

  it('has ts-jest in devDependencies', () => {
    expect(pkg.devDependencies).toHaveProperty('ts-jest')
  })
})

// ── Issue #12/#84: Locked paid tier placeholders (removed in #84) ────────────

describe('Issue #12/#84: SchoolList locked expand placeholder removed', () => {
  const schoolListSource = fs.readFileSync(path.join(__dirname, '../components/SchoolList.tsx'), 'utf-8')

  it('does NOT show a lock icon SVG (locked UI removed in #84)', () => {
    expect(schoolListSource).not.toContain('M12 15v2m-6 4h12')
  })

  it('does NOT show "Full Access" label (locked UI removed in #84)', () => {
    expect(schoolListSource).not.toContain('Full Access')
  })

  it('does NOT show "coming soon" label in the expand area', () => {
    expect(schoolListSource).not.toContain('coming soon')
  })

  it('does NOT have a working "Load 15 more" button', () => {
    expect(schoolListSource).not.toContain('>Load 15 more<')
    expect(schoolListSource).not.toContain('Load 15 more\n')
  })
})


// ── Issue #11: Fix incorrect "rank up to 12 schools" copy ───────────────────


// ── Issue #15: PostHog analytics ────────────────────────────────────────────

describe('Issue #15: PosthogProvider component', () => {
  const providerSource = fs.readFileSync(path.join(__dirname, '../components/PosthogProvider.tsx'), 'utf-8')

  it('is a client component', () => {
    expect(providerSource).toContain("'use client'")
  })

  it('imports posthog-js', () => {
    expect(providerSource).toContain("from 'posthog-js'")
  })

  it('imports PostHogProvider from posthog-js/react', () => {
    expect(providerSource).toContain("from 'posthog-js/react'")
  })

  it('calls posthog.init with NEXT_PUBLIC_POSTHOG_KEY', () => {
    expect(providerSource).toContain('NEXT_PUBLIC_POSTHOG_KEY')
    expect(providerSource).toContain('posthog.init')
  })

  it('exports a default PHProvider component', () => {
    expect(providerSource).toContain('export default function PHProvider')
  })
})

describe('Issue #15: layout.tsx wraps with PHProvider', () => {
  const layoutSource = fs.readFileSync(path.join(__dirname, '../app/layout.tsx'), 'utf-8')

  it('imports PHProvider', () => {
    expect(layoutSource).toContain("import PHProvider from '@/components/PosthogProvider'")
  })

  it('wraps children with PHProvider', () => {
    expect(layoutSource).toContain('<PHProvider>')
    expect(layoutSource).toContain('</PHProvider>')
  })

})


// ── Issue #16: Season Pass banners + last verified fix ───────────────────────





// ── Issue #10: PostHog event tracking ───────────────────────────────────────


describe('Issue #10: list_viewed event in SchoolList', () => {
  const schoolListSource = fs.readFileSync(path.join(__dirname, '../components/SchoolList.tsx'), 'utf-8')

  it('imports usePostHog from posthog-js/react', () => {
    expect(schoolListSource).toContain("from 'posthog-js/react'")
  })

  it('calls posthog.capture with list_viewed', () => {
    expect(schoolListSource).toContain("capture('list_viewed'")
  })

  it('captures total_count in list_viewed', () => {
    expect(schoolListSource).toContain('total_count')
  })
})


describe('Issue #10: source_link_clicked event in SchoolRow', () => {
  const schoolRowSource = fs.readFileSync(path.join(__dirname, '../components/SchoolRow.tsx'), 'utf-8')

  it('imports usePostHog from posthog-js/react', () => {
    expect(schoolRowSource).toContain("from 'posthog-js/react'")
  })

  // Issue #53: source attribution and NYC-SIFT link removed — these events no longer fire
  it('does NOT call posthog.capture with source_link_clicked (removed in #53)', () => {
    expect(schoolRowSource).not.toContain("capture('source_link_clicked'")
  })
})


// ── Issue #21: Fix next.config.js Sentry config crashing Server Actions ────

describe('Issue #21: next.config.js no webpack block in withSentryConfig', () => {
  const nextConfigSource = fs.readFileSync(path.join(__dirname, '../next.config.js'), 'utf-8')

  it('does NOT contain the automaticVercelMonitors option (Vercel-only, crashes DigitalOcean)', () => {
    expect(nextConfigSource).not.toContain('automaticVercelMonitors')
  })

  it('does NOT contain a webpack block inside withSentryConfig options', () => {
    // The webpack block was the root cause of "Cannot read properties of undefined (reading 'workers')"
    expect(nextConfigSource).not.toContain('webpack: {')
  })

  it('does NOT contain treeshake/removeDebugLogging inside withSentryConfig', () => {
    expect(nextConfigSource).not.toContain('removeDebugLogging')
  })
})

describe('Issue #21: sentry.server.config.ts reduced tracesSampleRate and sendDefaultPii', () => {
  const serverConfigSource = fs.readFileSync(path.join(__dirname, '../sentry.server.config.ts'), 'utf-8')

  it('has tracesSampleRate set to 0.1 (not 1)', () => {
    expect(serverConfigSource).toContain('tracesSampleRate: 0.1')
    expect(serverConfigSource).not.toContain('tracesSampleRate: 1,')
  })

  it('has sendDefaultPii set to false', () => {
    expect(serverConfigSource).toContain('sendDefaultPii: false')
    expect(serverConfigSource).not.toContain('sendDefaultPii: true')
  })
})

// ── Issue #19: Sentry source maps configuration ─────────────────────────────

describe('Issue #19: Sentry source maps in next.config.js', () => {
  const nextConfigSource = fs.readFileSync(path.join(__dirname, '../next.config.js'), 'utf-8')

  it('has authToken referencing SENTRY_AUTH_TOKEN env var', () => {
    expect(nextConfigSource).toContain('authToken: process.env.SENTRY_AUTH_TOKEN')
  })

  it('has sourcemaps configuration block', () => {
    expect(nextConfigSource).toContain('sourcemaps:')
  })

  it('sets deleteSourcemapsAfterUpload to true', () => {
    expect(nextConfigSource).toContain('deleteSourcemapsAfterUpload: true')
  })

  it('retains widenClientFileUpload: true for broader source map coverage', () => {
    expect(nextConfigSource).toContain('widenClientFileUpload: true')
  })

  it('has org and project set for Sentry upload targeting', () => {
    expect(nextConfigSource).toContain('org: "long-tail-studio"')
    expect(nextConfigSource).toContain('project: "admitday"')
  })
})

// ── Issue #17: Built by Long Tail Studio footer ──────────────────────────────

describe('Issue #17: Built by Long Tail Studio footer', () => {
  const footerSource = fs.readFileSync(path.join(__dirname, '../components/Footer.tsx'), 'utf-8')

  it('contains Built by Long Tail Studio text', () => {
    expect(footerSource).toContain('Built by Long Tail Studio')
  })

  it('uses subtle low-contrast styling', () => {
    expect(footerSource).toContain('text-gray-300')
  })
})

// ── Issue #18: Guard onRequestError against null errors ─────────────────────

describe('Issue #18: instrumentation.ts onRequestError null guard', () => {
  const instrSource = fs.readFileSync(path.join(__dirname, '../instrumentation.ts'), 'utf-8')

  it('exports onRequestError as a named function (not a direct alias)', () => {
    // Must be a wrapper function, not `= Sentry.captureRequestError`
    expect(instrSource).toContain('export const onRequestError')
    expect(instrSource).not.toMatch(/export const onRequestError\s*=\s*Sentry\.captureRequestError\s*;/)
  })

  it('guards against null errors before calling captureRequestError', () => {
    expect(instrSource).toContain('if (err == null) return')
  })

  it('still calls Sentry.captureRequestError for non-null errors', () => {
    expect(instrSource).toContain('Sentry.captureRequestError(err')
  })
})

describe('Issue #18: sentry.server.config.ts beforeSend null-digest filter', () => {
  const serverConfigSource = fs.readFileSync(path.join(__dirname, '../sentry.server.config.ts'), 'utf-8')

  it('has a beforeSend hook defined', () => {
    expect(serverConfigSource).toContain('beforeSend')
  })

  it('filters TypeError with the null-digest message', () => {
    expect(serverConfigSource).toContain("Cannot read properties of null (reading 'digest')")
  })

  it('returns null (drops the event) for the null-digest TypeError', () => {
    // The filter should return null to drop matching events
    expect(serverConfigSource).toContain('return null')
  })

  it('returns the event unchanged for other errors', () => {
    expect(serverConfigSource).toContain('return event')
  })
})

// ── Issue #22: Thumbs up/down feedback row ───────────────────────────────────

describe('Issue #22: FeedbackRow component', () => {
  const feedbackSource = fs.readFileSync(path.join(__dirname, '../components/FeedbackRow.tsx'), 'utf-8')

  it('is a client component', () => {
    expect(feedbackSource).toContain("'use client'")
  })

  it('imports usePostHog from posthog-js/react', () => {
    expect(feedbackSource).toContain("from 'posthog-js/react'")
  })

  it('uses localStorage key feedback_school_list', () => {
    expect(feedbackSource).toContain('feedback_school_list')
  })

  it('uses localStorage key feedback_requirements', () => {
    expect(feedbackSource).toContain('feedback_requirements')
  })

  it('captures screen_feedback posthog event', () => {
    expect(feedbackSource).toContain("capture('screen_feedback'")
  })

  it('captures screen property in posthog event', () => {
    expect(feedbackSource).toContain('screen,')
  })

  it('captures rating property in posthog event', () => {
    expect(feedbackSource).toContain('rating: value')
  })

  it('shows thumbs up emoji button', () => {
    expect(feedbackSource).toContain('👍')
  })

  it('shows thumbs down emoji button', () => {
    expect(feedbackSource).toContain('👎')
  })

  it('does NOT show Thanks for the feedback! text (visual state is the only confirmation)', () => {
    expect(feedbackSource).not.toContain('Thanks for the feedback!')
  })

  it('accepts school_list and requirements as screen prop type', () => {
    expect(feedbackSource).toContain("'school_list' | 'requirements'")
  })
})

describe('Issue #22: FeedbackRow added to SchoolList', () => {
  const schoolListSource = fs.readFileSync(path.join(__dirname, '../components/SchoolList.tsx'), 'utf-8')

  it('imports FeedbackRow', () => {
    expect(schoolListSource).toContain("import FeedbackRow from './FeedbackRow'")
  })

  it('renders FeedbackRow with school_list screen', () => {
    expect(schoolListSource).toContain('<FeedbackRow screen="school_list"')
  })
})


// ── Issue #23: Move feedback thumbs to summary bar ───────────────────────────

describe('Issue #23: FeedbackRow redesign — toggle and no text', () => {
  const feedbackSource = fs.readFileSync(path.join(__dirname, '../components/FeedbackRow.tsx'), 'utf-8')

  it('supports deselect by toggling the same rating (null when same clicked)', () => {
    expect(feedbackSource).toContain('rating === value ? null : value')
  })

  it('calls localStorage.removeItem when deselecting', () => {
    expect(feedbackSource).toContain('localStorage.removeItem')
  })

  it('applies green background class for thumbs up selected', () => {
    expect(feedbackSource).toContain('bg-green-100')
  })

  it('applies red background class for thumbs down selected', () => {
    expect(feedbackSource).toContain('bg-red-100')
  })

  it('applies opacity-40 to unselected button', () => {
    expect(feedbackSource).toContain('opacity-40')
  })

  it('applies feedback-pop animation on click', () => {
    expect(feedbackSource).toContain('feedback-pop')
  })

  it('does NOT contain "Was this helpful?" text', () => {
    expect(feedbackSource).not.toContain('Was this helpful?')
  })

  it('uses animating state for pop animation', () => {
    expect(feedbackSource).toContain('animating')
  })
})

describe('Issue #23: FeedbackRow placed in SummaryBar (SchoolList)', () => {
  const schoolListSource = fs.readFileSync(path.join(__dirname, '../components/SchoolList.tsx'), 'utf-8')

  it('FeedbackRow is inside SummaryBar function', () => {
    const summaryBarBlock = schoolListSource.slice(
      schoolListSource.indexOf('function SummaryBar'),
      schoolListSource.indexOf('// ── Column header row'),
    )
    expect(summaryBarBlock).toContain('<FeedbackRow screen="school_list"')
  })

  it('FeedbackRow is NOT rendered standalone at the bottom of SchoolList', () => {
    // The only usage is inside SummaryBar (the standalone bottom usage is gone)
    const feedbackRowUses = schoolListSource.match(/<FeedbackRow/g) ?? []
    expect(feedbackRowUses.length).toBe(1)
  })

  it('globals.css contains feedback-pop keyframe', () => {
    const cssSource = fs.readFileSync(path.join(__dirname, '../app/globals.css'), 'utf-8')
    expect(cssSource).toContain('@keyframes feedback-pop')
    expect(cssSource).toContain('scale(1.1)')
  })
})


// ── Issue #34: Remove commute filter entirely ────────────────────────────────

describe('Issue #34: commute removed from types/index.ts', () => {
  const typesSource = fs.readFileSync(path.join(__dirname, '../types/index.ts'), 'utf-8')

  it('does NOT contain commute field in UserInputs', () => {
    expect(typesSource).not.toContain('commute')
  })
})



// ── Issue #35: Replace borough dropdown with multi-select checkboxes ─────────

describe('Issue #35: types/index.ts boroughs array', () => {
  const typesSource = fs.readFileSync(path.join(__dirname, '../types/index.ts'), 'utf-8')

  it('UserInputs has boroughs: string[] (not borough: string in UserInputs)', () => {
    expect(typesSource).toContain('boroughs: string[]')
    // UserInputs should not have a singular borough field (School still has borough: string which is fine)
    const userInputsBlock = typesSource.slice(typesSource.indexOf('export interface UserInputs'))
    expect(userInputsBlock).not.toContain('borough: string')
  })
})



describe('Issue #35: SchoolRow isLocal uses boroughs array', () => {
  const schoolRowSource = fs.readFileSync(path.join(__dirname, '../components/SchoolRow.tsx'), 'utf-8')

  it('isLocal checks boroughs array length and includes', () => {
    expect(schoolRowSource).toContain('userInputs.boroughs.length > 0')
    expect(schoolRowSource).toContain('userInputs.boroughs.includes(school.borough)')
  })

  it('does NOT use the old All Boroughs string check', () => {
    expect(schoolRowSource).not.toContain("'All Boroughs'")
  })
})

// ── Issue #36: Update homepage title and tagline ─────────────────────────────


// ── Issue #37: Replace academic level with Academic Rating multi-select ───────

describe('Issue #37: types/index.ts academicRatings array', () => {
  const typesSource = fs.readFileSync(path.join(__dirname, '../types/index.ts'), 'utf-8')

  it('UserInputs has academicRatings array (not academicLevel)', () => {
    expect(typesSource).toContain('academicRatings:')
    expect(typesSource).not.toContain('academicLevel:')
  })

  it('academicRatings type includes exceptional, strong, above_average', () => {
    expect(typesSource).toContain('exceptional')
    expect(typesSource).toContain('strong')
    expect(typesSource).toContain('above_average')
  })
})



describe('Issue #37: SchoolRow No score badge', () => {
  const schoolRowSource = fs.readFileSync(path.join(__dirname, '../components/SchoolRow.tsx'), 'utf-8')

  it('renders No score badge when academic_score_pct is null', () => {
    expect(schoolRowSource).toContain('school.academic_score_pct === null')
    expect(schoolRowSource).toContain('No score')
  })

  it('No score badge uses gray styling', () => {
    const nullBlock = schoolRowSource.slice(
      schoolRowSource.indexOf('academic_score_pct === null'),
      schoolRowSource.indexOf('academic_score_pct === null') + 200,
    )
    expect(nullBlock).toContain('bg-gray-100')
    expect(nullBlock).toContain('text-gray-400')
  })
})

// ── Issue #38: Fix academicRatings param mismatch / eligibility / borough ────

// Inline helpers mirroring the fixed logic in app/list/page.tsx for behavioral testing.
function matchesAcademicRating38(score: number | null, ratings: string[]): boolean {
  if (score === null) return ratings.includes('above_average')
  if (ratings.includes('exceptional') && score >= 90) return true
  if (ratings.includes('strong') && score >= 70 && score < 90) return true
  if (ratings.includes('above_average') && score >= 50 && score < 70) return true
  return false
}

function makeSchool38(overrides: {
  has_open?: boolean; has_screened?: boolean; has_shsat?: boolean; has_audition?: boolean;
  academic_score_pct?: number | null; borough?: string;
}): any {
  return {
    dbn: 'TEST',
    name: 'Test School',
    borough: overrides.borough ?? 'Manhattan',
    size: 'medium',
    total_students: null,
    applicants_per_seat: null,
    academic_score_pct: overrides.academic_score_pct ?? null,
    survey_score_pct: null,
    admissions_types: [],
    programs: [],
    flags: {
      has_open: overrides.has_open ?? false,
      has_screened: overrides.has_screened ?? false,
      has_shsat: overrides.has_shsat ?? false,
      has_audition: overrides.has_audition ?? false,
      has_borough_priority: false,
      is_hidden_gem: false,
      has_consortium: false,
      has_ib: false,
    },
    doe_data: { overview: '', language: '', extracurriculars: '', website: '', phone: '', address: '', zip: '' },
    sift_url: '',
    last_verified: '',
  }
}

function isEligible38(school: any, inputs: { academicRatings: string[]; shsat: boolean; auditions: boolean }): boolean {
  const showScreened = inputs.academicRatings.includes('exceptional') || inputs.academicRatings.includes('strong')
  if (school.flags.has_open) return true
  if (school.flags.has_screened && showScreened) return true
  if (school.flags.has_shsat && inputs.shsat) return true
  if (school.flags.has_audition && inputs.auditions) return true
  return matchesAcademicRating38(school.academic_score_pct, inputs.academicRatings)
}

function noBorough38(boroughs: string[]): boolean {
  return boroughs.length === 0 || boroughs.length >= 5
}

function applyFilters38(schools: any[], inputs: { academicRatings: string[]; shsat: boolean; auditions: boolean; boroughs: string[] }): any[] {
  return schools.filter((school) => {
    if (!isEligible38(school, inputs)) return false
    if (!noBorough38(inputs.boroughs) && !inputs.boroughs.includes(school.borough)) return false
    return true
  })
}

describe('Issue #38: isEligible — open schools always eligible', () => {
  it('exceptional: open school with low score (55) is included', () => {
    const school = makeSchool38({ has_open: true, academic_score_pct: 55 })
    expect(isEligible38(school, { academicRatings: ['exceptional'], shsat: false, auditions: false })).toBe(true)
  })

  it('exceptional: open school with null score is included', () => {
    const school = makeSchool38({ has_open: true, academic_score_pct: null })
    expect(isEligible38(school, { academicRatings: ['exceptional'], shsat: false, auditions: false })).toBe(true)
  })

  it('exceptional: screened school is included (showScreened=true)', () => {
    const school = makeSchool38({ has_screened: true, academic_score_pct: 80 })
    expect(isEligible38(school, { academicRatings: ['exceptional'], shsat: false, auditions: false })).toBe(true)
  })

  it('exceptional: shsat school included when shsat=true', () => {
    const school = makeSchool38({ has_shsat: true, academic_score_pct: 95 })
    expect(isEligible38(school, { academicRatings: ['exceptional'], shsat: true, auditions: false })).toBe(true)
  })

  it('exceptional: audition school included when auditions=true', () => {
    const school = makeSchool38({ has_audition: true, academic_score_pct: 70 })
    expect(isEligible38(school, { academicRatings: ['exceptional'], shsat: false, auditions: true })).toBe(true)
  })
})

describe('Issue #38: isEligible — above_average shows open but not screened', () => {
  it('above_average: open school is included', () => {
    const school = makeSchool38({ has_open: true, academic_score_pct: 60 })
    expect(isEligible38(school, { academicRatings: ['above_average'], shsat: false, auditions: false })).toBe(true)
  })

  it('above_average: screened school is NOT included (showScreened=false)', () => {
    const school = makeSchool38({ has_screened: true, academic_score_pct: 95 })
    expect(isEligible38(school, { academicRatings: ['above_average'], shsat: false, auditions: false })).toBe(false)
  })

  it('above_average: shsat school NOT included when shsat=false', () => {
    const school = makeSchool38({ has_shsat: true, academic_score_pct: 95 })
    expect(isEligible38(school, { academicRatings: ['above_average'], shsat: false, auditions: false })).toBe(false)
  })
})

describe('Issue #38: auditions=true includes audition schools', () => {
  it('auditions=true returns audition school', () => {
    const school = makeSchool38({ has_audition: true })
    expect(isEligible38(school, { academicRatings: ['exceptional'], shsat: false, auditions: true })).toBe(true)
  })

  it('auditions=false excludes audition-only school', () => {
    const school = makeSchool38({ has_audition: true })
    expect(isEligible38(school, { academicRatings: ['exceptional'], shsat: false, auditions: false })).toBe(false)
  })
})

describe('Issue #38: noBorough — all 5 boroughs behaves same as no filter', () => {
  it('empty boroughs → noBorough=true', () => {
    expect(noBorough38([])).toBe(true)
  })

  it('all 5 boroughs selected → noBorough=true', () => {
    expect(noBorough38(['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'])).toBe(true)
  })

  it('single borough → noBorough=false', () => {
    expect(noBorough38(['Manhattan'])).toBe(false)
  })

  it('3 boroughs → noBorough=false', () => {
    expect(noBorough38(['Manhattan', 'Brooklyn', 'Queens'])).toBe(false)
  })

  it('all 5 boroughs: schools from all boroughs are returned', () => {
    const allBoroughs = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island']
    const schools = allBoroughs.map(b => makeSchool38({ has_open: true, borough: b }))
    const results = applyFilters38(schools, { academicRatings: ['exceptional'], shsat: false, auditions: false, boroughs: allBoroughs })
    expect(results.length).toBe(5)
  })
})

describe('Issue #38: single borough filter', () => {
  it('only returns schools from the selected borough', () => {
    const schools = [
      makeSchool38({ has_open: true, borough: 'Manhattan' }),
      makeSchool38({ has_open: true, borough: 'Brooklyn' }),
      makeSchool38({ has_open: true, borough: 'Queens' }),
    ]
    const results = applyFilters38(schools, { academicRatings: ['exceptional'], shsat: false, auditions: false, boroughs: ['Manhattan'] })
    expect(results.length).toBe(1)
    expect(results[0].borough).toBe('Manhattan')
  })
})

describe('Issue #38: source — isEligible puts has_open before matchesAcademicRating gate', () => {
  const libSource = fs.readFileSync(path.join(__dirname, '../lib/school-list-utils.ts'), 'utf-8')
  const isEligibleBlock = libSource.slice(
    libSource.indexOf('function isEligible('),
    libSource.indexOf('function applyFilters('),
  )

  it('has_open check appears before matchesAcademicRating in isEligible', () => {
    const openIdx = isEligibleBlock.indexOf('has_open')
    const matchIdx = isEligibleBlock.indexOf('matchesAcademicRating')
    expect(openIdx).toBeGreaterThan(-1)
    expect(matchIdx).toBeGreaterThan(-1)
    expect(openIdx).toBeLessThan(matchIdx)
  })

  it('matchesAcademicRating is NOT used as a top-level gate (no early return)', () => {
    // The old buggy pattern was: if (!matchesAcademicRating(...)) return false
    expect(isEligibleBlock).not.toContain('if (!matchesAcademicRating')
  })
})

describe('Issue #38: source — noBorough handles all 5 boroughs', () => {
  const libSource = fs.readFileSync(path.join(__dirname, '../lib/school-list-utils.ts'), 'utf-8')
  const noBoroughBlock = libSource.slice(
    libSource.indexOf('function noBorough('),
    libSource.indexOf('function matchesAcademicRating('),
  )

  it('noBorough returns true for length >= 5', () => {
    expect(noBoroughBlock).toContain('boroughs.length >= 5')
  })

  it('noBorough still returns true for empty array', () => {
    expect(noBoroughBlock).toContain('boroughs.length === 0')
  })
})

// ── Issue #39: Per-school requirements page + Full Access copy ────────────────




// ── Issue #40: Cap school list at 15, balance categories, sync requirements page ───

function makeSchool(overrides: Partial<School> & { dbn: string }): School {
  return {
    dbn: overrides.dbn,
    name: overrides.name ?? `School ${overrides.dbn}`,
    borough: overrides.borough ?? 'Manhattan',
    size: overrides.size ?? 'medium',
    total_students: null,
    applicants_per_seat: null,
    academic_score_pct: overrides.academic_score_pct ?? null,
    survey_score_pct: null,
    admissions_types: overrides.admissions_types ?? ['Open'],
    programs: [],
    flags: {
      has_shsat: overrides.flags?.has_shsat ?? false,
      has_audition: overrides.flags?.has_audition ?? false,
      has_screened: overrides.flags?.has_screened ?? false,
      has_open: overrides.flags?.has_open ?? true,
      has_borough_priority: false,
      is_hidden_gem: false,
      has_consortium: false,
      has_ib: false,
    },
    doe_data: { overview: '', language: '', extracurriculars: '', website: '', phone: '', address: '', zip: '' },
    sift_url: '',
    last_verified: '',
  }
}

describe('Issue #40: capSchoolsByCategory', () => {
  it('exports FREE_TIER_CAP = 15 and PAID_TIER_CAP = 30', () => {
    expect(FREE_TIER_CAP).toBe(15)
    expect(PAID_TIER_CAP).toBe(30)
  })

  it('caps total results at 15', () => {
    const schools = Array.from({ length: 30 }, (_, i) =>
      makeSchool({ dbn: `x${i}`, flags: { has_shsat: false, has_audition: false, has_screened: false, has_open: true, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })
    )
    expect(capSchoolsByCategory(schools).length).toBe(FREE_TIER_CAP)
  })

  it('caps SHSAT at 3 even when more are present', () => {
    const schools = Array.from({ length: 8 }, (_, i) =>
      makeSchool({ dbn: `s${i}`, flags: { has_shsat: true, has_audition: false, has_screened: false, has_open: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })
    )
    const result = capSchoolsByCategory(schools)
    expect(result.filter((s) => s.flags.has_shsat).length).toBe(3)
  })

  it('caps Audition at 3 even when more are present', () => {
    const schools = Array.from({ length: 10 }, (_, i) =>
      makeSchool({ dbn: `a${i}`, flags: { has_shsat: false, has_audition: true, has_screened: false, has_open: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })
    )
    const result = capSchoolsByCategory(schools)
    expect(result.filter((s) => s.flags.has_audition).length).toBe(3)
  })

  it('caps Screened at 5 even when more are present', () => {
    const schools = Array.from({ length: 8 }, (_, i) =>
      makeSchool({ dbn: `sc${i}`, flags: { has_shsat: false, has_audition: false, has_screened: true, has_open: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })
    )
    const result = capSchoolsByCategory(schools)
    expect(result.filter((s) => s.flags.has_screened).length).toBe(5)
  })

  it('fills remainder with EdOpt/Lottery when some categories are absent (no SHSAT, no auditions → 12 edopt slots)', () => {
    // 0 SHSAT + 0 audition + 3 screened + 12 EdOpt = 15
    const screened = Array.from({ length: 3 }, (_, i) =>
      makeSchool({ dbn: `sc${i}`, flags: { has_shsat: false, has_audition: false, has_screened: true, has_open: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })
    )
    const edopt = Array.from({ length: 20 }, (_, i) =>
      makeSchool({ dbn: `e${i}`, flags: { has_shsat: false, has_audition: false, has_screened: false, has_open: true, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })
    )
    const result = capSchoolsByCategory([...screened, ...edopt])
    expect(result.length).toBe(15)
    expect(result.filter((s) => s.flags.has_screened).length).toBe(3)
    expect(result.filter((s) => !s.flags.has_screened).length).toBe(12)
  })

  it('with all categories full: 3 SHSAT + 3 Audition + 5 Screened + 4 EdOpt/Lottery = 15', () => {
    const shsat = Array.from({ length: 5 }, (_, i) =>
      makeSchool({ dbn: `sh${i}`, flags: { has_shsat: true, has_audition: false, has_screened: false, has_open: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })
    )
    const audition = Array.from({ length: 8 }, (_, i) =>
      makeSchool({ dbn: `au${i}`, flags: { has_shsat: false, has_audition: true, has_screened: false, has_open: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })
    )
    const screened = Array.from({ length: 8 }, (_, i) =>
      makeSchool({ dbn: `sc${i}`, flags: { has_shsat: false, has_audition: false, has_screened: true, has_open: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })
    )
    const edopt = Array.from({ length: 20 }, (_, i) =>
      makeSchool({ dbn: `ed${i}`, flags: { has_shsat: false, has_audition: false, has_screened: false, has_open: true, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })
    )
    const result = capSchoolsByCategory([...shsat, ...audition, ...screened, ...edopt])
    expect(result.length).toBe(15)
    expect(result.filter((s) => s.flags.has_shsat).length).toBe(3)
    expect(result.filter((s) => s.flags.has_audition).length).toBe(3)
    expect(result.filter((s) => s.flags.has_screened).length).toBe(5)
    expect(result.filter((s) => !s.flags.has_shsat && !s.flags.has_audition && !s.flags.has_screened).length).toBe(4)
  })

  it('sorts within each category by academic_score_pct descending, null last', () => {
    const schools = [
      makeSchool({ dbn: 'sh1', academic_score_pct: 60, flags: { has_shsat: true, has_audition: false, has_screened: false, has_open: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } }),
      makeSchool({ dbn: 'sh2', academic_score_pct: 95, flags: { has_shsat: true, has_audition: false, has_screened: false, has_open: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } }),
      makeSchool({ dbn: 'sh3', academic_score_pct: null, flags: { has_shsat: true, has_audition: false, has_screened: false, has_open: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } }),
      makeSchool({ dbn: 'sh4', academic_score_pct: 80, flags: { has_shsat: true, has_audition: false, has_screened: false, has_open: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } }),
    ]
    const result = capSchoolsByCategory(schools)
    const shsatResult = result.filter((s) => s.flags.has_shsat)
    // top 3 by score: sh2 (95), sh4 (80), sh1 (60)
    expect(shsatResult[0].dbn).toBe('sh2')
    expect(shsatResult[1].dbn).toBe('sh4')
    expect(shsatResult[2].dbn).toBe('sh1')
  })

  it('returns fewer than 15 when total matching schools are fewer than 15', () => {
    const schools = [
      makeSchool({ dbn: 'a1', flags: { has_shsat: false, has_audition: false, has_screened: false, has_open: true, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } }),
      makeSchool({ dbn: 'a2', flags: { has_shsat: false, has_audition: false, has_screened: false, has_open: true, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } }),
    ]
    expect(capSchoolsByCategory(schools).length).toBe(2)
  })
})

describe('Issue #40/#84: SchoolList lock banner removed', () => {
  it('SchoolList has no lock banner (locked UI removed in #84)', () => {
    const schoolListSource = fs.readFileSync(path.join(__dirname, '../components/SchoolList.tsx'), 'utf-8')
    // Must NOT use the old "visibleCount < totalCount" guard
    expect(schoolListSource).not.toContain('visibleCount < totalCount')
    // The lock banner count (and its PAID_TIER_CAP import) is gone
    expect(schoolListSource).not.toContain('PAID_TIER_CAP - FREE_TIER_CAP')
    expect(schoolListSource).not.toContain('PAID_TIER_CAP')
  })

  it('tier cap constants are unchanged in lib (PAID_TIER_CAP 30 minus FREE_TIER_CAP 15)', () => {
    expect(PAID_TIER_CAP - FREE_TIER_CAP).toBe(15)
  })
})



// ── Issue #41: School names and order on requirements page match My Schools list ───




// ── Issue #44: SHSAT cutoff scores ───────────────────────────────────────────

describe('Issue #44: SHSAT cutoff data in build_school_data.py', () => {
  const buildSource = fs.readFileSync(path.join(__dirname, '../build_school_data.py'), 'utf-8')

  it('defines SHSAT_CUTOFFS dict', () => {
    expect(buildSource).toContain('SHSAT_CUTOFFS')
  })

  it('contains all 8 specialized high school DBNs', () => {
    expect(buildSource).toContain('02M475') // Stuyvesant
    expect(buildSource).toContain('05M692') // HMSE at City College
    expect(buildSource).toContain('10X445') // Bronx Science
    expect(buildSource).toContain('10X696') // American Studies at Lehman
    expect(buildSource).toContain('13K430') // Brooklyn Tech
    expect(buildSource).toContain('14K449') // Brooklyn Latin
    expect(buildSource).toContain('28Q687') // Queens Sciences at York
    expect(buildSource).toContain('31R605') // Staten Island Technical
  })

  it('references SHSAT_CUTOFFS_YEAR', () => {
    expect(buildSource).toContain('SHSAT_CUTOFFS_YEAR')
  })

  it('embeds shsat_cutoff_score in school output', () => {
    expect(buildSource).toContain('shsat_cutoff_score')
  })

  it('embeds shsat_cutoff_year in school output', () => {
    expect(buildSource).toContain('shsat_cutoff_year')
  })
})



describe('Issue #44: SHSAT_CUTOFFS data validity', () => {
  // Inline the cutoffs for unit tests (mirrors the constant in page.tsx)
  const SHSAT_CUTOFFS: Record<string, number> = {
    '02M475': 560,
    '05M692': 514,
    '10X445': 521,
    '10X696': 512,
    '13K430': 478,
    '14K449': 439,
    '28Q687': 489,
    '31R605': 528,
  }

  it('has exactly 8 entries (one per specialized HS)', () => {
    expect(Object.keys(SHSAT_CUTOFFS).length).toBe(8)
  })

  it('Stuyvesant has the highest cutoff', () => {
    const max = Math.max(...Object.values(SHSAT_CUTOFFS))
    expect(SHSAT_CUTOFFS['02M475']).toBe(max)
  })

  it('Brooklyn Latin has the lowest cutoff', () => {
    const min = Math.min(...Object.values(SHSAT_CUTOFFS))
    expect(SHSAT_CUTOFFS['14K449']).toBe(min)
  })

  it('all scores are positive integers in a realistic SHSAT range (300–700)', () => {
    Object.values(SHSAT_CUTOFFS).forEach((score) => {
      expect(score).toBeGreaterThan(300)
      expect(score).toBeLessThan(700)
    })
  })

  it('lowestScore is Math.min of the given set', () => {
    const scores = Object.values(SHSAT_CUTOFFS)
    expect(Math.min(...scores)).toBe(439)
  })
})

// ── Issue #45: Move disclaimer to bottom; style section headers ──────────────



// ── Issue #50: Scraper pulls all relevant DOE fields ─────────────────────────

describe('Issue #50: build_school_data.py uses overview_paragraph (not overview1)', () => {
  const buildSource = fs.readFileSync(path.join(__dirname, '../build_school_data.py'), 'utf-8')

  it('does NOT reference overview1 field', () => {
    expect(buildSource).not.toContain('"overview1"')
  })

  it('uses overview_paragraph for the overview field', () => {
    expect(buildSource).toContain('"overview_paragraph"')
  })

  it('uses overview_paragraph in the IB detection logic', () => {
    const ibBlock = buildSource.slice(
      buildSource.indexOf('has_ib'),
      buildSource.indexOf('has_ib') + 300,
    )
    expect(ibBlock).not.toContain('"overview1"')
  })
})

describe('Issue #50: build_school_data.py pulls new DOE fields', () => {
  const buildSource = fs.readFileSync(path.join(__dirname, '../build_school_data.py'), 'utf-8')

  it('pulls academicopportunities1 through academicopportunities5', () => {
    expect(buildSource).toContain('"academicopportunities1"')
    expect(buildSource).toContain('"academicopportunities5"')
  })

  it('concatenates academic_opportunities from multiple fields', () => {
    expect(buildSource).toContain('academic_opportunities')
    expect(buildSource).toContain('"academicopportunities1"')
  })

  it('pulls prgdesc1, prgdesc2, prgdesc3 and concatenates into prgdesc', () => {
    expect(buildSource).toContain('"prgdesc1"')
    expect(buildSource).toContain('"prgdesc2"')
    expect(buildSource).toContain('"prgdesc3"')
    expect(buildSource).toContain('prgdesc')
  })

  it('pulls requirement fields (requirement1_1 through requirement4_3)', () => {
    expect(buildSource).toContain('requirement')
    expect(buildSource).toContain('for i in range(1, 5)')
    expect(buildSource).toContain('for j in range(1, 4)')
  })

  it('pulls auditioninformation1, auditioninformation2, auditioninformation3', () => {
    expect(buildSource).toContain('"auditioninformation1"')
    expect(buildSource).toContain('"auditioninformation2"')
    expect(buildSource).toContain('"auditioninformation3"')
    expect(buildSource).toContain('audition_information')
  })

  it('deduplicates interest1, interest2, interest3 into interests list', () => {
    expect(buildSource).toContain('"interest1"')
    expect(buildSource).toContain('"interest2"')
    expect(buildSource).toContain('"interest3"')
    expect(buildSource).toContain('dict.fromkeys')
  })

  it('stores graduation_rate, attendance_rate, college_career_rate as floats', () => {
    expect(buildSource).toContain('"graduation_rate"')
    expect(buildSource).toContain('"attendance_rate"')
    expect(buildSource).toContain('"college_career_rate"')
    expect(buildSource).toContain('safe_float')
  })

  it('pulls subway and bus transit fields', () => {
    expect(buildSource).toContain('"subway"')
    expect(buildSource).toContain('"bus"')
  })

  it('pulls psal_sports_boys, psal_sports_girls, psal_sports_coed', () => {
    expect(buildSource).toContain('"psal_sports_boys"')
    expect(buildSource).toContain('"psal_sports_girls"')
    expect(buildSource).toContain('"psal_sports_coed"')
  })

  it('pulls advancedplacement_courses', () => {
    expect(buildSource).toContain('"advancedplacement_courses"')
  })

  it('pulls diplomaendorsements', () => {
    expect(buildSource).toContain('"diplomaendorsements"')
  })

  it('pulls neighborhood', () => {
    expect(buildSource).toContain('"neighborhood"')
  })

  it('pulls addtl_info1 and stores as addtl_info', () => {
    expect(buildSource).toContain('"addtl_info1"')
    expect(buildSource).toContain('addtl_info')
  })
})

describe('Issue #50: types/index.ts DoeData includes new fields', () => {
  const typesSource = fs.readFileSync(path.join(__dirname, '../types/index.ts'), 'utf-8')
  const doeDataBlock = typesSource.slice(
    typesSource.indexOf('export interface DoeData'),
    typesSource.indexOf('export interface SchoolProgram'),
  )

  it('DoeData still has required core fields', () => {
    expect(doeDataBlock).toContain('overview: string')
    expect(doeDataBlock).toContain('language: string')
    expect(doeDataBlock).toContain('extracurriculars: string')
    expect(doeDataBlock).toContain('website: string')
    expect(doeDataBlock).toContain('phone: string')
    expect(doeDataBlock).toContain('address: string')
    expect(doeDataBlock).toContain('zip: string')
  })

  it('DoeData has academic_opportunities optional field', () => {
    expect(doeDataBlock).toContain('academic_opportunities')
  })

  it('DoeData has prgdesc optional field', () => {
    expect(doeDataBlock).toContain('prgdesc')
  })

  it('DoeData has requirements optional field', () => {
    expect(doeDataBlock).toContain('requirements')
  })

  it('DoeData has audition_information optional field as string array', () => {
    expect(doeDataBlock).toContain('audition_information')
    expect(doeDataBlock).toContain('string[]')
  })

  it('DoeData has interests optional field as string array', () => {
    expect(doeDataBlock).toContain('interests')
  })

  it('DoeData has graduation_rate, attendance_rate, college_career_rate optional fields', () => {
    expect(doeDataBlock).toContain('graduation_rate')
    expect(doeDataBlock).toContain('attendance_rate')
    expect(doeDataBlock).toContain('college_career_rate')
  })

  it('DoeData has subway and bus optional fields', () => {
    expect(doeDataBlock).toContain('subway')
    expect(doeDataBlock).toContain('bus')
  })

  it('DoeData has psal_sports fields', () => {
    expect(doeDataBlock).toContain('psal_sports_boys')
    expect(doeDataBlock).toContain('psal_sports_girls')
    expect(doeDataBlock).toContain('psal_sports_coed')
  })

  it('DoeData has advancedplacement_courses, diplomaendorsements, neighborhood, addtl_info fields', () => {
    expect(doeDataBlock).toContain('advancedplacement_courses')
    expect(doeDataBlock).toContain('diplomaendorsements')
    expect(doeDataBlock).toContain('neighborhood')
    expect(doeDataBlock).toContain('addtl_info')
  })
})

// ── Issue #42: SchoolRow label cleanup ───────────────────────────────────────

describe('Issue #42: SchoolRow expanded view and label changes', () => {
  const schoolRowSource = fs.readFileSync(path.join(__dirname, '../components/SchoolRow.tsx'), 'utf-8')

  it('BADGE_LABEL maps Educational Option to Ed Opt', () => {
    expect(schoolRowSource).toContain("'Educational Option': 'Ed Opt'")
  })

  it('getCompetitionShort returns SHSAT only for SHSAT schools', () => {
    expect(schoolRowSource).toContain("'SHSAT only'")
    expect(schoolRowSource).not.toMatch(/text:\s*'SHSAT'[^O]/)
  })

  it('full competition text is conditionally hidden for SHSAT schools', () => {
    expect(schoolRowSource).toContain('!school.flags.has_shsat')
  })

  it('expanded view does not render borough unconditionally before size', () => {
    expect(schoolRowSource).not.toContain('{school.borough} ·')
  })

  it('expanded view still shows size description', () => {
    expect(schoolRowSource).toContain('Small school (<400 students)')
    expect(schoolRowSource).toContain('Large school (1,200+ students)')
  })

  it('expanded view still shows applicants per seat', () => {
    expect(schoolRowSource).toContain('applicants/seat')
  })
})


describe('Issue #43: updated category caps (free tier)', () => {
  it('CATEGORY_CAPS comment references paid Full Access', () => {
    const utilsSource = fs.readFileSync(path.join(__dirname, '../lib/school-list-utils.ts'), 'utf-8')
    expect(utilsSource).toContain('Full Access')
  })

  it('audition cap is now 3', () => {
    const schools = Array.from({ length: 8 }, (_, i) =>
      makeSchool({ dbn: `aud${i}`, flags: { has_shsat: false, has_audition: true, has_screened: false, has_open: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })
    )
    const result = capSchoolsByCategory(schools)
    expect(result.filter((s) => s.flags.has_audition).length).toBe(3)
  })

  it('screened cap is now 5', () => {
    const schools = Array.from({ length: 10 }, (_, i) =>
      makeSchool({ dbn: `scr${i}`, flags: { has_shsat: false, has_audition: false, has_screened: true, has_open: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })
    )
    const result = capSchoolsByCategory(schools)
    expect(result.filter((s) => s.flags.has_screened).length).toBe(5)
  })

  it('lottery/edopt fills 4 slots when shsat=3, audition=3, screened=5 (total 15)', () => {
    const shsat = Array.from({ length: 5 }, (_, i) =>
      makeSchool({ dbn: `sh${i}`, flags: { has_shsat: true, has_audition: false, has_screened: false, has_open: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })
    )
    const audition = Array.from({ length: 5 }, (_, i) =>
      makeSchool({ dbn: `au${i}`, flags: { has_shsat: false, has_audition: true, has_screened: false, has_open: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })
    )
    const screened = Array.from({ length: 8 }, (_, i) =>
      makeSchool({ dbn: `sc${i}`, flags: { has_shsat: false, has_audition: false, has_screened: true, has_open: false, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })
    )
    const lottery = Array.from({ length: 10 }, (_, i) =>
      makeSchool({ dbn: `lt${i}`, flags: { has_shsat: false, has_audition: false, has_screened: false, has_open: true, has_borough_priority: false, is_hidden_gem: false, has_consortium: false, has_ib: false } })
    )
    const result = capSchoolsByCategory([...shsat, ...audition, ...screened, ...lottery])
    expect(result.length).toBe(15)
    expect(result.filter((s) => s.flags.has_shsat).length).toBe(3)
    expect(result.filter((s) => s.flags.has_audition).length).toBe(3)
    expect(result.filter((s) => s.flags.has_screened).length).toBe(5)
    // remainder = 15 - 3 - 3 - 5 = 4
    expect(result.filter((s) => !s.flags.has_shsat && !s.flags.has_audition && !s.flags.has_screened).length).toBe(4)
  })
})

// ── Issue #51: Per-school requirements from enriched DOE data ────────────────



describe('Issue #51: firstSentence helper logic', () => {
  function firstSentence(text: string): string {
    const idx = text.indexOf('. ')
    if (idx !== -1) return text.slice(0, idx + 1)
    return text.length > 150 ? text.slice(0, 147) + '…' : text
  }

  it('returns text up to first ". "', () => {
    expect(firstSentence('Studio art program. Includes dance. Theater option.')).toBe('Studio art program.')
  })

  it('returns full text when no ". " found and text is short', () => {
    expect(firstSentence('A short description')).toBe('A short description')
  })

  it('truncates long text with no period at 147 chars', () => {
    const long = 'A'.repeat(200)
    const result = firstSentence(long)
    expect(result.length).toBe(148) // 147 + '…' (1 char, U+2026)
    expect(result.endsWith('…')).toBe(true)
  })

  it('handles text that ends with a period but no space after', () => {
    expect(firstSentence('A program.')).toBe('A program.')
  })
})

describe('Issue #51: renderScreenedRequirements grouping logic', () => {
  function groupRequirementsByProgram(requirements: Record<string, string>): Record<string, string[]> {
    const programs: Record<string, string[]> = {}
    for (const [key, value] of Object.entries(requirements)) {
      const match = key.match(/^requirement\d+_(\d+)$/)
      if (match && value) {
        const prog = match[1]
        if (!programs[prog]) programs[prog] = []
        programs[prog].push(value)
      }
    }
    return programs
  }

  it('groups requirements by program number', () => {
    const reqs = {
      requirement1_1: 'Attendance',
      requirement2_1: 'Punctuality',
      requirement1_2: 'Course Grades: A',
    }
    const grouped = groupRequirementsByProgram(reqs)
    expect(grouped['1']).toEqual(['Attendance', 'Punctuality'])
    expect(grouped['2']).toEqual(['Course Grades: A'])
  })

  it('ignores keys that do not match pattern', () => {
    const reqs = { badkey: 'value', requirement1_1: 'Attendance' }
    const grouped = groupRequirementsByProgram(reqs)
    expect(Object.keys(grouped)).toEqual(['1'])
  })

  it('ignores empty values', () => {
    const reqs = { requirement1_1: '', requirement2_1: 'Punctuality' }
    const grouped = groupRequirementsByProgram(reqs)
    expect(grouped['1']).toEqual(['Punctuality'])
  })

  it('handles single-program school (all requirements same program)', () => {
    const reqs = {
      requirement1_1: 'Attendance',
      requirement2_1: 'Punctuality',
      requirement3_1: 'Course Grades: English (60-100)',
      requirement4_1: 'Standardized Test Scores: ELA (1.9-4.5)',
    }
    const grouped = groupRequirementsByProgram(reqs)
    expect(Object.keys(grouped)).toEqual(['1'])
    expect(grouped['1'].length).toBe(4)
  })
})

// ── Issue #51: fallback and bold school name ─────────────────────────────────


// ── Issue #49: Rationale prompt improvements ─────────────────────────────────

describe('Issue #49: rationale route system prompt and academicLevel mapping', () => {
  const routeSrc = fs.readFileSync(path.join(__dirname, '../app/api/rationale/route.ts'), 'utf-8')

  it('system prompt does not tell Claude to cite the admissions type', () => {
    expect(routeSrc).not.toContain('cite the admissions type')
  })

  it('system prompt does not tell Claude to end by naming the admissions type', () => {
    expect(routeSrc).not.toContain('End by naming the admissions type')
  })

  it('system prompt caps output at 80 words', () => {
    expect(routeSrc).toContain('under 80 words total')
  })

  it('system prompt focuses on what makes the school interesting', () => {
    expect(routeSrc).toContain('Focus on what makes THIS school interesting')
  })

  it('maps "exceptional" academicRating to human-readable sentence', () => {
    expect(routeSrc).toContain("exceptional: 'Student is a strong academic performer'")
  })

  it('maps "strong" academicRating to human-readable sentence', () => {
    expect(routeSrc).toContain("strong: 'Student has solid grades'")
  })

  it('maps "above_average" academicRating to human-readable sentence', () => {
    expect(routeSrc).toContain("above_average: 'Student has average to above-average grades'")
  })

  it('student context uses "Academic level" label, not raw "Academic ratings"', () => {
    expect(routeSrc).toContain('`Academic level: ${academicDesc}`')
    expect(routeSrc).not.toContain('Academic ratings:')
  })
})

// ── Issue #52: Remove Ed Opt section from MVP ────────────────────────────────

describe('Issue #52: Ed Opt section removed from MVP', () => {
  const libSource = fs.readFileSync(path.join(__dirname, '../lib/school-list-utils.ts'), 'utf-8')

  it('getPrimarySection does not route Educational Option to edopt', () => {
    expect(libSource).not.toContain("admissions_types.includes('Educational Option')")
  })

  it('getPrimarySection falls through to lottery after screened check', () => {
    // The function should end with: return 'lottery' immediately after the screened check
    const match = libSource.match(/function getPrimarySection[\s\S]*?return 'lottery'\s*\n\}/)
    expect(match).not.toBeNull()
    // No edopt return inside getPrimarySection
    const fnMatch = libSource.match(/function getPrimarySection\([\s\S]*?\n\}/)
    expect(fnMatch).not.toBeNull()
    expect(fnMatch![0]).not.toContain("return 'edopt'")
  })
})

// ── Issue #53: Remove source attribution and NYC-SIFT link ───────────────────

describe('Issue #53: SchoolRow expanded view has no source attribution or external links', () => {
  const schoolRowSource = fs.readFileSync(path.join(__dirname, '../components/SchoolRow.tsx'), 'utf-8')

  it('does not contain "NYC-SIFT" text', () => {
    expect(schoolRowSource).not.toContain('NYC-SIFT')
  })

  it('does not contain "Source: NYC" attribution span', () => {
    expect(schoolRowSource).not.toContain('Source: NYC')
  })

  it('does not contain a link to sift_url', () => {
    expect(schoolRowSource).not.toContain('href={school.sift_url}')
  })

  it('does not contain "View on NYC-SIFT" link text', () => {
    expect(schoolRowSource).not.toContain('View on NYC-SIFT')
  })
})

// ── Issue #54: Improve AI rationale prompt to use language and extracurricular data ──

describe('Issue #54: Rationale route passes language and extracurricular data', () => {
  const routeSrc = fs.readFileSync(path.join(__dirname, '../app/api/rationale/route.ts'), 'utf-8')

  it('includes Languages offered in the schoolCtx', () => {
    expect(routeSrc).toContain('Languages offered: ${school.doe_data.language}')
  })

  it('includes Extracurriculars in the schoolCtx', () => {
    expect(routeSrc).toContain('Extracurriculars: ${String(school.doe_data.extracurriculars).slice(0, 400)}')
  })

  it('system prompt instructs AI NOT to repeat user filter selections', () => {
    expect(routeSrc).toContain("Do NOT repeat the user")
    expect(routeSrc).toContain("filter selections")
  })

  it('system prompt instructs AI to start with academic focus description', () => {
    expect(routeSrc).toContain('First sentence: describe the school')
    expect(routeSrc).toContain('academic focus, curriculum, or culture')
  })

  it('system prompt targets 2-3 sentences under 80 words', () => {
    expect(routeSrc).toContain('under 80 words total')
  })

  it('system prompt focuses on what makes THIS school interesting', () => {
    expect(routeSrc).toContain('Focus on what makes THIS school interesting')
  })

  it('does NOT contain the old "focus on why this school fits this specific student" directive', () => {
    expect(routeSrc).not.toContain('Focus on why this school fits this specific student')
  })
})

// ── Issue #57: Remove generic phrases and add sports mentions ─────────────────

describe('Issue #57: Rationale prompt bans generic phrases and adds sports logic', () => {
  const routeSrc = fs.readFileSync(path.join(__dirname, '../app/api/rationale/route.ts'), 'utf-8')

  it('system prompt does not contain banned-phrases list (reverted in #61)', () => {
    expect(routeSrc).not.toContain('Never use vague phrases')
    expect(routeSrc).not.toContain('21st century skills')
  })

  it('system prompt does not ban "global themes infused throughout" (reverted in #61)', () => {
    expect(routeSrc).not.toContain('global themes infused throughout')
  })

  it('system prompt does not ban "culturally relevant" (reverted in #61)', () => {
    expect(routeSrc).not.toContain('culturally relevant')
  })

  it('system prompt does not ban "rigorous college prep" — example uses it (reverted in #61)', () => {
    expect(routeSrc).not.toContain('rigorous college prep" unless')
  })

  it('system prompt instructs AI to mention sports when user selected them', () => {
    expect(routeSrc).toContain('If the user selected sports')
    expect(routeSrc).toContain('Soccer offered through PSAL')
    expect(routeSrc).toContain('Soccer not offered')
  })

  it('schoolCtx includes PSAL sports (boys)', () => {
    expect(routeSrc).toContain('PSAL sports (boys): ${school.doe_data.psal_sports_boys}')
  })

  it('schoolCtx includes PSAL sports (girls)', () => {
    expect(routeSrc).toContain('PSAL sports (girls): ${school.doe_data.psal_sports_girls}')
  })

  it('schoolCtx includes PSAL sports (coed)', () => {
    expect(routeSrc).toContain('PSAL sports (coed): ${school.doe_data.psal_sports_coed}')
  })

  it('studentCtx includes sports filters when selected', () => {
    expect(routeSrc).toContain('Sports filters selected: ${userInputs.sports.join(')
  })

  it('system prompt instructs AI not to repeat academic scores or applicants per seat', () => {
    expect(routeSrc).toContain('Do NOT repeat academic scores or applicants per seat')
  })
})

// ── Issue #61: Revert AI prompt to pre-#57 version, keep sports mentions ─────

describe('Issue #61: Rationale prompt reverted to Issue #54 structure with sports', () => {
  const routeSrc = fs.readFileSync(path.join(__dirname, '../app/api/rationale/route.ts'), 'utf-8')

  it('system prompt instructs first sentence to describe academic focus', () => {
    expect(routeSrc).toContain('First sentence: describe the school')
    expect(routeSrc).toContain('academic focus, curriculum, or culture based on available data')
  })

  it('system prompt caps output at 80 words (not 100)', () => {
    expect(routeSrc).toContain('under 80 words total')
    expect(routeSrc).not.toContain('under 100 words total')
  })

  it('system prompt does not contain overly restrictive "Use ONLY" directive', () => {
    expect(routeSrc).not.toContain('Use ONLY the concrete data provided')
  })

  it('system prompt instructs AI not to repeat academic scores or applicants per seat', () => {
    expect(routeSrc).toContain('Do NOT repeat academic scores or applicants per seat')
  })

  it('system prompt keeps sports mention logic from Issue #57', () => {
    expect(routeSrc).toContain('If the user selected sports')
    expect(routeSrc).toContain('Soccer offered through PSAL')
    expect(routeSrc).toContain('Soccer not offered')
  })

  it('schoolCtx still includes PSAL sports data from Issue #57', () => {
    expect(routeSrc).toContain('PSAL sports (boys): ${school.doe_data.psal_sports_boys}')
    expect(routeSrc).toContain('PSAL sports (girls): ${school.doe_data.psal_sports_girls}')
    expect(routeSrc).toContain('PSAL sports (coed): ${school.doe_data.psal_sports_coed}')
  })

  it('example rationale uses descriptive language not just raw metrics', () => {
    expect(routeSrc).toContain('Rigorous STEM-focused curriculum for top performers')
  })
})

// ── Issue #55: Match section header styling; simplify SHSAT section ───────────



// ── Issue #56: Audition-only schools hidden when auditions=NO ────────────────

function matchesAcademicRating56(score: number | null, ratings: string[]): boolean {
  if (score === null) return ratings.includes('above_average')
  if (ratings.includes('exceptional') && score >= 90) return true
  if (ratings.includes('strong') && score >= 70 && score < 90) return true
  if (ratings.includes('above_average') && score >= 50 && score < 70) return true
  return false
}

function isEligible56(school: any, inputs: { academicRatings: string[]; shsat: boolean; auditions: boolean }): boolean {
  const showScreened = inputs.academicRatings.includes('exceptional') || inputs.academicRatings.includes('strong')
  if (school.flags.has_audition && !inputs.auditions && !school.flags.has_screened && !school.flags.has_shsat) {
    return false
  }
  if (school.flags.has_open) return true
  if (school.flags.has_screened && showScreened) return true
  if (school.flags.has_shsat && inputs.shsat) return true
  if (school.flags.has_audition && inputs.auditions) return true
  return matchesAcademicRating56(school.academic_score_pct, inputs.academicRatings)
}

describe('Issue #56: audition-only schools excluded when auditions=NO', () => {
  it('audition+open school (Fashion Industries pattern) is excluded when auditions=false', () => {
    const school = makeSchool38({ has_audition: true, has_open: true, academic_score_pct: 62 })
    expect(isEligible56(school, { academicRatings: ['exceptional'], shsat: false, auditions: false })).toBe(false)
  })

  it('audition+open school is included when auditions=true', () => {
    const school = makeSchool38({ has_audition: true, has_open: true, academic_score_pct: 62 })
    expect(isEligible56(school, { academicRatings: ['exceptional'], shsat: false, auditions: true })).toBe(true)
  })

  it('audition+screened school still appears via screened when auditions=false', () => {
    const school = makeSchool38({ has_audition: true, has_screened: true, academic_score_pct: 85 })
    expect(isEligible56(school, { academicRatings: ['exceptional'], shsat: false, auditions: false })).toBe(true)
  })

  it('audition+shsat school still appears via shsat when auditions=false and shsat=true', () => {
    const school = makeSchool38({ has_audition: true, has_shsat: true, academic_score_pct: 95 })
    expect(isEligible56(school, { academicRatings: ['exceptional'], shsat: true, auditions: false })).toBe(true)
  })

  it('pure audition school (no open) is still excluded when auditions=false', () => {
    const school = makeSchool38({ has_audition: true, academic_score_pct: 80 })
    expect(isEligible56(school, { academicRatings: ['exceptional'], shsat: false, auditions: false })).toBe(false)
  })

  it('pure open school (no audition) is not affected — still included', () => {
    const school = makeSchool38({ has_open: true, academic_score_pct: 55 })
    expect(isEligible56(school, { academicRatings: ['exceptional'], shsat: false, auditions: false })).toBe(true)
  })
})

describe('Issue #56: source — isEligible has audition-only guard before has_open', () => {
  const libSource = fs.readFileSync(path.join(__dirname, '../lib/school-list-utils.ts'), 'utf-8')
  const isEligibleBlock = libSource.slice(
    libSource.indexOf('function isEligible('),
    libSource.indexOf('function applyFilters('),
  )

  it('has early-exit guard for audition+open schools when auditions=false', () => {
    expect(isEligibleBlock).toContain('has_audition && !inputs.auditions && !school.flags.has_screened && !school.flags.has_shsat')
  })

  it('audition guard appears before has_open check', () => {
    const guardIdx = isEligibleBlock.indexOf('has_audition && !inputs.auditions')
    const openIdx = isEligibleBlock.indexOf('has_open')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(openIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeLessThan(openIdx)
  })
})

// ── Issue #60: Disable school size filter for user interviews ─────────────────


// ── Issue #84: Hide the unbuilt "Full Access" paid-tier UI ────────────────────
