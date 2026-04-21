import * as fs from 'fs'
import * as path from 'path'

const srcPath = path.join(__dirname, '../app/requirements/RequirementsContent.tsx')
let src: string

beforeAll(() => {
  src = fs.readFileSync(srcPath, 'utf-8')
})

// ── Hydration guard for checked state ─────────────────────────────────────────

describe('RequirementsContent hydration guard', () => {
  it('defines displayChecked that is empty when not hydrated', () => {
    expect(src).toContain('displayChecked = hydrated ? checked : {}')
  })

  it('does not access checked[item.id] directly in renderItems', () => {
    // Extract the renderItems function body
    const renderItemsStart = src.indexOf('function renderItems(')
    const renderItemsEnd = src.indexOf('\n  }', renderItemsStart) + 4
    const renderItemsBody = src.slice(renderItemsStart, renderItemsEnd)

    // Should not contain raw `checked[` in renderItems — must use displayChecked
    expect(renderItemsBody).not.toContain('checked[item')
  })

  it('uses displayChecked for aria-label in renderItems', () => {
    expect(src).toContain('displayChecked[item.id] ? `Uncheck:')
  })

  it('uses displayChecked for className in renderItems', () => {
    const classNameOccurrences = (src.match(/displayChecked\[item\.id\]/g) ?? []).length
    expect(classNameOccurrences).toBeGreaterThanOrEqual(3)
  })

  it('uses displayChecked for SVG checkmark in renderItems', () => {
    // All 4 uses of item.id lookup in renderItems should use displayChecked
    const renderItemsStart = src.indexOf('function renderItems(')
    const renderItemsEnd = src.indexOf('\n  function LockBanner', renderItemsStart)
    const renderItemsBody = src.slice(renderItemsStart, renderItemsEnd)

    const displayCheckedUses = (renderItemsBody.match(/displayChecked\[item\.id\]/g) ?? []).length
    expect(displayCheckedUses).toBe(4)
  })

  it('doneCount uses displayChecked not checked directly', () => {
    expect(src).toContain('allItems.filter((item) => displayChecked[item.id]).length')
    expect(src).not.toContain('allItems.filter((item) => checked[item.id])')
  })
})

// ── displayChecked logic ───────────────────────────────────────────────────────

describe('displayChecked logic', () => {
  function computeDisplayChecked(
    hydrated: boolean,
    checked: Record<string, boolean>
  ): Record<string, boolean> {
    return hydrated ? checked : {}
  }

  it('returns empty object when not hydrated', () => {
    const checked = { shsat_1: true, all_1: true }
    const result = computeDisplayChecked(false, checked)
    expect(result).toEqual({})
  })

  it('returns empty object when not hydrated and checked is also empty', () => {
    const result = computeDisplayChecked(false, {})
    expect(result).toEqual({})
  })

  it('returns full checked state when hydrated', () => {
    const checked = { shsat_1: true, all_1: false, all_2: true }
    const result = computeDisplayChecked(true, checked)
    expect(result).toEqual(checked)
  })

  it('returns empty object when hydrated but checked is empty', () => {
    const result = computeDisplayChecked(true, {})
    expect(result).toEqual({})
  })

  it('server and client pre-hydration renders produce identical empty state', () => {
    // Simulate server render (hydrated=false, checked={})
    const serverChecked = computeDisplayChecked(false, {})
    // Simulate client pre-hydration render (hydrated=false, checked={})
    const clientChecked = computeDisplayChecked(false, {})
    expect(serverChecked).toEqual(clientChecked)
    expect(Object.keys(serverChecked).length).toBe(0)
  })

  it('checked items only become visible after hydration', () => {
    const storedChecked = { shsat_1: true, aud_1: true }
    const preHydration = computeDisplayChecked(false, storedChecked)
    const postHydration = computeDisplayChecked(true, storedChecked)
    expect(preHydration).toEqual({})
    expect(postHydration.shsat_1).toBe(true)
    expect(postHydration.aud_1).toBe(true)
  })
})

// ── Source structure sanity checks ────────────────────────────────────────────

describe('RequirementsContent source structure', () => {
  it('has use client directive', () => {
    expect(src.startsWith("'use client'")).toBe(true)
  })

  it('has hydrated state initialized to false', () => {
    expect(src).toContain("useState(false)")
  })

  it('sets hydrated to true only inside useEffect', () => {
    expect(src).toContain('setHydrated(true)')
    // setHydrated should be inside useEffect, not at top level
    const useEffectIndex = src.indexOf('useEffect(')
    const setHydratedIndex = src.indexOf('setHydrated(true)')
    expect(setHydratedIndex).toBeGreaterThan(useEffectIndex)
  })

  it('reads localStorage only inside useEffect', () => {
    const localStorageIndex = src.indexOf("localStorage.getItem(STORAGE_KEY)")
    const useEffectIndex = src.indexOf('useEffect(')
    expect(localStorageIndex).toBeGreaterThan(useEffectIndex)
  })

  it('progress counter is guarded by hydrated flag', () => {
    expect(src).toContain('{hydrated && (')
  })
})

// ── Issue #47: SHSAT copy + section order ────────────────────────────────────

describe('SHSAT section copy (issue #47)', () => {
  it('has the new SHSAT description text', () => {
    expect(src).toContain('SHSAT score is the sole admissions criterion for these schools.')
  })

  it('has the register-by-late-October checklist item', () => {
    expect(src).toContain('Register for the SHSAT by late October.')
  })

  it('has the adaptive exam item mentioning SRT', () => {
    expect(src).toContain('Student Readiness Tool (SRT)')
  })

  it('has the practice-tests item', () => {
    expect(src).toContain('Take at least 3-5 practice tests before the SHSAT test date')
  })

  it('SHSAT section has exactly 3 checklist items', () => {
    const shsatItems = src.match(/shsat:\s*\[[\s\S]*?\],/)?.[0] ?? ''
    const idMatches = shsatItems.match(/\{ id: 'shsat_\d+'/g) ?? []
    expect(idMatches.length).toBe(3)
  })

  it('does not contain old SHSAT item text', () => {
    expect(src).not.toContain('Take and pass the SHSAT exam.')
    expect(src).not.toContain('Practice on the same type of device your school uses.')
    expect(src).not.toContain('Offers are released in March alongside')
  })
})

describe('Section render order (issue #47)', () => {
  it('SECTION_DESCRIPTIONS is defined', () => {
    expect(src).toContain('SECTION_DESCRIPTIONS')
  })

  it('description renders before schools in section loop', () => {
    const sectionLoopStart = src.indexOf('sections.map((section)')
    const descriptionIdx = src.indexOf('SECTION_DESCRIPTIONS[section.key]', sectionLoopStart)
    const schoolsIdx = src.indexOf('Your matched schools in this category', sectionLoopStart)
    // SHSAT Prep Checklist renders before schools; non-SHSAT checklist renders after
    const prepChecklistIdx = src.indexOf('Prep Checklist', sectionLoopStart)
    const nonShsatChecklistIdx = src.indexOf('!isSHSAT && renderItems(items)', sectionLoopStart)
    expect(descriptionIdx).toBeGreaterThan(sectionLoopStart)
    expect(prepChecklistIdx).toBeGreaterThan(descriptionIdx)
    expect(schoolsIdx).toBeGreaterThan(prepChecklistIdx)
    expect(nonShsatChecklistIdx).toBeGreaterThan(schoolsIdx)
  })

  it('has descriptions for shsat and audition admissions types', () => {
    expect(src).toContain("shsat: 'SHSAT score is the sole admissions criterion")
    expect(src).toContain("audition: 'Requirements vary by school and by discipline")
  })
})

// ── Issue #63: All Applicants section position and copy ───────────────────────

describe('All Applicants section (issue #63)', () => {
  it('All Applicants section renders before sections.map in JSX', () => {
    const returnStart = src.indexOf('return (')
    const allApplicantsIdx = src.indexOf('All Applicants — always shown first', returnStart)
    const sectionMapIdx = src.indexOf('sections.map((section)', returnStart)
    expect(allApplicantsIdx).toBeGreaterThan(returnStart)
    expect(allApplicantsIdx).toBeLessThan(sectionMapIdx)
  })

  it('does not contain old "always shown last" comment', () => {
    expect(src).not.toContain('All Applicants — always shown last')
  })

  it('has new copy: application window early October', () => {
    expect(src).toContain('Application window opens in early October and closes in early December')
  })

  it('has new copy: attend open houses during window or before', () => {
    expect(src).toContain('Attend open houses and school tours during the application open window or before')
  })

  it('has new copy: ranking 12 strong options with every program', () => {
    expect(src).toContain('Create an application ranking at least 12 strong options in the order of true preference, make sure to list every program at each school')
  })

  it('has new copy: submit at myschools.nyc in the application window', () => {
    expect(src).toContain('Submit your application at myschools.nyc in the application window')
  })

  it('has new copy: offers released in Spring, early March', () => {
    expect(src).toContain('High school offers will be released in Spring, early March')
  })

  it('does not contain old copy: October 7 and closes December 3', () => {
    expect(src).not.toContain('Application window opens October 7 and closes December 3')
  })

  it('does not contain old copy: High school offers are released March 5', () => {
    expect(src).not.toContain('High school offers are released March 5')
  })

  it('does not contain old copy: open houses in October and November', () => {
    expect(src).not.toContain('Attend open houses and school tours in October and November')
  })
})

// ── Issue #64: Summary cards + clean school list ──────────────────────────────

describe('Requirements page simplification (issue #64)', () => {
  it('has SCREENED_SUMMARY constant with grade average text', () => {
    expect(src).toContain("Admission is based on your child's 7th grade course grade average across 4 core subjects")
  })

  it('has SCREENED_SUMMARY mentioning grade groups', () => {
    expect(src).toContain('grade groups')
  })

  it('has LOTTERY_EDOPT_SUMMARY constant', () => {
    expect(src).toContain('These schools select students by lottery. No academic requirements.')
  })

  it('has LOTTERY_EDOPT_SUMMARY mentioning reading level bands', () => {
    expect(src).toContain('reading level bands')
  })

  it('does not display attendance in screened section description', () => {
    expect(src).not.toContain("grades, attendance record")
  })

  it('does not contain renderScreenedRequirements function', () => {
    expect(src).not.toContain('renderScreenedRequirements')
  })

  it('does not render prgdesc for school list items', () => {
    expect(src).not.toContain('school.prgdesc')
  })

  it('does not render screened program boxes (renderScreenedRequirements removed)', () => {
    expect(src).not.toContain('renderScreenedRequirements')
  })

  it('imports getExtrasCallout from requirements-utils', () => {
    expect(src).toContain("import { getExtrasCallout } from '@/lib/requirements-utils'")
  })

  it('uses getExtrasCallout for screened school extras callout', () => {
    expect(src).toContain('getExtrasCallout(school.requirements)')
  })

  it('renders screened summary card with orange styling', () => {
    expect(src).toContain('bg-orange-50')
    expect(src).toContain('SCREENED_SUMMARY')
  })

  it('renders lottery/edopt summary card', () => {
    expect(src).toContain('LOTTERY_EDOPT_SUMMARY')
  })

  it('screened description no longer says attendance record', () => {
    expect(src).not.toContain("screened: 'Screened programs review your grades, attendance")
  })
})

// ── Issue #65: Copy, layout, and formatting updates ───────────────────────────

describe('All Schools Checklist rename (issue #65)', () => {
  it('section heading is All Schools Checklist', () => {
    expect(src).toContain('All Schools Checklist')
  })

  it('does not use old "All Applicants" heading text', () => {
    // The h2 should say All Schools Checklist, not All Applicants
    const h2Match = src.match(/All Schools Checklist/)
    expect(h2Match).not.toBeNull()
    // The old heading text must not appear as rendered text
    expect(src).not.toContain('>All Applicants<')
  })
})

describe('Screened summary 4 core subjects (issue #65)', () => {
  it('SCREENED_SUMMARY mentions 4 core subjects', () => {
    expect(src).toContain('4 core subjects: ELA, math, science, and history/social studies')
  })

  it('SCREENED_SUMMARY uses (1-5) notation', () => {
    expect(src).toContain('grade groups (1-5)')
  })
})

describe('Lottery checkbox items removed (issue #65)', () => {
  it('lottery section has empty items array', () => {
    expect(src).toContain('lottery: [],')
  })

  it('does not contain old lottery checklist text', () => {
    expect(src).not.toContain('No additional materials required.')
    expect(src).not.toContain('All applicants who rank the school have an equal chance.')
  })
})

describe('SHSAT section order and Prep Checklist (issue #65)', () => {
  it('has Prep Checklist title in source', () => {
    expect(src).toContain('Prep Checklist')
  })

  it('SHSAT description mentions 2024 data', () => {
    expect(src).toContain('based on 2024 data')
  })

  it('SHSAT register item says late October', () => {
    expect(src).toContain('Register for the SHSAT by late October')
  })

  it('SHSAT practice item says 3-5 tests', () => {
    expect(src).toContain('3-5 practice tests')
  })

  it('Prep Checklist renders for isSHSAT before schools list', () => {
    const sectionLoopStart = src.indexOf('sections.map((section)')
    const prepChecklistIdx = src.indexOf('isSHSAT && items.length > 0', sectionLoopStart)
    const schoolsListIdx = src.indexOf('Your matched schools in this category', sectionLoopStart)
    expect(prepChecklistIdx).toBeGreaterThan(sectionLoopStart)
    expect(prepChecklistIdx).toBeLessThan(schoolsListIdx)
  })

  it('non-SHSAT checklist renders after schools with !isSHSAT guard', () => {
    expect(src).toContain('!isSHSAT && renderItems(items)')
  })
})

describe('Audition program label inference (issue #65)', () => {
  it('defines inferAuditionLabel function', () => {
    expect(src).toContain('function inferAuditionLabel(')
  })

  it('uses inferAuditionLabel in program label rendering', () => {
    expect(src).toContain('inferAuditionLabel(info)')
  })

  it('does not use static Program N label for multi-program schools without fallback', () => {
    // inferAuditionLabel result is used first; Program {i+1} is only the fallback
    expect(src).toContain("inferAuditionLabel(info) || `Program ${i + 1}`")
  })
})

describe('Numbered school list format (issue #65)', () => {
  it('school list uses ol element', () => {
    expect(src).toContain('<ol className=')
  })

  it('school list uses idx + 1 numbering', () => {
    expect(src).toContain('{idx + 1}.')
  })

  it('school list no longer uses plain ul without numbers', () => {
    // The school name list should use ol, not the old plain ul
    const schoolListStart = src.indexOf('Your matched schools in this category')
    const olIdx = src.indexOf('<ol', schoolListStart)
    expect(olIdx).toBeGreaterThan(schoolListStart)
  })
})
