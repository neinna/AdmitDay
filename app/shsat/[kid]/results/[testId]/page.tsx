'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import PinGate from '@/components/shsat/PinGate'

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

function thumbIcon(pct: number) {
  if (pct >= 0.8) return '🟢'
  if (pct >= 0.5) return '🟡'
  return '🔴'
}

function difficultyLabel(d: string) {
  return d.charAt(0).toUpperCase() + d.slice(1)
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function testLabel(testId: string) {
  if (testId === 'test-1') return 'Math Mini Test #1'
  return testId
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

function QuestionCard({
  answer,
  index,
}: {
  answer: AnswerRecord
  index: number
}) {
  const [expanded, setExpanded] = useState(!answer.is_correct)

  return (
    <div
      className={`rounded-xl border ${
        answer.is_correct ? 'border-gray-700 bg-gray-800' : 'border-red-800/50 bg-gray-800'
      }`}
    >
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full text-left px-5 py-4 flex items-center justify-between gap-3"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-gray-400 text-sm shrink-0">Q{index + 1}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-300 shrink-0">
            {answer.topic}
          </span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
              answer.difficulty === 'easy'
                ? 'bg-green-900/50 text-green-300'
                : answer.difficulty === 'medium'
                ? 'bg-yellow-900/50 text-yellow-300'
                : 'bg-red-900/50 text-red-300'
            }`}
          >
            {difficultyLabel(answer.difficulty)}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span>{answer.is_correct ? '✅' : '❌'}</span>
          <span className="text-gray-400 text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-3 border-t border-gray-700 pt-4">
          {/* We don't store question text in answers_json, show answer comparison */}
          {!answer.is_correct && answer.user_answer && (
            <div className="text-sm">
              <span className="text-gray-400">Your answer: </span>
              <span className="text-red-400 font-semibold">{answer.user_answer}</span>
            </div>
          )}
          {!answer.is_correct && !answer.user_answer && (
            <div className="text-sm text-red-400">No answer given (time expired)</div>
          )}
          <div className="text-sm">
            <span className="text-gray-400">Correct answer: </span>
            <span className="text-green-400 font-semibold">{answer.correct_answer}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function ReviewContent({ kid, testId }: { kid: string; testId: string }) {
  const [result, setResult] = useState<TestResult | null>(null)
  const [error, setError] = useState('')
  const kidName = kid.charAt(0).toUpperCase() + kid.slice(1)

  useEffect(() => {
    const pin = sessionStorage.getItem(`shsat_pin_${kid}`) || ''
    fetch(`/api/shsat/results/${kid}/${testId}`, {
      headers: { 'x-shsat-pin': pin },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setResult(data.result)
        else setError(data.error || 'Failed to load result.')
      })
      .catch(() => setError('Network error.'))
  }, [kid, testId])

  if (error) {
    return (
      <main className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center">
        <p className="text-red-400">{error}</p>
      </main>
    )
  }

  if (!result) {
    return (
      <main className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading…</p>
      </main>
    )
  }

  const topicStats = computeTopicStats(result.answers_json)
  const redTopics = topicStats.filter((t) => t.pct < 0.5)

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-2xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-sm text-gray-400">{kidName}</div>
            <h1 className="text-2xl font-bold text-white">{testLabel(testId)} — Review</h1>
          </div>
          <Link
            href={`/shsat/${kid}/results`}
            className="text-sm text-indigo-400 hover:text-indigo-300"
          >
            ← History
          </Link>
        </div>

        <div className="flex gap-4 text-sm text-gray-400 mb-8">
          <span>Raw: <span className="text-white">{result.raw_score} / {result.total_q}</span></span>
          <span>Scaled: <span className="text-white font-semibold">{result.scaled_score}</span></span>
          <span>Time: <span className="text-white">{fmtTime(result.time_used_s)}</span></span>
        </div>

        {/* Focus callout */}
        {redTopics.length > 0 && (
          <div className="mb-6 p-4 rounded-xl border border-red-700 bg-red-950/40">
            <p className="text-red-300 font-semibold text-sm mb-1">Focus on these topics:</p>
            <p className="text-red-200 text-sm">
              {redTopics.map((t) => t.topic).join(', ')}
            </p>
          </div>
        )}

        {/* Topic breakdown */}
        <div className="mb-8">
          <h2 className="text-white font-semibold mb-3">Topic Breakdown</h2>
          <div className="bg-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="text-left px-4 py-3 font-medium">Topic</th>
                  <th className="text-right px-4 py-3 font-medium">Score</th>
                  <th className="text-center px-4 py-3 font-medium">Rating</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {topicStats.map((t) => (
                  <tr key={t.topic}>
                    <td className="px-4 py-3 text-gray-200">{t.topic}</td>
                    <td className="px-4 py-3 text-right text-gray-300">
                      {t.correct} / {t.total}
                    </td>
                    <td className="px-4 py-3 text-center text-lg">{thumbIcon(t.pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Question-by-question review */}
        <div>
          <h2 className="text-white font-semibold mb-3">Question Review</h2>
          <div className="space-y-3">
            {result.answers_json.map((answer, i) => (
              <QuestionCard key={answer.q_id} answer={answer} index={i} />
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}

export default function TestReviewPage({
  params,
}: {
  params: { kid: string; testId: string }
}) {
  return (
    <PinGate kid={params.kid}>
      <ReviewContent kid={params.kid} testId={params.testId} />
    </PinGate>
  )
}
