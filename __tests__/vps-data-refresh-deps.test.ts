import * as fs from 'fs'
import * as path from 'path'

// Ubuntu 24.04 (the VPS) rejects `pip install --user` under PEP 668, which
// aborted every data refresh before it scraped anything (2026-09-18).
describe('scripts/vps-data-refresh.sh dependency step', () => {
  const src = fs.readFileSync(path.join(__dirname, '../scripts/vps-data-refresh.sh'), 'utf-8')
  const fn = src.slice(src.indexOf('install_dependencies() {'), src.indexOf('\n}\n', src.indexOf('install_dependencies() {')))

  it('only runs pip when the Python imports are missing', () => {
    expect(fn).toContain("if ! python3 -c 'import bs4, requests'")
    expect(fn.indexOf('if ! python3')).toBeLessThan(fn.indexOf('python3 -m pip install'))
  })

  it('still installs node dependencies', () => {
    expect(fn).toContain('npm ci')
  })
})
