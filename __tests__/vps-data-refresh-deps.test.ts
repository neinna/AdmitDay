import * as fs from 'fs'
import * as path from 'path'

// Ubuntu 24.04 (the VPS) rejects `pip install --user` under PEP 668, which
// aborted every data refresh before it scraped anything (2026-09-18).
describe('scripts/vps-data-refresh.sh dependency step', () => {
  const src = fs.readFileSync(path.join(__dirname, '../scripts/vps-data-refresh.sh'), 'utf-8')
  const fn = src.slice(src.indexOf('install_dependencies() {'), src.indexOf('\n}\n', src.indexOf('install_dependencies() {')))

  it('only runs pip when the Python imports are missing', () => {
    expect(fn).toContain("if ! python3 -c 'import bs4, requests, openpyxl'")
    expect(fn.indexOf('if ! python3')).toBeLessThan(fn.indexOf('python3 -m pip install'))
  })

  // Issue #289: build_school_data.py now reads the Fall 2025 InfoHub HS
  // directory xlsx via scripts/enrich_doe_directory.py, which needs openpyxl.
  it('installs openpyxl alongside the existing scrape dependencies', () => {
    expect(fn).toContain('openpyxl')
  })

  it('still installs node dependencies', () => {
    expect(fn).toContain('npm ci')
  })
})
