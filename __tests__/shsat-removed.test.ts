import * as fs from 'fs'
import * as path from 'path'

// Guards against re-introducing the private family SHSAT practice tool
// (removed in issue #97). The SHSAT *admissions track* on /list and
// /requirements (specialized high school handling, SHSAT_CUTOFFS) is unrelated
// and must keep working — this only checks the practice-tool pieces are gone.

describe('private SHSAT practice tool stays removed', () => {
  const root = path.join(__dirname, '..')

  it('app/shsat/ does not exist', () => {
    expect(fs.existsSync(path.join(root, 'app/shsat'))).toBe(false)
  })

  it('app/api/shsat/ does not exist', () => {
    expect(fs.existsSync(path.join(root, 'app/api/shsat'))).toBe(false)
  })

  it('lib/shsat-db.ts does not exist', () => {
    expect(fs.existsSync(path.join(root, 'lib/shsat-db.ts'))).toBe(false)
  })

  it('components/shsat/ does not exist', () => {
    expect(fs.existsSync(path.join(root, 'components/shsat'))).toBe(false)
  })

  it('middleware.ts does not exist (its only job was gating /shsat)', () => {
    expect(fs.existsSync(path.join(root, 'middleware.ts'))).toBe(false)
  })

  it('no source file references the removed practice-tool internals', () => {
    const searchDirs = ['app', 'lib', 'components'].map((d) => path.join(root, d))
    const offenders: string[] = []

    function walk(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(full)
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
          const src = fs.readFileSync(full, 'utf-8')
          if (/shsat-db|SHSAT_PASSWORD|shsat_results|shsat_pins/.test(src)) {
            offenders.push(full)
          }
        }
      }
    }

    searchDirs.forEach(walk)
    expect(offenders).toEqual([])
  })
})
