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

describe('myschools.nyc link in requirements page', () => {
  const reqContentSource = fs.readFileSync(path.join(__dirname, '../app/requirements/RequirementsContent.tsx'), 'utf-8')

  it('links to https://www.myschools.nyc (with www)', () => {
    expect(reqContentSource).toContain('https://www.myschools.nyc')
  })

  it('myschools.nyc link opens in a new tab', () => {
    expect(reqContentSource).toContain('target="_blank"')
    expect(reqContentSource).toContain('rel="noopener noreferrer"')
  })
})

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

// ── Issue #6: agent-coordinator.sh build before pm2 restart ─────────────────

describe('agent-coordinator.sh deploy sequence', () => {
  const coordinatorSource = fs.readFileSync(path.join(__dirname, '../agent-coordinator.sh'), 'utf-8')

  it('runs npm run build before pm2 restart', () => {
    expect(coordinatorSource).toContain('npm run build >> "$LOG_FILE" 2>&1 && pm2 restart hs-navigator')
  })

  it('does NOT call bare pm2 restart without a preceding build', () => {
    // The only pm2 restart line should be preceded by npm run build
    const lines = coordinatorSource.split('\n')
    const pm2Lines = lines.filter(l => l.includes('pm2 restart hs-navigator'))
    pm2Lines.forEach(line => {
      expect(line).toContain('npm run build')
    })
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

describe('Issue #7: Note box removed from list page', () => {
  const listSource = fs.readFileSync(path.join(__dirname, '../app/list/page.tsx'), 'utf-8')

  it('does NOT contain the Note box div with bg-gray-50 styling', () => {
    expect(listSource).not.toContain('bg-gray-50 border border-gray-200 rounded-md')
  })

  it('does NOT contain the Note box text about DOE tiebreaker', () => {
    expect(listSource).not.toContain('No tool can guarantee an offer')
  })

  it('still includes the Footer component', () => {
    expect(listSource).toContain('<Footer />')
  })
})

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

describe('Issue #8: Note box removed from list page', () => {
  const listSource = fs.readFileSync(path.join(__dirname, '../app/list/page.tsx'), 'utf-8')

  it('does NOT contain the Note box div', () => {
    expect(listSource).not.toContain('bg-gray-50 border border-gray-200 rounded-md')
  })

  it('does NOT contain the Note box text', () => {
    expect(listSource).not.toContain("DOE&apos;s offer-chances prediction tool uses randomness")
  })
})

// ── Issue #13: Last verified date on deadline items ─────────────────────────

describe('Issue #13/#39: Last verified date in requirements', () => {
  const reqContentSource = fs.readFileSync(path.join(__dirname, '../app/requirements/RequirementsContent.tsx'), 'utf-8')

  it('renders "last verified:" text in the JSX (top-level line)', () => {
    expect(reqContentSource).toContain('last verified:')
  })

  it('renders a myschools.nyc link in the verified note', () => {
    expect(reqContentSource).toContain('https://www.myschools.nyc')
  })

  it('verified note link opens in a new tab', () => {
    const matches = reqContentSource.match(/target="_blank"/g) ?? []
    expect(matches.length).toBeGreaterThanOrEqual(2)
  })

  it('does NOT use per-item verifiedDate pattern (replaced with top-level line)', () => {
    expect(reqContentSource).not.toContain('{item.verifiedDate}')
  })
})

// ── Issue #14: Test step in GitHub Actions deploy pipeline ──────────────────

describe('Issue #14: GitHub Actions deploy pipeline has test step', () => {
  const workflowSource = fs.readFileSync(path.join(__dirname, '../.github/workflows/deploy.yml'), 'utf-8')

  it('has a test job defined', () => {
    expect(workflowSource).toContain('test:')
  })

  it('runs npm test in the test job', () => {
    expect(workflowSource).toContain('npm test')
  })

  it('deploy job has needs: test', () => {
    expect(workflowSource).toContain('needs: test')
  })

  it('installs dependencies before running tests', () => {
    expect(workflowSource).toContain('npm ci')
  })

  it('deploy job comes after test job in the file', () => {
    const testIdx = workflowSource.indexOf('test:')
    const deployIdx = workflowSource.indexOf('deploy:')
    expect(deployIdx).toBeGreaterThan(testIdx)
  })
})

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

// ── Issue #12: Locked paid tier placeholders ─────────────────────────────────

describe('Issue #12: SchoolList locked expand placeholder', () => {
  const schoolListSource = fs.readFileSync(path.join(__dirname, '../components/SchoolList.tsx'), 'utf-8')

  it('shows a lock icon SVG when more schools exist beyond visible count', () => {
    expect(schoolListSource).toContain('M12 15v2m-6 4h12')
  })

  it('shows "Full Access" label in the expand area', () => {
    expect(schoolListSource).toContain('Full Access')
  })

  it('does NOT show "coming soon" label in the expand area', () => {
    expect(schoolListSource).not.toContain('coming soon')
  })

  it('does NOT have a working "Load 15 more" button', () => {
    expect(schoolListSource).not.toContain('>Load 15 more<')
    expect(schoolListSource).not.toContain('Load 15 more\n')
  })

  it('shows remaining school count in the lock placeholder using PAID_TIER_CAP - FREE_TIER_CAP', () => {
    // Issue #40: lock banner now always shows a fixed count (PAID_TIER_CAP - FREE_TIER_CAP = 15)
    expect(schoolListSource).toContain('PAID_TIER_CAP - FREE_TIER_CAP')
  })
})

describe('Issue #12: List page locked save button', () => {
  const listSource = fs.readFileSync(path.join(__dirname, '../app/list/page.tsx'), 'utf-8')

  it('contains a Save list label', () => {
    expect(listSource).toContain('Save list')
  })

  it('aria-label reflects Full Access save list text', () => {
    expect(listSource).toContain('Save list — Full Access')
    expect(listSource).not.toContain('Download school list — Season Pass coming soon')
  })

  it('save button is not a real link or button (cursor-not-allowed)', () => {
    expect(listSource).toContain('cursor-not-allowed')
  })

  it('save area shows Full Access label', () => {
    expect(listSource).toContain('Full Access')
  })
})

// ── Issue #11: Fix incorrect "rank up to 12 schools" copy ───────────────────

describe('Issue #11: Ranking cap copy in requirements checklist', () => {
  const reqContentSource = fs.readFileSync(path.join(__dirname, '../app/requirements/RequirementsContent.tsx'), 'utf-8')

  it('does NOT contain the old "rank up to 12" copy', () => {
    expect(reqContentSource).not.toContain('rank up to 12 schools')
  })

  it('contains the new copy about ranking more than 12 schools', () => {
    expect(reqContentSource).toContain('You can rank more than 12 schools')
  })

  it('mentions DOE recommends at least 12 strong options', () => {
    expect(reqContentSource).toContain('The DOE recommends at least 12 strong options.')
  })

  it('tells users to list every program they would genuinely attend', () => {
    expect(reqContentSource).toContain('list every program you would genuinely attend')
  })
})

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

  it('NavBar is inside PHProvider', () => {
    const phStart = layoutSource.indexOf('<PHProvider>')
    const phEnd = layoutSource.indexOf('</PHProvider>')
    const navbar = layoutSource.indexOf('<NavBar />')
    expect(navbar).toBeGreaterThan(phStart)
    expect(navbar).toBeLessThan(phEnd)
  })
})

describe('Issue #12/#39: Requirements page — locked deadline tracking section removed', () => {
  const reqContentSource = fs.readFileSync(path.join(__dirname, '../app/requirements/RequirementsContent.tsx'), 'utf-8')

  it('does NOT contain a Deadline Tracking heading (section removed in #39)', () => {
    expect(reqContentSource).not.toContain('Deadline Tracking')
  })

  it('does NOT contain Season Pass label (replaced with Full Access everywhere)', () => {
    expect(reqContentSource).not.toContain('Season Pass')
  })

  it('does NOT contain "coming soon" language (removed in #39)', () => {
    expect(reqContentSource).not.toContain('coming soon')
  })

  it('does NOT contain aria-hidden locked UI section', () => {
    expect(reqContentSource).not.toContain('aria-hidden="true"')
  })
})

// ── Issue #16: Season Pass banners + last verified fix ───────────────────────

describe('Issue #16: List page save banner rename', () => {
  const listSource = fs.readFileSync(path.join(__dirname, '../app/list/page.tsx'), 'utf-8')

  it('uses "Save list" label (not "Download list")', () => {
    expect(listSource).toContain('Save list')
    expect(listSource).not.toContain('Download list')
  })

  it('aria-label reflects Full Access save list text', () => {
    expect(listSource).toContain('Save list — Full Access')
    expect(listSource).not.toContain('Download school list — Season Pass coming soon')
  })
})

describe('Issue #16/#39: Requirements page locked save banner removed', () => {
  const reqContentSource = fs.readFileSync(path.join(__dirname, '../app/requirements/RequirementsContent.tsx'), 'utf-8')

  it('does NOT contain "Save checklist — Season Pass coming soon" (locked UI removed in #39)', () => {
    expect(reqContentSource).not.toContain('Save checklist — Season Pass coming soon')
  })

  it('does NOT contain "coming soon" language (removed in #39)', () => {
    expect(reqContentSource).not.toContain('coming soon')
  })
})

describe('Issue #16: Requirements page deadlines last verified', () => {
  const reqContentSource = fs.readFileSync(path.join(__dirname, '../app/requirements/RequirementsContent.tsx'), 'utf-8')

  it('has a single top-level "Deadlines last verified" line', () => {
    expect(reqContentSource).toContain('Deadlines last verified: April 8, 2026')
  })

  it('does NOT render per-item Last verified lines', () => {
    // The old per-item pattern interpolated item.verifiedDate in JSX
    expect(reqContentSource).not.toContain('{item.verifiedDate}')
    expect(reqContentSource).not.toContain('Last verified: {item')
  })

  it('top-level verified line links to myschools.nyc', () => {
    const verifiedBlock = reqContentSource.slice(
      reqContentSource.indexOf('Deadlines last verified'),
      reqContentSource.indexOf('Deadlines last verified') + 300,
    )
    expect(verifiedBlock).toContain('myschools.nyc')
  })
})

describe('Issue #16: Home page locked save banner', () => {
  const homeSource = fs.readFileSync(path.join(__dirname, '../app/page.tsx'), 'utf-8')

  it('has a locked save banner after the form', () => {
    expect(homeSource).toContain('Save your HS guardrails')
  })

  it('save banner shows Full Access label', () => {
    expect(homeSource).toContain('Save your HS guardrails — Full Access')
  })

  it('save banner is cursor-not-allowed (locked)', () => {
    expect(homeSource).toContain('cursor-not-allowed')
  })

  it('save banner appears after the submit button', () => {
    const submitIdx = homeSource.indexOf('Find schools')
    const bannerIdx = homeSource.indexOf('Save your HS guardrails')
    expect(bannerIdx).toBeGreaterThan(submitIdx)
  })
})

// ── Issue #10: PostHog event tracking ───────────────────────────────────────

describe('Issue #10: form_submitted event on home page', () => {
  const homeSource = fs.readFileSync(path.join(__dirname, '../app/page.tsx'), 'utf-8')

  it('imports usePostHog from posthog-js/react', () => {
    expect(homeSource).toContain("from 'posthog-js/react'")
  })

  it('calls posthog.capture with form_submitted', () => {
    expect(homeSource).toContain("capture('form_submitted'")
  })

  it('captures academic_ratings in form_submitted', () => {
    expect(homeSource).toContain('academic_ratings')
  })
})

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

describe('Issue #10: requirements_viewed event on requirements page', () => {
  const reqContentSource = fs.readFileSync(path.join(__dirname, '../app/requirements/RequirementsContent.tsx'), 'utf-8')

  it('imports usePostHog from posthog-js/react', () => {
    expect(reqContentSource).toContain("from 'posthog-js/react'")
  })

  it('calls posthog.capture with requirements_viewed', () => {
    expect(reqContentSource).toContain("capture('requirements_viewed'")
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

describe('Issue #10: view_requirements_clicked via ViewRequirementsLink component', () => {
  const linkSource = fs.readFileSync(path.join(__dirname, '../components/ViewRequirementsLink.tsx'), 'utf-8')

  it('is a client component', () => {
    expect(linkSource).toContain("'use client'")
  })

  it('imports usePostHog from posthog-js/react', () => {
    expect(linkSource).toContain("from 'posthog-js/react'")
  })

  it('calls posthog.capture with view_requirements_clicked', () => {
    expect(linkSource).toContain("capture('view_requirements_clicked'")
  })

  it('list page uses ViewRequirementsLink component', () => {
    const listSource = fs.readFileSync(path.join(__dirname, '../app/list/page.tsx'), 'utf-8')
    expect(listSource).toContain('ViewRequirementsLink')
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
    expect(nextConfigSource).toContain('project: "listready"')
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

describe('Issue #22: FeedbackRow added to requirements page', () => {
  const reqContentSource = fs.readFileSync(path.join(__dirname, '../app/requirements/RequirementsContent.tsx'), 'utf-8')

  it('imports FeedbackRow', () => {
    expect(reqContentSource).toContain("import FeedbackRow from '@/components/FeedbackRow'")
  })

  it('renders FeedbackRow with requirements screen', () => {
    expect(reqContentSource).toContain('<FeedbackRow screen="requirements"')
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
    // The standalone usage after the locked-rows section should be gone
    const afterLockedRows = schoolListSource.slice(
      schoolListSource.indexOf('Lock badge'),
    )
    expect(afterLockedRows).not.toContain('<FeedbackRow')
  })

  it('globals.css contains feedback-pop keyframe', () => {
    const cssSource = fs.readFileSync(path.join(__dirname, '../app/globals.css'), 'utf-8')
    expect(cssSource).toContain('@keyframes feedback-pop')
    expect(cssSource).toContain('scale(1.1)')
  })
})

describe('Issue #23: FeedbackRow placed in requirements header row', () => {
  const reqContentSource = fs.readFileSync(path.join(__dirname, '../app/requirements/RequirementsContent.tsx'), 'utf-8')

  it('FeedbackRow is in the progress summary row (same block as doneCount)', () => {
    const doneCountIdx = reqContentSource.indexOf('doneCount} of')
    const feedbackIdx = reqContentSource.indexOf('<FeedbackRow screen="requirements"')
    // FeedbackRow should appear close to the doneCount line (within 300 chars)
    expect(Math.abs(feedbackIdx - doneCountIdx)).toBeLessThan(300)
  })

  it('FeedbackRow appears before any school listing sections (no Deadline Tracking section)', () => {
    const feedbackIdx = reqContentSource.indexOf('<FeedbackRow screen="requirements"')
    const schoolSectionIdx = reqContentSource.indexOf('Your matched schools in this category')
    // FeedbackRow should be before the per-school listing
    expect(feedbackIdx).toBeGreaterThan(-1)
    expect(feedbackIdx).toBeLessThan(schoolSectionIdx)
  })
})

// ── Issue #34: Remove commute filter entirely ────────────────────────────────

describe('Issue #34: commute removed from types/index.ts', () => {
  const typesSource = fs.readFileSync(path.join(__dirname, '../types/index.ts'), 'utf-8')

  it('does NOT contain commute field in UserInputs', () => {
    expect(typesSource).not.toContain('commute')
  })
})

describe('Issue #34: commute removed from home page', () => {
  const homeSource = fs.readFileSync(path.join(__dirname, '../app/page.tsx'), 'utf-8')

  it('does NOT contain commute state declaration', () => {
    expect(homeSource).not.toContain('setCommute')
  })

  it('does NOT contain commute in SavedForm interface', () => {
    expect(homeSource).not.toContain("commute: string")
  })

  it('does NOT contain commute in URLSearchParams', () => {
    expect(homeSource).not.toContain("commute,")
  })

  it('does NOT render the commute UI field', () => {
    expect(homeSource).not.toContain('Commute preference')
  })

  it('does NOT contain commute in localStorage.setItem call', () => {
    // The JSON.stringify object passed to localStorage should not include commute
    const setItemIdx = homeSource.indexOf('localStorage.setItem')
    const setItemBlock = homeSource.slice(setItemIdx, setItemIdx + 200)
    expect(setItemBlock).not.toContain('commute')
  })
})

describe('Issue #34: commute removed from list page', () => {
  const listSource = fs.readFileSync(path.join(__dirname, '../app/list/page.tsx'), 'utf-8')

  it('does NOT contain commute in parseInputs', () => {
    expect(listSource).not.toContain("commute:")
  })

  it('does NOT reference inputs.commute in applyFilters', () => {
    expect(listSource).not.toContain('inputs.commute')
  })

  it('borough filter uses boroughs array — simpler condition exists', () => {
    expect(listSource).toContain('!noBorough(inputs.boroughs) && !relaxBorough && !inputs.boroughs.includes(school.borough)')
  })

  it('relaxedNote does NOT mention short commute', () => {
    expect(listSource).not.toContain('Not enough nearby matches')
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

describe('Issue #35: Home page borough checkboxes', () => {
  const homeSource = fs.readFileSync(path.join(__dirname, '../app/page.tsx'), 'utf-8')

  it('uses boroughs state (not borough)', () => {
    expect(homeSource).toContain('const [boroughs, setBoroughs]')
    expect(homeSource).not.toContain("useState('All Boroughs')")
  })

  it('SavedForm has boroughs: string[] (not borough: string)', () => {
    expect(homeSource).toContain('boroughs: string[]')
    expect(homeSource).not.toContain('borough: string')
  })

  it('restores boroughs from localStorage as array', () => {
    expect(homeSource).toContain('Array.isArray(saved.boroughs)')
  })

  it('has toggleBorough function', () => {
    expect(homeSource).toContain('function toggleBorough(value: string)')
  })

  it('has Select all button', () => {
    expect(homeSource).toContain('Select all')
  })

  it('renders checkboxes for each borough', () => {
    expect(homeSource).toContain('type="checkbox"')
    expect(homeSource).toContain('toggleBorough(b)')
  })

  it('does NOT contain the old borough dropdown select element', () => {
    expect(homeSource).not.toContain("value=\"All Boroughs\"")
  })

  it('validates that at least one borough is selected', () => {
    expect(homeSource).toContain("boroughs.length === 0")
    expect(homeSource).toContain('Please select at least one borough.')
  })

  it('passes boroughs as comma-separated borough param', () => {
    expect(homeSource).toContain("params.set('borough', boroughs.join(','))")
  })

  it('saves boroughs to localStorage', () => {
    const setItemIdx = homeSource.indexOf('localStorage.setItem')
    const setItemBlock = homeSource.slice(setItemIdx, setItemIdx + 200)
    expect(setItemBlock).toContain('boroughs')
    expect(setItemBlock).not.toContain("borough,")
  })
})

describe('Issue #35: List page borough array filtering', () => {
  const listSource = fs.readFileSync(path.join(__dirname, '../app/list/page.tsx'), 'utf-8')

  it('parseInputs splits borough param into boroughs array', () => {
    expect(listSource).toContain("boroughParam.split(',').filter(Boolean)")
  })

  it('noBorough checks array length', () => {
    expect(listSource).toContain('boroughs.length === 0')
  })

  it('applyFilters uses boroughs.includes()', () => {
    expect(listSource).toContain('inputs.boroughs.includes(school.borough)')
  })

  it('does NOT contain relaxedNote variable', () => {
    expect(listSource).not.toContain('relaxedNote')
  })

  it('boroughLabel uses boroughs array join', () => {
    expect(listSource).toContain("inputs.boroughs.join(', ')")
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

describe('Issue #36: Homepage title and tagline copy', () => {
  const homeSource = fs.readFileSync(path.join(__dirname, '../app/page.tsx'), 'utf-8')

  it('title uses title-case "Find the Right High School"', () => {
    expect(homeSource).toContain('Find the Right High School')
  })

  it('does NOT contain the old lowercase title', () => {
    expect(homeSource).not.toContain('Find the right high school')
  })

  it('tagline reads "Set your criteria. Get a matched list of NYC public high schools."', () => {
    expect(homeSource).toContain('Set your criteria. Get a matched list of NYC public high schools.')
  })

  it('does NOT contain the old tagline', () => {
    expect(homeSource).not.toContain('Answer a few questions')
  })
})

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

describe('Issue #37: Home page Academic Rating checkboxes', () => {
  const homeSource = fs.readFileSync(path.join(__dirname, '../app/page.tsx'), 'utf-8')

  it('uses academicRatings state (not academicLevel)', () => {
    expect(homeSource).toContain('const [academicRatings, setAcademicRatings]')
    expect(homeSource).not.toContain('academicLevel')
  })

  it('SavedForm has academicRatings: string[]', () => {
    expect(homeSource).toContain('academicRatings: string[]')
  })

  it('restores academicRatings from localStorage as array', () => {
    expect(homeSource).toContain('Array.isArray(saved.academicRatings)')
  })

  it('has toggleAcademicRating function', () => {
    expect(homeSource).toContain('function toggleAcademicRating(value: string)')
  })

  it('renders checkboxes for Exceptional, Strong, Above Average', () => {
    expect(homeSource).toContain("'exceptional'")
    expect(homeSource).toContain('Exceptional')
    expect(homeSource).toContain("'strong'")
    expect(homeSource).toContain('Strong')
    expect(homeSource).toContain("'above_average'")
    expect(homeSource).toContain('Above Average')
  })

  it('validates academicRatings.length === 0', () => {
    expect(homeSource).toContain('academicRatings.length === 0')
    expect(homeSource).toContain('Please select an academic rating.')
  })

  it('passes academicRatings as comma-separated param', () => {
    expect(homeSource).toContain("params.set('academicRatings', academicRatings.join(','))")
  })

  it('saves academicRatings to localStorage', () => {
    const setItemIdx = homeSource.indexOf('localStorage.setItem')
    const setItemBlock = homeSource.slice(setItemIdx, setItemIdx + 200)
    expect(setItemBlock).toContain('academicRatings')
  })

  it('labels the section "Academic Rating" (not "Academic level")', () => {
    expect(homeSource).toContain('Academic Rating')
    expect(homeSource).not.toContain('Academic level')
  })
})

describe('Issue #37: List page academicRatings parsing and filtering', () => {
  const listSource = fs.readFileSync(path.join(__dirname, '../app/list/page.tsx'), 'utf-8')

  it('parseInputs reads academicRatings param (not level)', () => {
    expect(listSource).toContain("str('academicRatings', '')")
    expect(listSource).not.toContain("str('level',")
  })

  it('has matchesAcademicRating helper function', () => {
    expect(listSource).toContain('function matchesAcademicRating(')
  })

  it('matchesAcademicRating includes null-score logic for above_average', () => {
    expect(listSource).toContain("ratings.includes('above_average')")
  })

  it('isEligible calls matchesAcademicRating', () => {
    expect(listSource).toContain('matchesAcademicRating(school, inputs.academicRatings)')
  })

  it('showScreened logic based on exceptional or strong', () => {
    expect(listSource).toContain("inputs.academicRatings.includes('exceptional')")
    expect(listSource).toContain("inputs.academicRatings.includes('strong')")
  })

  it('does NOT contain the old academicLevel field', () => {
    expect(listSource).not.toContain('academicLevel')
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
  const listSource = fs.readFileSync(path.join(__dirname, '../app/list/page.tsx'), 'utf-8')
  const isEligibleBlock = listSource.slice(
    listSource.indexOf('function isEligible('),
    listSource.indexOf('function applyFilters('),
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
  const listSource = fs.readFileSync(path.join(__dirname, '../app/list/page.tsx'), 'utf-8')
  const noBoroughBlock = listSource.slice(
    listSource.indexOf('function noBorough('),
    listSource.indexOf('function matchesAcademicRating('),
  )

  it('noBorough returns true for length >= 5', () => {
    expect(noBoroughBlock).toContain('boroughs.length >= 5')
  })

  it('noBorough still returns true for empty array', () => {
    expect(noBoroughBlock).toContain('boroughs.length === 0')
  })
})

// ── Issue #39: Per-school requirements page + Full Access copy ────────────────

describe('Issue #39: requirements page.tsx is a server component', () => {
  const pageSource = fs.readFileSync(path.join(__dirname, '../app/requirements/page.tsx'), 'utf-8')

  it('does NOT have "use client" directive (server component)', () => {
    expect(pageSource).not.toContain("'use client'")
  })

  it('imports fs for server-side file reading', () => {
    expect(pageSource).toContain("import fs from 'fs'")
  })

  it('exports ReqSection type for client component', () => {
    expect(pageSource).toContain('export interface ReqSection')
  })

  it('imports RequirementsContent client component', () => {
    expect(pageSource).toContain("import RequirementsContent from './RequirementsContent'")
  })

  it('contains buildReqSections function', () => {
    expect(pageSource).toContain('function buildReqSections(')
  })

  it('groups schools by admissions_type sections', () => {
    expect(pageSource).toContain("'Screened with Assessment'")
    expect(pageSource).toContain("'Educational Option'")
  })

  it('returns RequirementsContent component', () => {
    expect(pageSource).toContain('<RequirementsContent')
  })
})

describe('Issue #39: RequirementsContent.tsx is a client component', () => {
  const reqContentSource = fs.readFileSync(path.join(__dirname, '../app/requirements/RequirementsContent.tsx'), 'utf-8')

  it('has "use client" directive', () => {
    expect(reqContentSource).toContain("'use client'")
  })

  it('contains SHSAT requirements copy', () => {
    expect(reqContentSource).toContain('SHSAT score is the sole admissions criterion for these schools.')
    expect(reqContentSource).toContain('Register for the SHSAT by October 31, 2026')
  })

  it('contains Audition requirements copy', () => {
    expect(reqContentSource).toContain('Prepare your audition or portfolio materials')
    expect(reqContentSource).toContain('October 7 to December 3')
  })

  it('contains Screened requirements copy', () => {
    expect(reqContentSource).toContain('Screened programs review your grades, attendance record')
    expect(reqContentSource).toContain('two-track system')
  })

  it('contains Screened with Assessment requirements copy', () => {
    expect(reqContentSource).toContain('school-specific assessment in addition to your grades')
  })

  it('contains Educational Option requirements copy', () => {
    expect(reqContentSource).toContain('Ed Opt programs are designed to reflect a mix of academic levels')
  })

  it('contains Lottery/Open Enrollment requirements copy', () => {
    expect(reqContentSource).toContain('Admission is by lottery')
    expect(reqContentSource).toContain('All applicants who rank the school have an equal chance')
  })

  it('contains All Applicants section always shown last', () => {
    expect(reqContentSource).toContain('All Applicants')
    expect(reqContentSource).toContain('Application window opens October 7 and closes December 3')
    expect(reqContentSource).toContain('High school offers are released March 5')
  })

  it('shows matched school names under each section', () => {
    expect(reqContentSource).toContain('Your matched schools in this category')
  })

  it('handles cross-listed schools with section notes', () => {
    expect(reqContentSource).toContain('sectionNotes')
  })

  it('contains new disclaimer text from issue spec', () => {
    expect(reqContentSource).toContain('Every effort was made to keep this data current')
    expect(reqContentSource).toContain('No tool can guarantee an offer')
    expect(reqContentSource).toContain('Before submitting, confirm deadlines and requirements at')
  })

  it('does NOT contain Season Pass label', () => {
    expect(reqContentSource).not.toContain('Season Pass')
  })

  it('does NOT contain "coming soon" language', () => {
    expect(reqContentSource).not.toContain('coming soon')
  })

  it('does NOT have Deadline Tracking locked section', () => {
    expect(reqContentSource).not.toContain('Deadline Tracking')
  })
})

describe('Issue #39: Season Pass → Full Access across all files', () => {
  it('list page uses "Full Access" not "Season Pass"', () => {
    const listSource = fs.readFileSync(path.join(__dirname, '../app/list/page.tsx'), 'utf-8')
    expect(listSource).toContain('Full Access')
    expect(listSource).not.toContain('Season Pass')
  })

  it('home page uses "Full Access" not "Season Pass"', () => {
    const homeSource = fs.readFileSync(path.join(__dirname, '../app/page.tsx'), 'utf-8')
    expect(homeSource).toContain('Full Access')
    expect(homeSource).not.toContain('Season Pass')
  })

  it('SchoolList uses "Full Access" not "Season Pass"', () => {
    const schoolListSource = fs.readFileSync(path.join(__dirname, '../components/SchoolList.tsx'), 'utf-8')
    expect(schoolListSource).toContain('Full Access')
    expect(schoolListSource).not.toContain('Season Pass')
  })

  it('requirements page.tsx does not contain Season Pass', () => {
    const pageSource = fs.readFileSync(path.join(__dirname, '../app/requirements/page.tsx'), 'utf-8')
    expect(pageSource).not.toContain('Season Pass')
  })

  it('RequirementsContent.tsx does not contain Season Pass', () => {
    const reqContentSource = fs.readFileSync(path.join(__dirname, '../app/requirements/RequirementsContent.tsx'), 'utf-8')
    expect(reqContentSource).not.toContain('Season Pass')
  })

  it('list page does not have "coming soon" language', () => {
    const listSource = fs.readFileSync(path.join(__dirname, '../app/list/page.tsx'), 'utf-8')
    expect(listSource).not.toContain('coming soon')
  })

  it('home page does not have "coming soon" language', () => {
    const homeSource = fs.readFileSync(path.join(__dirname, '../app/page.tsx'), 'utf-8')
    expect(homeSource).not.toContain('coming soon')
  })
})

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

describe('Issue #40: SchoolList lock banner', () => {
  it('SchoolList always shows lock banner (no conditional on totalCount)', () => {
    const schoolListSource = fs.readFileSync(path.join(__dirname, '../components/SchoolList.tsx'), 'utf-8')
    // Must NOT use the old "visibleCount < totalCount" guard
    expect(schoolListSource).not.toContain('visibleCount < totalCount')
    // Must reference PAID_TIER_CAP and FREE_TIER_CAP for the count
    expect(schoolListSource).toContain('PAID_TIER_CAP - FREE_TIER_CAP')
  })

  it('lock banner shows "15 more schools" (PAID_TIER_CAP 30 minus FREE_TIER_CAP 15)', () => {
    expect(PAID_TIER_CAP - FREE_TIER_CAP).toBe(15)
  })
})

describe('Issue #40: list page uses capped results', () => {
  it('list page imports capSchoolsByCategory', () => {
    const listSource = fs.readFileSync(path.join(__dirname, '../app/list/page.tsx'), 'utf-8')
    expect(listSource).toContain('capSchoolsByCategory')
  })

  it('list page uses cappedResults for header count', () => {
    const listSource = fs.readFileSync(path.join(__dirname, '../app/list/page.tsx'), 'utf-8')
    expect(listSource).toContain('cappedResults.length')
  })
})

describe('Issue #40: requirements page uses capped results and lock banner', () => {
  it('requirements page imports capSchoolsByCategory', () => {
    const pageSource = fs.readFileSync(path.join(__dirname, '../app/requirements/page.tsx'), 'utf-8')
    expect(pageSource).toContain('capSchoolsByCategory')
  })

  it('requirements page caps schools before building sections', () => {
    const pageSource = fs.readFileSync(path.join(__dirname, '../app/requirements/page.tsx'), 'utf-8')
    expect(pageSource).toContain('cappedSchools')
  })

  it('RequirementsContent renders lock banners', () => {
    const contentSource = fs.readFileSync(path.join(__dirname, '../app/requirements/RequirementsContent.tsx'), 'utf-8')
    expect(contentSource).toContain('lockedCount')
    expect(contentSource).toContain('Full Access')
    expect(contentSource).toContain('LockBanner')
  })
})

// ── Issue #41: School names and order on requirements page match My Schools list ───

describe('Issue #41: formatSchoolName in requirements page', () => {
  const pageSource = fs.readFileSync(path.join(__dirname, '../app/requirements/page.tsx'), 'utf-8')

  it('defines formatSchoolName function', () => {
    expect(pageSource).toContain('function formatSchoolName(')
  })

  it('moves ", The" suffix to the front', () => {
    expect(pageSource).toContain("name.endsWith(', The')")
    expect(pageSource).toContain("'The ' + name.slice(0, -5)")
  })

  it('applies formatSchoolName when building section schools', () => {
    expect(pageSource).toContain('formatSchoolName(school.name)')
  })

  it('does NOT sort schools alphabetically within sections (order matches list page)', () => {
    // The old buggy sort was: buckets[key].sort((a, b) => a.name.localeCompare(b.name))
    expect(pageSource).not.toContain('localeCompare')
  })
})

describe('Issue #41: requirements page ordering matches list page', () => {
  const pageSource = fs.readFileSync(path.join(__dirname, '../app/requirements/page.tsx'), 'utf-8')

  it('uses selectSHSATSchools (same as list page) for SHSAT school selection', () => {
    expect(pageSource).toContain('function selectSHSATSchools(')
    expect(pageSource).toContain('selectSHSATSchools(allSchools, inputs)')
  })

  it('uses sortByHomeBorough (same as list page)', () => {
    expect(pageSource).toContain('function sortByHomeBorough(')
    expect(pageSource).toContain('sortByHomeBorough(baseResults, inputs.boroughs)')
  })

  it('uses sortBySize (same as list page)', () => {
    expect(pageSource).toContain('function sortBySize(')
    expect(pageSource).toContain('sortBySize(')
  })

  it('applies sports soft-filter same as list page', () => {
    expect(pageSource).toContain('function matchesSports(')
    expect(pageSource).toContain('inputs.sports.length > 0')
  })

  it('contains BOROUGH_ORDER for SHSAT borough prioritization', () => {
    expect(pageSource).toContain('BOROUGH_ORDER')
    expect(pageSource).toContain("'Staten Island'")
  })
})

describe('Issue #41: formatSchoolName unit behaviour', () => {
  function formatSchoolName(name: string): string {
    if (name.endsWith(', The')) {
      return 'The ' + name.slice(0, -5)
    }
    return name
  }

  it('moves ", The" suffix to the front', () => {
    expect(formatSchoolName('Bronx High School of Science, The')).toBe('The Bronx High School of Science')
  })

  it('leaves names without ", The" unchanged', () => {
    expect(formatSchoolName('Brooklyn Technical High School')).toBe('Brooklyn Technical High School')
  })

  it('handles names that already start with The', () => {
    expect(formatSchoolName('The High School for Math, Science and Engineering at CCNY')).toBe(
      'The High School for Math, Science and Engineering at CCNY',
    )
  })

  it('is consistent with the SchoolRow.tsx implementation', () => {
    const schoolRowSource = fs.readFileSync(path.join(__dirname, '../components/SchoolRow.tsx'), 'utf-8')
    const reqPageSource = fs.readFileSync(path.join(__dirname, '../app/requirements/page.tsx'), 'utf-8')
    // Both files should contain the same logic pattern
    expect(schoolRowSource).toContain("name.endsWith(', The')")
    expect(reqPageSource).toContain("name.endsWith(', The')")
    expect(schoolRowSource).toContain("'The ' + name.slice(0, -5)")
    expect(reqPageSource).toContain("'The ' + name.slice(0, -5)")
  })
})

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

describe('Issue #44: SHSAT cutoff data in requirements page.tsx', () => {
  const pageSource = fs.readFileSync(path.join(__dirname, '../app/requirements/page.tsx'), 'utf-8')

  it('defines SHSAT_CUTOFFS constant', () => {
    expect(pageSource).toContain('SHSAT_CUTOFFS')
  })

  it('defines ShsatCutoffInfo interface (exported)', () => {
    expect(pageSource).toContain('export interface ShsatCutoffInfo')
  })

  it('ReqSection has optional shsatCutoffInfo field', () => {
    expect(pageSource).toContain('shsatCutoffInfo?: ShsatCutoffInfo')
  })

  it('contains all 8 specialized HS DBNs in the cutoff table', () => {
    expect(pageSource).toContain("'02M475'") // Stuyvesant
    expect(pageSource).toContain("'13K430'") // Brooklyn Tech
    expect(pageSource).toContain("'10X445'") // Bronx Science
    expect(pageSource).toContain("'31R605'") // Staten Island Technical
  })

  it('defines SHSAT_CUTOFFS_YEAR', () => {
    expect(pageSource).toContain('SHSAT_CUTOFFS_YEAR')
  })

  it('computes lowestScore from matched schools', () => {
    expect(pageSource).toContain('lowestScore')
    expect(pageSource).toContain('Math.min(')
  })

  it('attaches shsatCutoffInfo to the SHSAT section', () => {
    expect(pageSource).toContain('shsatCutoffInfo')
    expect(pageSource).toContain("s.key === 'shsat'")
  })

  it('only attaches cutoff info when inputs.shsat is true', () => {
    expect(pageSource).toContain('if (inputs.shsat)')
  })
})

describe('Issue #44: SHSAT cutoff display in RequirementsContent.tsx', () => {
  const contentSource = fs.readFileSync(path.join(__dirname, '../app/requirements/RequirementsContent.tsx'), 'utf-8')

  it('does not define a separate renderShsatCutoffs function (inline display used instead)', () => {
    expect(contentSource).not.toContain('function renderShsatCutoffs(')
  })

  it('uses shsatCutoffInfo to build a cutoff score map for inline display', () => {
    expect(contentSource).toContain('section.shsatCutoffInfo')
    expect(contentSource).toContain('cutoffMap')
  })

  it('shows cutoff score inline next to school name', () => {
    expect(contentSource).toContain('cutoffMap?.has(school.name)')
    expect(contentSource).toContain('cutoffMap.get(school.name)')
  })

  it('suppresses italic prgdesc for SHSAT schools when cutoffMap is present', () => {
    expect(contentSource).toContain('!cutoffMap && school.prgdesc')
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

describe('Issue #45: Disclaimer and verified line moved to bottom', () => {
  const reqContentSource = fs.readFileSync(path.join(__dirname, '../app/requirements/RequirementsContent.tsx'), 'utf-8')

  it('disclaimer appears AFTER All Applicants section in source order', () => {
    const allApplicantsIdx = reqContentSource.indexOf('All Applicants — always shown last')
    const disclaimerIdx = reqContentSource.indexOf('Every effort was made to keep this data current')
    expect(allApplicantsIdx).toBeGreaterThan(-1)
    expect(disclaimerIdx).toBeGreaterThan(-1)
    expect(disclaimerIdx).toBeGreaterThan(allApplicantsIdx)
  })

  it('"Deadlines last verified" line appears AFTER All Applicants section in source order', () => {
    const allApplicantsIdx = reqContentSource.indexOf('All Applicants — always shown last')
    const verifiedIdx = reqContentSource.indexOf('Deadlines last verified')
    expect(allApplicantsIdx).toBeGreaterThan(-1)
    expect(verifiedIdx).toBeGreaterThan(-1)
    expect(verifiedIdx).toBeGreaterThan(allApplicantsIdx)
  })

  it('disclaimer appears AFTER the per-section requirements loop in source order', () => {
    const sectionsLoopIdx = reqContentSource.indexOf('Per-section requirements')
    const disclaimerIdx = reqContentSource.indexOf('Every effort was made to keep this data current')
    expect(sectionsLoopIdx).toBeGreaterThan(-1)
    expect(disclaimerIdx).toBeGreaterThan(sectionsLoopIdx)
  })

  it('disclaimer appears BEFORE the bottom Lock banner', () => {
    const disclaimerIdx = reqContentSource.indexOf('Every effort was made to keep this data current')
    const lockBannerBottomIdx = reqContentSource.indexOf('Lock banner — bottom')
    expect(disclaimerIdx).toBeGreaterThan(-1)
    expect(lockBannerBottomIdx).toBeGreaterThan(-1)
    expect(disclaimerIdx).toBeLessThan(lockBannerBottomIdx)
  })
})

describe('Issue #45: Section headers styled with colored backgrounds', () => {
  const reqContentSource = fs.readFileSync(path.join(__dirname, '../app/requirements/RequirementsContent.tsx'), 'utf-8')

  it('defines SECTION_STYLE constant', () => {
    expect(reqContentSource).toContain('SECTION_STYLE')
  })

  it('SHSAT section uses blue-600 background', () => {
    expect(reqContentSource).toContain("shsat: { bg: 'bg-blue-600'")
  })

  it('audition section uses purple-600 background', () => {
    expect(reqContentSource).toContain("audition: { bg: 'bg-purple-600'")
  })

  it('screened section uses orange-500 background', () => {
    expect(reqContentSource).toContain("screened: { bg: 'bg-orange-500'")
  })

  it('screened_assessment section uses orange-400 background', () => {
    expect(reqContentSource).toContain("screened_assessment: { bg: 'bg-orange-400'")
  })

  it('edopt section uses amber-400 background', () => {
    expect(reqContentSource).toContain("edopt: { bg: 'bg-amber-400'")
  })

  it('lottery section uses gray-500 background', () => {
    expect(reqContentSource).toContain("lottery: { bg: 'bg-gray-500'")
  })

  it('All Applicants section uses a dark background style', () => {
    expect(reqContentSource).toContain('ALL_APPLICANTS_STYLE')
    expect(reqContentSource).toContain("bg: 'bg-gray-700'")
  })

  it('section h2 uses sStyle.bg and sStyle.text for dynamic styling', () => {
    expect(reqContentSource).toContain('sStyle.bg')
    expect(reqContentSource).toContain('sStyle.text')
  })

  it('All Applicants h2 uses ALL_APPLICANTS_STYLE', () => {
    const allApplicantsH2Block = reqContentSource.slice(
      reqContentSource.indexOf('All Applicants — always shown last'),
      reqContentSource.indexOf('All Applicants — always shown last') + 200,
    )
    expect(allApplicantsH2Block).toContain('ALL_APPLICANTS_STYLE')
  })

  it('section h2 does NOT use the old plain text-gray-900 header styling', () => {
    // The old header was: text-gray-900 uppercase tracking-wide mb-3 pb-2 border-b border-gray-200
    expect(reqContentSource).not.toContain('pb-2 border-b border-gray-200')
  })
})

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

describe('Issue #43: section order — Ed Opt after Lottery', () => {
  it('list page section order array has lottery before edopt', () => {
    const listSource = fs.readFileSync(path.join(__dirname, '../app/list/page.tsx'), 'utf-8')
    // Match the order array specifically (single line)
    const match = listSource.match(/const order: SectionType\[\] = \[([^\]]+)\]/)
    expect(match).not.toBeNull()
    const orderStr = match![1]
    const lotteryIdx = orderStr.indexOf("'lottery'")
    const edoptIdx = orderStr.indexOf("'edopt'")
    expect(lotteryIdx).toBeGreaterThan(-1)
    expect(edoptIdx).toBeGreaterThan(-1)
    expect(lotteryIdx).toBeLessThan(edoptIdx)
  })

  it('requirements page SECTION_ORDER has lottery before edopt', () => {
    const reqSource = fs.readFileSync(path.join(__dirname, '../app/requirements/page.tsx'), 'utf-8')
    // Match the multi-line SECTION_ORDER array
    const match = reqSource.match(/SECTION_ORDER: SectionKey\[\] = \[([\s\S]*?)\]/)
    expect(match).not.toBeNull()
    const block = match![1]
    const lotteryIdx = block.indexOf("'lottery'")
    const edoptIdx = block.indexOf("'edopt'")
    expect(lotteryIdx).toBeGreaterThan(-1)
    expect(edoptIdx).toBeGreaterThan(-1)
    expect(lotteryIdx).toBeLessThan(edoptIdx)
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

describe('Issue #51: SchoolInSection DOE fields in page.tsx', () => {
  const pageSource = fs.readFileSync(path.join(__dirname, '../app/requirements/page.tsx'), 'utf-8')

  it('SchoolInSection has prgdesc field', () => {
    expect(pageSource).toContain('prgdesc?: string')
  })

  it('SchoolInSection has auditionInformation field', () => {
    expect(pageSource).toContain('auditionInformation?: string[]')
  })

  it('SchoolInSection has requirements field', () => {
    expect(pageSource).toContain('requirements?: Record<string, string>')
  })

  it('buildReqSections passes auditionInformation only for audition key', () => {
    expect(pageSource).toContain("key === 'audition' && audInfo?.length ? audInfo : undefined")
  })

  it('buildReqSections passes requirements only for screened/screened_assessment keys', () => {
    expect(pageSource).toContain("key === 'screened' || key === 'screened_assessment'")
  })

  it('passes doe_data.prgdesc to SchoolInSection', () => {
    expect(pageSource).toContain('prgdesc: doeData?.prgdesc || undefined')
  })
})

describe('Issue #51: Per-school requirements rendering in RequirementsContent.tsx', () => {
  const src = fs.readFileSync(path.join(__dirname, '../app/requirements/RequirementsContent.tsx'), 'utf-8')

  it('defines PER_SCHOOL_KEYS constant', () => {
    expect(src).toContain("const PER_SCHOOL_KEYS = new Set(['audition', 'screened', 'screened_assessment'])")
  })

  it('allItems filters out per-school sections', () => {
    expect(src).toContain('PER_SCHOOL_KEYS.has(s.key)')
  })

  it('defines firstSentence helper', () => {
    expect(src).toContain('function firstSentence(text: string): string')
  })

  it('defines renderScreenedRequirements helper', () => {
    expect(src).toContain('function renderScreenedRequirements(requirements: Record<string, string>)')
  })

  it('groups requirements by program number via regex', () => {
    expect(src).toContain("key.match(/^requirement\\d+_(\\d+)$/)")
  })

  it('renders school.prgdesc as italic description', () => {
    expect(src).toContain('firstSentence(school.prgdesc)')
  })

  it('renders school.auditionInformation for audition programs', () => {
    expect(src).toContain('school.auditionInformation.slice(0, 3).map((info, i) =>')
  })

  it('labels multiple audition programs as Program N', () => {
    expect(src).toContain('Program {i + 1}')
  })

  it('renders school.requirements for screened programs', () => {
    expect(src).toContain('renderScreenedRequirements(school.requirements)')
  })

  it('renderItems is conditional on section key', () => {
    expect(src).toContain('!PER_SCHOOL_KEYS.has(section.key) && renderItems(items)')
  })

  it('section render order preserved: description → schools → renderItems', () => {
    const sectionLoopStart = src.indexOf('sections.map((section)')
    const descriptionIdx = src.indexOf('SECTION_DESCRIPTIONS[section.key]', sectionLoopStart)
    const schoolsIdx = src.indexOf('Your matched schools in this category', sectionLoopStart)
    const checklistIdx = src.indexOf('renderItems(items)', sectionLoopStart)
    expect(descriptionIdx).toBeGreaterThan(sectionLoopStart)
    expect(schoolsIdx).toBeGreaterThan(descriptionIdx)
    expect(checklistIdx).toBeGreaterThan(schoolsIdx)
  })
})

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

describe('Issue #51: fallback for schools with empty DOE data', () => {
  const src = fs.readFileSync(path.join(__dirname, '../app/requirements/RequirementsContent.tsx'), 'utf-8')

  it('renders fallback copy when school has no audition or requirements data', () => {
    expect(src).toContain('!school.auditionInformation?.length && !school.requirements')
  })

  it('fallback uses SECTION_REQUIREMENTS for the current section key', () => {
    expect(src).toContain('SECTION_REQUIREMENTS[section.key]')
  })

  it('fallback renders items as plain text bullets, not checkboxes', () => {
    const fallbackIdx = src.indexOf('!school.auditionInformation?.length && !school.requirements')
    const bulletIdx = src.indexOf('• {item.text}', fallbackIdx)
    expect(bulletIdx).toBeGreaterThan(fallbackIdx)
  })

  it('school name is always bold (not conditional on having data)', () => {
    expect(src).toContain('"font-semibold text-gray-900"')
    expect(src).not.toContain('school.auditionInformation || school.requirements ? \'font-semibold text-gray-900\'')
  })
})

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

  it('system prompt focuses on school distinctives, not repeating user filter selections', () => {
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
  const listSource = fs.readFileSync(path.join(__dirname, '../app/list/page.tsx'), 'utf-8')

  it('getPrimarySection does not route Educational Option to edopt', () => {
    expect(listSource).not.toContain("admissions_types.includes('Educational Option')")
  })

  it('getPrimarySection falls through to lottery after screened check', () => {
    // The function should end with: return 'lottery' immediately after the screened check
    const match = listSource.match(/function getPrimarySection[\s\S]*?return 'lottery'\s*\n\}/)
    expect(match).not.toBeNull()
    // No edopt return inside getPrimarySection
    const fnMatch = listSource.match(/function getPrimarySection\([\s\S]*?\n\}/)
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

  it('system prompt asks for concrete details with counts and examples', () => {
    expect(routeSrc).toContain('concrete details with counts and examples')
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

// ── Issue #55: Match section header styling; simplify SHSAT section ───────────

describe('Issue #55: Section header styling matches list page', () => {
  const reqContentSource = fs.readFileSync(path.join(__dirname, '../app/requirements/RequirementsContent.tsx'), 'utf-8')

  it('section h2 does NOT use uppercase class', () => {
    // Match only the h2 opening tags (not sub-labels in the section loop)
    const h2Matches = [...reqContentSource.matchAll(/<h2\b[^>]*>/g)]
    for (const match of h2Matches) {
      expect(match[0]).not.toContain('uppercase')
    }
  })

  it('All Applicants h2 does NOT use uppercase class', () => {
    const allApplicantsBlock = reqContentSource.slice(
      reqContentSource.indexOf('All Applicants — always shown last'),
      reqContentSource.indexOf('All Applicants — always shown last') + 300,
    )
    expect(allApplicantsBlock).not.toContain('uppercase tracking-wide')
  })

  it('section h2 includes a count badge using section.schools.length', () => {
    expect(reqContentSource).toContain('section.schools.length')
    expect(reqContentSource).toContain('rounded-full')
  })

  it('SECTION_STYLE includes countBg for each admissions type', () => {
    expect(reqContentSource).toContain("shsat: { bg: 'bg-blue-600'")
    expect(reqContentSource).toContain("countBg: 'bg-blue-500'")
    expect(reqContentSource).toContain("countBg: 'bg-purple-500'")
    expect(reqContentSource).toContain("countBg: 'bg-orange-400'")
    expect(reqContentSource).toContain("countBg: 'bg-gray-400'")
  })

  it('section h2 uses sStyle.countBg for badge background', () => {
    expect(reqContentSource).toContain('sStyle.countBg')
  })
})

describe('Issue #55: SHSAT section simplified — no separate cutoff box', () => {
  const reqContentSource = fs.readFileSync(path.join(__dirname, '../app/requirements/RequirementsContent.tsx'), 'utf-8')

  it('does not render a separate blue cutoff score box', () => {
    expect(reqContentSource).not.toContain('bg-blue-50 border border-blue-100')
    expect(reqContentSource).not.toContain('Recent cutoff scores')
  })

  it('uses cutoffMap to show score inline with school name', () => {
    expect(reqContentSource).toContain('cutoffMap')
    expect(reqContentSource).toContain('cutoffMap.get(school.name)')
  })

  it('does not show prgdesc italic text for SHSAT schools (cutoffMap guard)', () => {
    // Guard is negated: !cutoffMap means prgdesc only shows for non-SHSAT sections
    expect(reqContentSource).toContain('!cutoffMap && school.prgdesc')
  })

  it('builds cutoffMap from section.shsatCutoffInfo.schoolCutoffs', () => {
    expect(reqContentSource).toContain('section.shsatCutoffInfo.schoolCutoffs')
  })
})

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
  const listSource = fs.readFileSync(path.join(__dirname, '../app/list/page.tsx'), 'utf-8')
  const isEligibleBlock = listSource.slice(
    listSource.indexOf('function isEligible('),
    listSource.indexOf('function applyFilters('),
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
