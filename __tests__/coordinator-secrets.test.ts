import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

// 2026-09-18: the agent read /home/agent/app/.env.local (every production key)
// and wrote placeholder Clerk keys into it, invisible to any PR. The app
// checkout now holds no secrets, and any change to a secrets file during an
// agent attempt fails the run.
const src = fs.readFileSync(path.join(__dirname, '../agent-coordinator.sh'), 'utf8')

function extract(name: string): string {
  const start = src.indexOf(`${name}() {`)
  const end = src.indexOf('\n}\n', start)
  return src.slice(start, end + 3)
}

describe('coordinator secrets handling', () => {
  it('no longer reads the Anthropic key from the app checkout', () => {
    expect(src).not.toMatch(/grep ANTHROPIC_API_KEY \/home\/agent\/app\/\.env\.local/)
    expect(src).toContain('source /home/agent/.env.agents')
  })

  it('fingerprints secrets files before the agent runs and fails the run if they change', () => {
    const before = src.indexOf('ENV_FP_BEFORE=$(env_fingerprint)')
    const call = src.indexOf('"Bash,Read,Write,Edit,Glob,Grep,WebFetch,WebSearch"', before)
    const check = src.indexOf('"$(env_fingerprint)" != "$ENV_FP_BEFORE"', call)
    expect(before).toBeGreaterThan(-1)
    expect(call).toBeGreaterThan(before)
    expect(check).toBeGreaterThan(call)
    expect(src).toContain('SECRETS FILE CHANGED')
  })

  it('env_fingerprint changes when an .env file appears or changes, and ignores *.example files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'envfp-'))
    const script = `APP_DIR="${dir}"\n${extract('env_fingerprint')}\nenv_fingerprint\n`
    const fp = () => execFileSync('bash', ['-c', script]).toString().trim()

    fs.writeFileSync(path.join(dir, '.env.local.example'), 'A=1\n')
    const base = fp()
    fs.writeFileSync(path.join(dir, '.env.local.example'), 'A=2\n')
    expect(fp()).toBe(base)

    fs.writeFileSync(path.join(dir, '.env.local'), 'SECRET=x\n')
    const withFile = fp()
    expect(withFile).not.toBe(base)

    fs.writeFileSync(path.join(dir, '.env.local'), 'SECRET=y\n')
    expect(fp()).not.toBe(withFile)

    fs.rmSync(dir, { recursive: true, force: true })
  })
})
