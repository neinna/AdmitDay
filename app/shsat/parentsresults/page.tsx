'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const KID_META: Record<string, { name: string; emoji: string }> = {
  alice: { name: 'Student 1', emoji: '🌸' },
  jake: { name: 'Student 2', emoji: '⚡' },
}

interface AnswerRecord {
  q_id: string
  topic: string
  difficulty: string
  type: string
  user_answer: string
  correct_answer: string
  is_correct: boolean
}

interface TestResult {
  id: number
  kid: string
  test_id: string
  timestamp: string
  raw_score: number
  total_q: number
  scaled_score: number
  time_used_s: number
  answers_json: AnswerRecord[]
}

interface TopicStats {
  topic: string
  correct: number
  total: number
  pct: number
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function testLabel(testId: string) {
  if (testId === 'test-1') return 'Math Mini Test #1'
  return testId
}

function thumbIcon(pct: number) {
  if (pct >= 0.8) return '🟢'
  if (pct >= 0.5) return '🟡'
  return '🔴'
}

function computeTopicStats(answers: AnswerRecord[]): TopicStats[] {
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

function ResultRow({ result }: { result: TestResult }) {
  const [expanded, setExpanded] = useState(false)
  const meta = KID_META[result.kid] ?? { name: result.kid, emoji: '' }
  const topicStats = computeTopicStats(result.answers_json)

  return (
    <>
      <tr
        className="hover:bg-gray-800/50 transition-colors cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        <td className="py-3 pr-4 text-gray-300 whitespace-nowrap">{fmtDate(result.timestamp)}</td>
        <td className="py-3 pr-4 text-gray-200 whitespace-nowrap">
          {meta.emoji} {meta.name}
        </td>
        <td className="py-3 pr-4 text-gray-300">{testLabel(result.test_id)}</td>
        <td className="py-3 pr-4 text-right text-gray-300 whitespace-nowrap">
          {result.raw_score}/{result.total_q}
        </td>
        <td className="py-3 pr-4 text-right text-white font-semibold">{result.scaled_score}</td>
        <td className="py-3 pr-4 text-right text-gray-400 whitespace-nowrap">
          {fmtTime(result.time_used_s)}
        </td>
        <td className="py-3 text-right whitespace-nowrap">
          {topicStats.map((t) => (
            <span key={t.topic} title={t.topic}>
              {thumbIcon(t.pct)}
            </span>
          ))}
          <span className="ml-2 text-gray-500 text-xs">{expanded ? '▲' : '▼'}</span>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} className="pb-4 pt-1 px-2">
            <div className="bg-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-700">
                    <th className="text-left px-4 py-2 font-medium">Topic</th>
                    <th className="text-right px-4 py-2 font-medium">Score</th>
                    <th className="text-center px-4 py-2 font-medium">Rating</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {topicStats.map((t) => (
                    <tr key={t.topic}>
                      <td className="px-4 py-2 text-gray-200">{t.topic}</td>
                      <td className="px-4 py-2 text-right text-gray-300">
                        {t.correct}/{t.total}
                      </td>
                      <td className="px-4 py-2 text-center text-lg">{thumbIcon(t.pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function ParentResultsPage() {
  const [results, setResults] = useState<TestResult[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/shsat/results/parent')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setResults(data.results)
        else setError(data.error || 'Failed to load results.')
      })
      .catch(() => setError('Network error.'))
  }, [])

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-white">All Results</h1>
          <Link href="/shsat" className="text-sm text-indigo-400 hover:text-indigo-300">
            ← Back to tests
          </Link>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        {results === null && !error && (
          <p className="text-gray-400 text-sm">Loading…</p>
        )}

        {results !== null && results.length === 0 && (
          <div className="bg-gray-800 rounded-2xl p-8 text-center">
            <p className="text-gray-400">No tests completed yet.</p>
          </div>
        )}

        {results !== null && results.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 text-left border-b border-gray-700">
                  <th className="pb-3 font-medium">Date</th>
                  <th className="pb-3 font-medium">Kid</th>
                  <th className="pb-3 font-medium">Test</th>
                  <th className="pb-3 font-medium text-right">Raw</th>
                  <th className="pb-3 font-medium text-right">Scaled</th>
                  <th className="pb-3 font-medium text-right">Time</th>
                  <th className="pb-3 font-medium text-right">Topics</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {results.map((r) => (
                  <ResultRow key={r.id} result={r} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  )
}
