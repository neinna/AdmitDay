import * as fs from 'fs'
import * as path from 'path'

// ── Build cache ──────────────────────────────────────────────────────────────
// Production builds keep Next's default filesystem webpack cache (.next/cache).
// It used to be forced in-memory because the VPS verification host had <600MB
// free disk; it now has ~9GB, and a warm build takes ~74s there versus ~160s
// cold. The coordinator keeps .next/cache between builds and drops it only
// when free disk falls below BUILD_CACHE_MIN_FREE_MB.

describe('next.config.js production build cache', () => {
  const source = fs.readFileSync(path.join(__dirname, '../next.config.js'), 'utf8')

  it('loads as a config module', () => {
    expect(require('../next.config.js')).toBeDefined()
  })

  it('does not force an in-memory webpack cache', () => {
    expect(source).not.toContain("type: 'memory'")
  })
})

describe('coordinator verification build cache', () => {
  const coordinator = fs.readFileSync(
    path.join(__dirname, '../agent-coordinator.sh'),
    'utf8'
  )
  const verify = coordinator.slice(
    coordinator.indexOf('verify_app() {'),
    coordinator.indexOf('review_change() {')
  )

  it('wipes .next except the cache before building', () => {
    expect(verify).toContain('! -name cache -exec rm -rf {} +')
    expect(verify).not.toContain('rm -rf "$APP_DIR/.next"\n')
  })

  it('drops the cache only when free disk is below the threshold', () => {
    expect(coordinator).toContain('BUILD_CACHE_MIN_FREE_MB="${BUILD_CACHE_MIN_FREE_MB:-2048}"')
    expect(verify).toContain('-lt "$BUILD_CACHE_MIN_FREE_MB"')
  })

  it('no longer prunes the cache while the build runs', () => {
    expect(verify).not.toContain('PRUNE_PID')
  })
})
