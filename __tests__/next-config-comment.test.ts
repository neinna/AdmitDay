import * as fs from 'fs'
import * as path from 'path'

// ── Issue #76: agent pipeline smoke test comment in next.config.js ──────────

describe('next.config.js pipeline comment', () => {
  const configSource = fs.readFileSync(path.join(__dirname, '../next.config.js'), 'utf-8')

  it('ends with the AdmitDay agent pipeline comment as the last line', () => {
    const lines = configSource.trimEnd().split('\n')
    expect(lines[lines.length - 1]).toBe('// deployed via AdmitDay agent pipeline')
  })
})
