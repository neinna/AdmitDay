import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawnSync } from 'child_process'

const scriptSource = fs.readFileSync(path.join(__dirname, '../scripts/vps-data-refresh.sh'), 'utf-8')

function extractFunction(name: string): string {
  const start = scriptSource.indexOf(`${name}() {`)
  expect(start).toBeGreaterThan(-1)
  const end = scriptSource.indexOf('\n}\n', start)
  return scriptSource.slice(start, end + 2)
}

function renderBody(previous: unknown, current: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refresh-open-house-'))
  fs.writeFileSync(path.join(dir, 'previous.json'), JSON.stringify(previous))
  fs.writeFileSync(path.join(dir, 'schools.json'), JSON.stringify(current))
  const script = `set -euo pipefail
${extractFunction('build_refresh_pr_body')}
build_refresh_pr_body previous.json`
  const result = spawnSync('bash', ['-c', script], { cwd: dir, encoding: 'utf-8' })
  expect(result.status).toBe(0)
  return result.stdout
}

describe('build_refresh_pr_body open-house count', () => {
  it('reports the open-house count before and after, right after the program count', () => {
    const previous = [
      { dbn: 'A', open_house: { text: 'Oct 10 tour' } },
      { dbn: 'B' },
      { dbn: 'C', open_house: null },
    ]
    const current = [
      { dbn: 'A' },
      { dbn: 'B', open_house: {} },
      { dbn: 'C', open_house: { text: '  ' } },
    ]
    const body = renderBody(previous, current)
    expect(body).toContain('- Schools with open-house text: 1 -> 0')
    const lines = body.split('\n')
    const i = lines.findIndex((l) => l.startsWith('- Program count:'))
    expect(lines[i + 1]).toBe('- Schools with open-house text: 1 -> 0')
  })

  it('treats malformed open_house as 0 without throwing', () => {
    const previous = [{ dbn: 'A', open_house: 'text' }, { dbn: 'B', open_house: { text: 5 } }]
    const body = renderBody(previous, [{ dbn: 'A', open_house: { text: 'x' } }])
    expect(body).toContain('- Schools with open-house text: 0 -> 1')
  })
})
