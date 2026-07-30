import fs from 'fs'
import path from 'path'

// ── Issue #118: one documented, re-runnable refresh command ────────────────
// Static checks on the script/docs (no network calls, does not execute the
// scrape) -- pairs with __tests__/validate-school-data.test.ts, which covers
// the validation logic itself with fixtures.

const scriptSource = fs.readFileSync(path.join(__dirname, '../scripts/refresh-data.ts'), 'utf-8')

describe('scripts/refresh-data.ts', () => {
  it('runs the scrape step (build_school_data.py)', () => {
    expect(scriptSource).toContain('build_school_data.py')
  })

  it('validates before writing data/schools.json', () => {
    const validateIdx = scriptSource.indexOf('validateSchoolData(')
    const writeIdx = scriptSource.indexOf('writeFileSync(DATA_SCHOOLS_PATH')
    expect(validateIdx).toBeGreaterThan(-1)
    expect(writeIdx).toBeGreaterThan(-1)
    expect(validateIdx).toBeLessThan(writeIdx)
  })

  it('exits non-zero and skips the write when validation fails', () => {
    const failIdx = scriptSource.indexOf('if (!result.valid)')
    const exitIdx = scriptSource.indexOf('process.exit(1)', failIdx)
    const writeIdx = scriptSource.indexOf('writeFileSync(DATA_SCHOOLS_PATH')
    expect(failIdx).toBeGreaterThan(-1)
    expect(exitIdx).toBeGreaterThan(failIdx)
    expect(exitIdx).toBeLessThan(writeIdx)
  })

  it('runs seed before embed, both after the write', () => {
    // lastIndexOf: both filenames are also named in the file's header comment,
    // so anchor on their occurrence inside the actual run(...) calls below it.
    const writeIdx = scriptSource.indexOf('writeFileSync(DATA_SCHOOLS_PATH')
    const seedIdx = scriptSource.lastIndexOf('scripts/seed-schools.ts')
    const embedIdx = scriptSource.lastIndexOf('scripts/embed-schools.ts')
    expect(writeIdx).toBeLessThan(seedIdx)
    expect(seedIdx).toBeLessThan(embedIdx)
  })

  it('prints a before/after/added/removed/failed-validation summary', () => {
    expect(scriptSource).toContain('Schools before:')
    expect(scriptSource).toContain('Schools after:')
    expect(scriptSource).toContain('Added:')
    expect(scriptSource).toContain('Removed:')
    expect(scriptSource).toContain('Failed validation:')
  })

  it('imports the shared validation module rather than duplicating logic', () => {
    expect(scriptSource).toContain("from '../lib/validate-school-data'")
  })
})

describe('package.json refresh:data command', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8'))

  it('has a single "refresh:data" script entry point', () => {
    expect(pkg.scripts).toHaveProperty('refresh:data')
  })

  it('runs scripts/refresh-data.ts', () => {
    expect(pkg.scripts['refresh:data']).toContain('scripts/refresh-data.ts')
  })
})

describe('README documents the refresh sequence', () => {
  const readme = fs.readFileSync(path.join(__dirname, '../README.md'), 'utf-8')

  it('documents the one-command refresh', () => {
    expect(readme).toContain('refresh:data')
  })

  it('documents the scrape step', () => {
    expect(readme).toContain('build_school_data.py')
  })

  it('documents the seed step', () => {
    expect(readme).toContain('scripts/seed-schools.ts')
  })

  it('documents the re-embed step', () => {
    expect(readme).toContain('scripts/embed-schools.ts')
  })

  it('documents validation failing loudly rather than overwriting good data', () => {
    expect(readme.toLowerCase()).toContain('validat')
  })
})
