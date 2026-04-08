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
