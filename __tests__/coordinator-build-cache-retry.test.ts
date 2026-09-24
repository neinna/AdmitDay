import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'

// ── agent-coordinator.sh: drop .next/cache and retry once on a
// module-resolution build failure (#431) ────────────────────────────────────
// verify_app (agent-coordinator.sh) wipes everything in .next EXCEPT
// .next/cache, then runs npm test and npm run build. The preserved cache and
// the wiped output are two halves of one consistent state: splitting them
// lets webpack restore a module graph describing files that no longer exist.
//
// Observed on #405, 2026-09-23: `Cannot find module './4894.js'` thrown from
// .next/server/webpack-runtime.js, while the chunk existed on disk. Two
// capped attempts and $3.01 were spent on a diff that was correct, and a
// human had to manually `rm -rf .next/cache` (698MB) to unblock it.
//
// These tests pin: a build failure whose output matches the module-resolution
// signature (`Cannot find module` + `webpack-runtime`/`.next/server`) drops
// the cache and retries the build exactly once; an ordinary build failure
// (e.g. a type error) never retries.

const coordinatorSource = fs.readFileSync(
  path.join(__dirname, '../agent-coordinator.sh'),
  'utf-8',
)

function extractFunction(name: string): string {
  const marker = `${name}() {`
  const start = coordinatorSource.indexOf(marker)
  expect(start).toBeGreaterThan(-1)
  let depth = 0
  let i = coordinatorSource.indexOf('{', start)
  for (; i < coordinatorSource.length; i++) {
    const ch = coordinatorSource[i]
    if (ch === '{') depth++
    if (ch === '}') {
      depth--
      if (depth === 0) break
    }
  }
  return coordinatorSource.slice(start, i + 1)
}

describe('verify_app: retries a module-resolution build failure once after dropping .next/cache', () => {
  let workDir: string
  let appDir: string
  let binDir: string
  let outFile: string

  const readCallCount = () => {
    const p = path.join(workDir, 'build-calls')
    return fs.existsSync(p) ? Number(fs.readFileSync(p, 'utf-8').trim()) : 0
  }

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coord-verify-app-'))
    appDir = path.join(workDir, 'app')
    binDir = path.join(workDir, 'bin')
    outFile = path.join(workDir, 'verify.out')
    fs.mkdirSync(appDir)
    fs.mkdirSync(binDir)
    fs.mkdirSync(path.join(appDir, '.next', 'cache'), { recursive: true })
    fs.writeFileSync(path.join(appDir, '.next', 'cache', 'webpack-state'), 'warm cache\n')
  })

  afterEach(() => fs.rmSync(workDir, { recursive: true, force: true }))

  // Writes a fake `npm` onto PATH: `npm test` always succeeds, `npm run
  // build` consults $workDir/build-behavior (a newline-separated script of
  // "pass" / "fail:<message>" entries, one per invocation) so each test can
  // script exactly what successive build attempts print and return.
  function writeFakeNpm(buildBehaviors: string[]) {
    fs.writeFileSync(
      path.join(workDir, 'build-behavior'),
      buildBehaviors.join('\n') + '\n',
    )
    fs.writeFileSync(path.join(workDir, 'build-calls'), '0\n')
    const npmScript = `#!/bin/bash
if [ "$1" = "test" ]; then
  echo "tests passed"
  exit 0
fi
if [ "$1" = "run" ] && [ "$2" = "build" ]; then
  N=$(cat "${workDir}/build-calls")
  N=$((N + 1))
  echo "$N" > "${workDir}/build-calls"
  LINE=$(sed -n "\${N}p" "${workDir}/build-behavior")
  if [ "$LINE" = "pass" ]; then
    echo "build succeeded"
    exit 0
  fi
  echo "\${LINE#fail:}"
  exit 1
fi
exit 0
`
    const npmPath = path.join(binDir, 'npm')
    fs.writeFileSync(npmPath, npmScript)
    fs.chmodSync(npmPath, 0o755)
  }

  function runVerifyApp(): { rc: number; out: string; log: string; cacheExists: boolean; buildCalls: number } {
    const fnBody = extractFunction('verify_app')
    const logFile = path.join(workDir, 'coordinator.log')
    fs.writeFileSync(logFile, '')
    const script = `
set +e
APP_DIR="${appDir}"
BUILD_CACHE_MIN_FREE_MB=0
LOG_FILE="${logFile}"
log() { echo "[ts] $1" | tee -a "$LOG_FILE" >/dev/null; }
lf_now_ns() { echo 0; }
lf_record() { :; }
${fnBody}
verify_app "${outFile}"
echo "RC=$?"
`
    const out = execFileSync('bash', ['-c', script], {
      cwd: appDir,
      encoding: 'utf-8',
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
    })
    const rc = Number(/RC=(\d+)/.exec(out)?.[1])
    return {
      rc,
      out: fs.readFileSync(outFile, 'utf-8'),
      log: fs.readFileSync(logFile, 'utf-8'),
      cacheExists: fs.existsSync(path.join(appDir, '.next', 'cache', 'webpack-state')),
      buildCalls: readCallCount(),
    }
  }

  it('drops the cache and retries exactly once on the observed #405 signature, then succeeds', () => {
    writeFakeNpm([
      "fail:Cannot find module './4894.js'\\n    at .next/server/webpack-runtime.js:1:1",
      'pass',
    ])

    const result = runVerifyApp()

    expect(result.buildCalls).toBe(2)
    expect(result.cacheExists).toBe(false)
    expect(result.rc).toBe(0)
    expect(result.log).toContain('dropping .next/cache and rebuilding once')
  })

  it('does not retry an ordinary type-error build failure', () => {
    writeFakeNpm([
      "fail:Type error: Property 'foo' does not exist on type 'Bar'.",
      'pass',
    ])

    const result = runVerifyApp()

    // Only the first (failing) build attempt should have run.
    expect(result.buildCalls).toBe(1)
    expect(result.cacheExists).toBe(true)
    expect(result.rc).toBe(1)
    expect(result.log).not.toContain('dropping .next/cache')
  })

  it('retries at most once: a build that fails the module-resolution way twice still ends failed', () => {
    writeFakeNpm([
      "fail:Cannot find module './4894.js'\\n    at .next/server/webpack-runtime.js:1:1",
      "fail:Cannot find module './4894.js'\\n    at .next/server/webpack-runtime.js:1:1",
      'pass',
    ])

    const result = runVerifyApp()

    // Exactly two build invocations total: the original attempt plus one retry.
    expect(result.buildCalls).toBe(2)
    expect(result.rc).toBe(1)
    expect(result.cacheExists).toBe(false)
  })
})
