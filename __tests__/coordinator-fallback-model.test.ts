import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'

// ── agent-coordinator.sh: pass --fallback-model (issue #430) ────────────────
// `run_claude` only ever built --model from its MODEL argument. The claude CLI
// also accepts --fallback-model, which retries automatically when the primary
// model is unavailable (overload, a capacity event, one model degraded) rather
// than halting the whole queue. This does NOT help an account-level spend cap
// (every model is behind the same cap), only model-specific unavailability.
//
// These tests pin: (1) a non-empty fallback setting puts
// `--fallback-model <value>` in the argv passed to the claude CLI, (2) an
// empty setting omits the flag entirely, so behavior is unchanged when unset.

const coordinatorPath = path.join(__dirname, '../agent-coordinator.sh')
const coordinatorSource = fs.readFileSync(coordinatorPath, 'utf-8')

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

describe('run_claude (functional): --fallback-model argument', () => {
  let workDir: string
  let binDir: string
  let argsFile: string
  let logFile: string
  let outFile: string

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coord-fallback-'))
    binDir = path.join(workDir, 'bin')
    fs.mkdirSync(binDir)
    argsFile = path.join(workDir, 'claude-args')
    logFile = path.join(workDir, 'coordinator.log')
    outFile = path.join(workDir, 'claude-out.json')
    fs.writeFileSync(logFile, '')

    // Fake `claude` CLI: records the argv it was called with, then produces a
    // minimal successful JSON result so run_claude's own success check passes.
    const claudeStub = `#!/bin/sh
printf '%s\\n' "$@" > "${argsFile}"
echo '{"is_error": false, "result": "ok", "model": "claude-sonnet-5"}'
`
    fs.writeFileSync(path.join(binDir, 'claude'), claudeStub, { mode: 0o755 })
  })

  afterEach(() => fs.rmSync(workDir, { recursive: true, force: true }))

  function callRunClaude(fallback: string): string {
    const fnBody = extractFunction('run_claude')
    const script = `
CLAUDE_TIMEOUT=5
LOG_FILE="${logFile}"
ANTHROPIC_API_KEY="test"
PROMPT="hello"
${fnBody}
run_claude "${outFile}" "" "Read" "sonnet" "" "${fallback}"
`
    execFileSync('bash', ['-c', script], {
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
      encoding: 'utf-8',
    })
    return fs.readFileSync(argsFile, 'utf-8')
  }

  it('puts --fallback-model <value> in the argument list when the setting is non-empty', () => {
    const args = callRunClaude('haiku')
    expect(args).toContain('--fallback-model\nhaiku')
  })

  it('omits --fallback-model entirely when the setting is empty', () => {
    const args = callRunClaude('')
    expect(args).not.toContain('--fallback-model')
  })
})

describe('run_claude signature: sixth positional parameter is the fallback model', () => {
  it('defaults FALLBACK_MODEL to empty and only appends the flag when set', () => {
    const body = extractFunction('run_claude')
    expect(body).toContain('local FALLBACK_MODEL="${6:-}"')
    expect(body).toContain('if [ -n "$FALLBACK_MODEL" ]; then')
    expect(body).toContain('--fallback-model "$FALLBACK_MODEL"')
  })
})

describe('agent-coordinator.sh: fallback model settings', () => {
  // `-` not `:-`. The colon form substitutes the default when the variable is
  // unset OR empty, so an operator setting the variable to empty to turn the
  // fallback off would silently get haiku anyway — the documented off switch
  // would do nothing. Unset must still default to haiku.
  it('defaults both fallbacks to haiku when unset, and respects an explicit empty value', () => {
    expect(coordinatorSource).toMatch(
      /CLAUDE_IMPLEMENT_FALLBACK_MODEL="\$\{CLAUDE_IMPLEMENT_FALLBACK_MODEL-haiku\}"/,
    )
    expect(coordinatorSource).toMatch(
      /CLAUDE_REVIEW_FALLBACK_MODEL="\$\{CLAUDE_REVIEW_FALLBACK_MODEL-haiku\}"/,
    )
    expect(coordinatorSource).not.toMatch(/FALLBACK_MODEL="\$\{[A-Z_]+:-haiku\}"/)
  })

  it.each([
    ['unset', '', 'haiku'],
    ['empty', 'CLAUDE_IMPLEMENT_FALLBACK_MODEL=', ''],
    ['set', 'CLAUDE_IMPLEMENT_FALLBACK_MODEL=sonnet', 'sonnet'],
  ])('resolves the implement fallback to %s -> %s', (_label, assignment, expected) => {
    const line = coordinatorSource
      .split('\n')
      .find((l) => l.startsWith('CLAUDE_IMPLEMENT_FALLBACK_MODEL='))
    expect(line).toBeDefined()
    const out = execFileSync(
      '/bin/sh',
      ['-c', `${assignment ? assignment + '; ' : ''}${line}; printf '%s' "$CLAUDE_IMPLEMENT_FALLBACK_MODEL"`],
      { encoding: 'utf-8' },
    )
    expect(out).toBe(expected)
  })

  it('passes the fallback settings at the implement and review call sites', () => {
    expect(coordinatorSource).toContain(
      '"Bash,Read,Write,Edit,Glob,Grep,WebFetch,WebSearch" "$CLAUDE_IMPLEMENT_MODEL" "$CLAUDE_IMPLEMENT_MAX_USD" "$CLAUDE_IMPLEMENT_FALLBACK_MODEL"',
    )
    expect(coordinatorSource).toContain(
      'run_claude "$REVIEW_OUT" "" "Read,Glob,Grep" "$CLAUDE_REVIEW_MODEL" "$CLAUDE_REVIEW_MAX_USD" "$CLAUDE_REVIEW_FALLBACK_MODEL"',
    )
  })

  it('logs when a run used the fallback model', () => {
    expect(coordinatorSource).toMatch(
      /ran on fallback model \$\{CLAUDE_IMPLEMENT_FALLBACK_MODEL\}/,
    )
    expect(coordinatorSource).toMatch(
      /ran on fallback model \$\{CLAUDE_REVIEW_FALLBACK_MODEL\}/,
    )
  })
})

// ── claude_ran_on_fallback: don't mistake the CLI's own internal small-model
// calls (e.g. summarizing a WebFetch result, often Haiku) for the run having
// fallen back (issue #430 review) ───────────────────────────────────────────
describe('claude_ran_on_fallback (functional): ignores unrelated modelUsage entries', () => {
  let workDir: string
  let outFile: string

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coord-fallback-detect-'))
    outFile = path.join(workDir, 'claude-out.json')
  })

  afterEach(() => fs.rmSync(workDir, { recursive: true, force: true }))

  function ranOnFallback(modelUsage: Record<string, unknown>, primary: string, fallback: string): boolean {
    fs.writeFileSync(outFile, JSON.stringify({ modelUsage }))
    const fnBody = extractFunction('claude_ran_on_fallback')
    const script = `${fnBody}\nclaude_ran_on_fallback "${outFile}" "${primary}" "${fallback}"`
    try {
      execFileSync('bash', ['-c', script], { encoding: 'utf-8' })
      return true
    } catch {
      return false
    }
  }

  it('is true when only the fallback model appears', () => {
    expect(
      ranOnFallback({ 'claude-haiku-4-5-20251001': {} }, 'sonnet', 'haiku'),
    ).toBe(true)
  })

  it('is false when the primary model also appears (e.g. WebFetch used Haiku internally on an otherwise normal run)', () => {
    expect(
      ranOnFallback(
        { 'claude-sonnet-5': {}, 'claude-haiku-4-5-20251001': {} },
        'sonnet',
        'haiku',
      ),
    ).toBe(false)
  })

  it('is false when only the primary model appears', () => {
    expect(
      ranOnFallback({ 'claude-sonnet-5': {} }, 'sonnet', 'haiku'),
    ).toBe(false)
  })
})
