import * as fs from 'fs'
import * as path from 'path'
import schoolsData from '../schools.json'
import { parseIssueCommand } from '../lib/telegram-utils'
import { getVisibleGroups } from '../lib/school-list-utils'
import { SectionGroup } from '../types'

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

  it('shows remaining school count in the lock placeholder', () => {
    expect(schoolListSource).toContain('totalCount - visibleCount')
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

  it('calls posthog.capture with source_link_clicked', () => {
    expect(schoolRowSource).toContain("capture('source_link_clicked'")
  })

  it('captures school_dbn in source_link_clicked', () => {
    expect(schoolRowSource).toContain('school_dbn')
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
    expect(reqContentSource).toContain('Take and pass the SHSAT exam')
    expect(reqContentSource).toContain('Register for the SHSAT by October 31')
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
