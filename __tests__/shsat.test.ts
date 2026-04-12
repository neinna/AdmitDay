import * as fs from 'fs'
import * as path from 'path'
import Database from 'better-sqlite3'
import * as bcrypt from 'bcryptjs'
import * as os from 'os'

// ── Question bank ────────────────────────────────────────────────────────────

describe('shsat-questions.json', () => {
  const questions = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../data/shsat-questions.json'), 'utf-8')
  )

  it('has exactly 15 questions', () => {
    expect(questions.length).toBe(15)
  })

  it('all questions tagged test-1', () => {
    questions.forEach((q: any) => {
      expect(q.test_ids).toContain('test-1')
    })
  })

  it('has 5 easy, 5 medium, 5 hard questions', () => {
    const easy = questions.filter((q: any) => q.difficulty === 'easy')
    const medium = questions.filter((q: any) => q.difficulty === 'medium')
    const hard = questions.filter((q: any) => q.difficulty === 'hard')
    expect(easy.length).toBe(5)
    expect(medium.length).toBe(5)
    expect(hard.length).toBe(5)
  })

  it('has at least 2 grid-in questions', () => {
    const gridin = questions.filter((q: any) => q.type === 'gridin')
    expect(gridin.length).toBeGreaterThanOrEqual(2)
  })

  it('every question has a non-empty explanation', () => {
    questions.forEach((q: any) => {
      expect(typeof q.explanation).toBe('string')
      expect(q.explanation.length).toBeGreaterThan(0)
    })
  })

  it('required topics are covered', () => {
    const topics = new Set(questions.map((q: any) => q.topic))
    const required = [
      'Percents',
      'Stats',
      'Rates',
      'Ratios',
      'Coordinate Plane',
      'Probability',
      'Scientific Notation',
    ]
    required.forEach((t) => {
      expect(topics).toContain(t)
    })
  })

  it('MC questions have exactly 4 options', () => {
    questions
      .filter((q: any) => q.type === 'mc')
      .forEach((q: any) => {
        expect(Array.isArray(q.options)).toBe(true)
        expect(q.options.length).toBe(4)
      })
  })

  it('all question ids are unique', () => {
    const ids = questions.map((q: any) => q.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })
})

// ── shsat-db.ts ──────────────────────────────────────────────────────────────

describe('shsat-db', () => {
  let tmpDb: Database.Database
  let tmpPath: string

  beforeAll(() => {
    tmpPath = path.join(os.tmpdir(), `shsat-test-${Date.now()}.db`)
    tmpDb = new Database(tmpPath)
    tmpDb.exec(`
      CREATE TABLE IF NOT EXISTS shsat_results (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        kid           TEXT NOT NULL,
        test_id       TEXT NOT NULL,
        timestamp     DATETIME DEFAULT CURRENT_TIMESTAMP,
        raw_score     INTEGER NOT NULL,
        total_q       INTEGER NOT NULL,
        scaled_score  INTEGER NOT NULL,
        time_used_s   INTEGER NOT NULL,
        answers_json  TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS shsat_pins (
        kid       TEXT PRIMARY KEY,
        pin_hash  TEXT NOT NULL
      );
    `)
  })

  afterAll(() => {
    tmpDb.close()
    fs.unlinkSync(tmpPath)
  })

  it('can insert and retrieve a result', () => {
    tmpDb
      .prepare(
        `INSERT INTO shsat_results (kid, test_id, raw_score, total_q, scaled_score, time_used_s, answers_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run('alice', 'test-1', 11, 15, 640, 1247, '[]')

    const row: any = tmpDb
      .prepare('SELECT * FROM shsat_results WHERE kid = ?')
      .get('alice')
    expect(row).toBeDefined()
    expect(row.raw_score).toBe(11)
    expect(row.scaled_score).toBe(640)
  })

  it('can insert and verify PIN with bcrypt', async () => {
    const hash = await bcrypt.hash('1234', 10)
    tmpDb.prepare('INSERT INTO shsat_pins (kid, pin_hash) VALUES (?, ?)').run('jake', hash)

    const row: any = tmpDb.prepare('SELECT pin_hash FROM shsat_pins WHERE kid = ?').get('jake')
    expect(row).toBeDefined()

    const match = await bcrypt.compare('1234', row.pin_hash)
    expect(match).toBe(true)

    const noMatch = await bcrypt.compare('9999', row.pin_hash)
    expect(noMatch).toBe(false)
  })

  it('pin is stored as hash, not plaintext', () => {
    const row: any = tmpDb.prepare('SELECT pin_hash FROM shsat_pins WHERE kid = ?').get('jake')
    expect(row.pin_hash).not.toBe('1234')
    expect(row.pin_hash.startsWith('$2')).toBe(true)
  })
})

// ── Scaled score formula ──────────────────────────────────────────────────────

describe('scaled score formula', () => {
  function scaledScore(raw: number, total: number) {
    return 200 + Math.round((raw / total) * 600)
  }

  it('perfect score gives 800', () => {
    expect(scaledScore(15, 15)).toBe(800)
  })

  it('zero score gives 200', () => {
    expect(scaledScore(0, 15)).toBe(200)
  })

  it('11/15 gives 640', () => {
    expect(scaledScore(11, 15)).toBe(640)
  })
})

// ── Topic stats calculation ────────────────────────────────────────────────────

describe('topic stats', () => {
  function computeTopicStats(answers: any[]) {
    const map: Record<string, { correct: number; total: number }> = {}
    for (const a of answers) {
      if (!map[a.topic]) map[a.topic] = { correct: 0, total: 0 }
      map[a.topic].total++
      if (a.is_correct) map[a.topic].correct++
    }
    return Object.entries(map).map(([topic, stats]) => ({
      topic,
      correct: stats.correct,
      total: stats.total,
      pct: stats.total > 0 ? stats.correct / stats.total : 0,
    }))
  }

  const answers = [
    { topic: 'Percents', is_correct: true },
    { topic: 'Percents', is_correct: false },
    { topic: 'Percents', is_correct: false },
    { topic: 'Probability', is_correct: true },
    { topic: 'Probability', is_correct: true },
  ]

  it('calculates per-topic scores correctly', () => {
    const stats = computeTopicStats(answers)
    const percents = stats.find((s) => s.topic === 'Percents')!
    expect(percents.correct).toBe(1)
    expect(percents.total).toBe(3)
    expect(percents.pct).toBeCloseTo(1 / 3)
  })

  it('identifies red topics (pct < 0.5)', () => {
    const stats = computeTopicStats(answers)
    const red = stats.filter((s) => s.pct < 0.5)
    expect(red.map((s) => s.topic)).toContain('Percents')
    expect(red.map((s) => s.topic)).not.toContain('Probability')
  })

  it('thumb for 100% is green (>= 0.8)', () => {
    function thumbIcon(pct: number) {
      if (pct >= 0.8) return '🟢'
      if (pct >= 0.5) return '🟡'
      return '🔴'
    }
    expect(thumbIcon(1.0)).toBe('🟢')
    expect(thumbIcon(0.8)).toBe('🟢')
    expect(thumbIcon(0.5)).toBe('🟡')
    expect(thumbIcon(0.49)).toBe('🔴')
    expect(thumbIcon(0)).toBe('🔴')
  })
})

// ── PIN gate pages exist ──────────────────────────────────────────────────────

describe('SHSAT pages exist', () => {
  const pages = [
    '../app/shsat/page.tsx',
    '../app/shsat/[kid]/[testId]/page.tsx',
    '../app/shsat/[kid]/results/page.tsx',
    '../app/shsat/[kid]/results/[testId]/page.tsx',
  ]

  pages.forEach((p) => {
    it(`${p} exists`, () => {
      const full = path.join(__dirname, p)
      expect(fs.existsSync(full)).toBe(true)
    })
  })

  it('PinGate component exists', () => {
    const full = path.join(__dirname, '../components/shsat/PinGate.tsx')
    expect(fs.existsSync(full)).toBe(true)
  })
})

// ── API routes exist ───────────────────────────────────────────────────────────

describe('SHSAT API routes exist', () => {
  const routes = [
    '../app/api/shsat/results/route.ts',
    '../app/api/shsat/pin/route.ts',
    '../app/api/shsat/results/[kid]/route.ts',
    '../app/api/shsat/results/[kid]/[testId]/route.ts',
  ]

  routes.forEach((r) => {
    it(`${r} exists`, () => {
      const full = path.join(__dirname, r)
      expect(fs.existsSync(full)).toBe(true)
    })
  })
})

// ── SHSAT table of contents page content ─────────────────────────────────────

describe('SHSAT table of contents page content', () => {
  const pagePath = path.join(__dirname, '../app/shsat/page.tsx')
  let src: string

  beforeAll(() => {
    src = fs.readFileSync(pagePath, 'utf-8')
  })

  it('has correct header text', () => {
    expect(src).toContain('SHSAT Micro Tests')
  })

  it('defines Alice with 🌸 emoji', () => {
    expect(src).toContain('alice')
    expect(src).toContain('Alice')
    expect(src).toContain('🌸')
  })

  it('defines Jake with ⚡ emoji', () => {
    expect(src).toContain('jake')
    expect(src).toContain('Jake')
    expect(src).toContain('⚡')
  })

  it('links to results history pages', () => {
    // page uses template literals like `/shsat/${kid.id}/results`
    expect(src).toContain('/results')
    expect(src).toMatch(/shsat.*results|results.*shsat/)
  })

  it('shows Math Mini Test #1 metadata', () => {
    expect(src).toContain('Weekly Micro Test #1')
    expect(src).toContain('15')
    expect(src).toContain('30')
  })

  it('links to test-1 start for each kid via template literal', () => {
    // page uses template literals like `/shsat/${kid.id}/${test.id}`
    expect(src).toContain('test-1')
    expect(src).toMatch(/shsat.*kid.*test|kid.*testId/)
  })

  it('uses dark background class', () => {
    expect(src).toMatch(/bg-gray-9[0-9][0-9]/)
  })
})

// ── Parent results page and API ───────────────────────────────────────────────

describe('Parent results page exists', () => {
  it('/app/shsat/parentsresults/page.tsx exists', () => {
    const full = path.join(__dirname, '../app/shsat/parentsresults/page.tsx')
    expect(fs.existsSync(full)).toBe(true)
  })

  it('/app/api/shsat/results/parent/route.ts exists', () => {
    const full = path.join(__dirname, '../app/api/shsat/results/parent/route.ts')
    expect(fs.existsSync(full)).toBe(true)
  })
})

describe('Parent results page content', () => {
  const pagePath = path.join(__dirname, '../app/shsat/parentsresults/page.tsx')
  let src: string

  beforeAll(() => {
    src = fs.readFileSync(pagePath, 'utf-8')
  })

  it('has "All Results" header', () => {
    expect(src).toContain('All Results')
  })

  it('shows Alice with 🌸 emoji', () => {
    expect(src).toContain('Alice')
    expect(src).toContain('🌸')
  })

  it('shows Jake with ⚡ emoji', () => {
    expect(src).toContain('Jake')
    expect(src).toContain('⚡')
  })

  it('fetches from /api/shsat/results/parent without PIN header', () => {
    expect(src).toContain('/api/shsat/results/parent')
    expect(src).not.toContain('x-shsat-pin')
  })

  it('has Date, Kid, Test, Raw, Scaled, Time, Topics column headers', () => {
    expect(src).toContain('Date')
    expect(src).toContain('Kid')
    expect(src).toContain('Test')
    expect(src).toContain('Raw')
    expect(src).toContain('Scaled')
    expect(src).toContain('Time')
    expect(src).toContain('Topics')
  })

  it('uses thumbIcon to emit 🟢🟡🔴', () => {
    expect(src).toContain('🟢')
    expect(src).toContain('🟡')
    expect(src).toContain('🔴')
  })

  it('uses dark background class', () => {
    expect(src).toMatch(/bg-gray-9[0-9][0-9]/)
  })

  it('has expandable row logic', () => {
    expect(src).toContain('expanded')
    expect(src).toContain('setExpanded')
  })
})

describe('Parent results API route content', () => {
  const routePath = path.join(__dirname, '../app/api/shsat/results/parent/route.ts')
  let src: string

  beforeAll(() => {
    src = fs.readFileSync(routePath, 'utf-8')
  })

  it('queries both alice and jake', () => {
    expect(src).toContain('alice')
    expect(src).toContain('jake')
  })

  it('returns answers_json', () => {
    expect(src).toContain('answers_json')
  })

  it('does not require PIN/bcrypt', () => {
    expect(src).not.toContain('bcrypt')
    expect(src).not.toContain('x-shsat-pin')
    expect(src).not.toContain('pin_hash')
  })

  it('orders results by timestamp DESC', () => {
    expect(src).toContain('timestamp DESC')
  })
})

describe('Parent results: topic stats + DB integration', () => {
  let tmpDb: Database.Database
  let tmpPath: string

  beforeAll(() => {
    tmpPath = path.join(os.tmpdir(), `shsat-parent-test-${Date.now()}.db`)
    tmpDb = new Database(tmpPath)
    tmpDb.exec(`
      CREATE TABLE IF NOT EXISTS shsat_results (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        kid           TEXT NOT NULL,
        test_id       TEXT NOT NULL,
        timestamp     DATETIME DEFAULT CURRENT_TIMESTAMP,
        raw_score     INTEGER NOT NULL,
        total_q       INTEGER NOT NULL,
        scaled_score  INTEGER NOT NULL,
        time_used_s   INTEGER NOT NULL,
        answers_json  TEXT NOT NULL
      );
    `)
    const answers = JSON.stringify([
      { q_id: 'q1', topic: 'Percents', is_correct: true },
      { q_id: 'q2', topic: 'Percents', is_correct: false },
      { q_id: 'q3', topic: 'Probability', is_correct: true },
    ])
    tmpDb.prepare(`
      INSERT INTO shsat_results (kid, test_id, raw_score, total_q, scaled_score, time_used_s, answers_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('alice', 'test-1', 2, 3, 600, 900, answers)
    tmpDb.prepare(`
      INSERT INTO shsat_results (kid, test_id, raw_score, total_q, scaled_score, time_used_s, answers_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('jake', 'test-1', 3, 3, 800, 1200, answers)
  })

  afterAll(() => {
    tmpDb.close()
    fs.unlinkSync(tmpPath)
  })

  it('can query results for both kids from DB', () => {
    const KIDS = ['alice', 'jake']
    const rows = tmpDb
      .prepare(
        `SELECT id, kid, test_id, raw_score FROM shsat_results WHERE kid IN (${KIDS.map(() => '?').join(',')}) ORDER BY timestamp DESC`
      )
      .all(...KIDS) as any[]
    expect(rows.length).toBe(2)
    const kids = rows.map((r) => r.kid)
    expect(kids).toContain('alice')
    expect(kids).toContain('jake')
  })

  it('answers_json parses correctly with topic stats', () => {
    const row = tmpDb.prepare('SELECT answers_json FROM shsat_results WHERE kid = ?').get('alice') as any
    const answers = JSON.parse(row.answers_json)
    expect(answers.length).toBe(3)

    function computeTopicStats(ans: any[]) {
      const map: Record<string, { correct: number; total: number }> = {}
      for (const a of ans) {
        if (!map[a.topic]) map[a.topic] = { correct: 0, total: 0 }
        map[a.topic].total++
        if (a.is_correct) map[a.topic].correct++
      }
      return Object.entries(map).map(([topic, stats]) => ({
        topic,
        correct: stats.correct,
        total: stats.total,
        pct: stats.total > 0 ? stats.correct / stats.total : 0,
      }))
    }

    const stats = computeTopicStats(answers)
    const percents = stats.find((s) => s.topic === 'Percents')!
    expect(percents.correct).toBe(1)
    expect(percents.total).toBe(2)
    expect(percents.pct).toBe(0.5)
  })
})

// ── PIN validation ────────────────────────────────────────────────────────────

describe('PIN validation', () => {
  const PIN_REGEX = /^\d{4}$/

  it('accepts valid 4-digit PINs', () => {
    expect(PIN_REGEX.test('1234')).toBe(true)
    expect(PIN_REGEX.test('0000')).toBe(true)
    expect(PIN_REGEX.test('9999')).toBe(true)
  })

  it('rejects non-4-digit or non-numeric PINs', () => {
    expect(PIN_REGEX.test('123')).toBe(false)
    expect(PIN_REGEX.test('12345')).toBe(false)
    expect(PIN_REGEX.test('abcd')).toBe(false)
    expect(PIN_REGEX.test('12 4')).toBe(false)
    expect(PIN_REGEX.test('')).toBe(false)
  })
})
