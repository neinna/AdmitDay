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

  it('has the register-by-October-31-2026 checklist item', () => {
    expect(src).toContain('Register for the SHSAT by October 31, 2026.')
  })

  it('has the adaptive exam item mentioning SRT', () => {
    expect(src).toContain('Student Readiness Tool (SRT)')
  })

  it('has the practice-tests item', () => {
    expect(src).toContain('Take 2-3 practice tests before October')
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
    const checklistIdx = src.indexOf('renderItems(items)', sectionLoopStart)
    expect(descriptionIdx).toBeGreaterThan(sectionLoopStart)
    expect(schoolsIdx).toBeGreaterThan(descriptionIdx)
    expect(checklistIdx).toBeGreaterThan(schoolsIdx)
  })

  it('has descriptions for all six admissions types', () => {
    expect(src).toContain("shsat: 'SHSAT score is the sole admissions criterion")
    expect(src).toContain("audition: 'Requirements vary by school and by discipline")
    expect(src).toContain("screened: 'Screened programs review your grades")
    expect(src).toContain("screened_assessment: 'These programs require you to complete")
    expect(src).toContain("edopt: 'Ed Opt programs are designed to reflect")
    expect(src).toContain("lottery: 'Admission is by lottery.")
  })
})
