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
  const reqSource = fs.readFileSync(path.join(__dirname, '../app/requirements/page.tsx'), 'utf-8')

  it('links to https://www.myschools.nyc (with www)', () => {
    expect(reqSource).toContain('https://www.myschools.nyc')
  })

  it('myschools.nyc link opens in a new tab', () => {
    expect(reqSource).toContain('target="_blank"')
    expect(reqSource).toContain('rel="noopener noreferrer"')
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

describe('Issue #13: Last verified date on deadline items', () => {
  const reqSource = fs.readFileSync(path.join(__dirname, '../app/requirements/page.tsx'), 'utf-8')

  it('ChecklistItem interface has verifiedDate field', () => {
    expect(reqSource).toContain('verifiedDate?: string')
  })

  it('exactly 4 deadline items have verifiedDate set', () => {
    // shsat_1, aud_2, all_1, all_2 each get a verifiedDate
    const matches = reqSource.match(/verifiedDate: '/g) ?? []
    expect(matches.length).toBe(4)
  })

  it('SHSAT registration item (shsat_1) has verifiedDate on same line', () => {
    expect(reqSource).toContain("id: 'shsat_1', text: 'Register for the SHSAT by October 31', verifiedDate:")
  })

  it('application window item (all_1) has verifiedDate on same line', () => {
    expect(reqSource).toContain("id: 'all_1', text: 'Application window opens October 7 and closes December 3', verifiedDate:")
  })

  it('offers release item (all_2) has verifiedDate on same line', () => {
    expect(reqSource).toContain("id: 'all_2', text: 'High school offers are released March 5', verifiedDate:")
  })

  it('audition upload item (aud_2) has verifiedDate field', () => {
    // aud_2 is multi-line; verify verifiedDate appears in its block
    const aud2Block = reqSource.slice(
      reqSource.indexOf("id: 'aud_2'"),
      reqSource.indexOf("id: 'aud_3'"),
    )
    expect(aud2Block).toContain('verifiedDate:')
  })

  it('renders "Last verified:" text in the JSX', () => {
    expect(reqSource).toContain('Last verified:')
  })

  it('renders a myschools.nyc link in the verified note', () => {
    expect(reqSource).toContain('https://www.myschools.nyc')
  })

  it('verified note link opens in a new tab', () => {
    // At least one occurrence for the verified note (there is also the disclaimer link)
    const matches = reqSource.match(/target="_blank"/g) ?? []
    expect(matches.length).toBeGreaterThanOrEqual(2)
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

  it('shows "Season Pass" label in the expand area', () => {
    expect(schoolListSource).toContain('Season Pass')
  })

  it('shows "coming soon" label in the expand area', () => {
    expect(schoolListSource).toContain('coming soon')
  })

  it('does NOT have a working "Load 15 more" button', () => {
    expect(schoolListSource).not.toContain('>Load 15 more<')
    expect(schoolListSource).not.toContain('Load 15 more\n')
  })

  it('shows remaining school count in the lock placeholder', () => {
    expect(schoolListSource).toContain('totalCount - visibleCount')
  })
})

describe('Issue #12: List page locked download button', () => {
  const listSource = fs.readFileSync(path.join(__dirname, '../app/list/page.tsx'), 'utf-8')

  it('contains a Download list label', () => {
    expect(listSource).toContain('Download list')
  })

  it('contains a lock icon SVG for the download button', () => {
    expect(listSource).toContain('Download school list — Season Pass coming soon')
  })

  it('download button is not a real link or button (cursor-not-allowed)', () => {
    expect(listSource).toContain('cursor-not-allowed')
  })

  it('download area shows Season Pass label', () => {
    expect(listSource).toContain('Season Pass')
  })
})

// ── Issue #11: Fix incorrect "rank up to 12 schools" copy ───────────────────

describe('Issue #11: Ranking cap copy in requirements checklist', () => {
  const reqSource = fs.readFileSync(path.join(__dirname, '../app/requirements/page.tsx'), 'utf-8')

  it('does NOT contain the old "rank up to 12" copy', () => {
    expect(reqSource).not.toContain('rank up to 12 schools')
  })

  it('contains the new copy about ranking more than 12 schools', () => {
    expect(reqSource).toContain('You can rank more than 12 schools')
  })

  it('mentions DOE recommends at least 12 strong options', () => {
    expect(reqSource).toContain('The DOE recommends at least 12 strong options.')
  })

  it('tells users to list every program they would genuinely attend', () => {
    expect(reqSource).toContain('list every program you would genuinely attend')
  })
})

describe('Issue #12: Requirements page locked deadline tracking section', () => {
  const reqSource = fs.readFileSync(path.join(__dirname, '../app/requirements/page.tsx'), 'utf-8')

  it('contains a Deadline Tracking heading', () => {
    expect(reqSource).toContain('Deadline Tracking')
  })

  it('shows Season Pass label on the deadline tracking section', () => {
    const deadlineBlock = reqSource.slice(
      reqSource.indexOf('Deadline Tracking'),
      reqSource.indexOf('Deadline Tracking') + 500,
    )
    expect(deadlineBlock).toContain('Season Pass')
    expect(deadlineBlock).toContain('coming soon')
  })

  it('has a lock icon SVG on the deadline tracking section', () => {
    expect(reqSource).toContain('M12 15v2m-6 4h12')
  })

  it('deadline tracking section is aria-hidden (locked UI)', () => {
    expect(reqSource).toContain('aria-hidden="true"')
  })
})
