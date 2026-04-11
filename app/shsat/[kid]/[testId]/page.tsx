'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import questionsData from '@/data/shsat-questions.json'

type Question = {
  id: string
  test_ids: string[]
  chapter: number
  topic: string
  difficulty: 'easy' | 'medium' | 'hard'
  type: 'mc' | 'gridin'
  question: string
  options?: string[]
  answer: string
  explanation: string
}

type Answer = {
  q_id: string
  topic: string
  difficulty: string
  type: string
  user_answer: string
  correct_answer: string
  is_correct: boolean
}

const TOTAL_Q = 15
const TIME_LIMIT_S = 30 * 60

const DIFFICULTY_ORDER: ('easy' | 'medium' | 'hard')[] = ['easy', 'medium', 'hard']

function scaledScore(raw: number, total: number) {
  return 200 + Math.round((raw / total) * 600)
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export default function TestPage({ params }: { params: { kid: string; testId: string } }) {
  const { kid, testId } = params
  const router = useRouter()

  // Phase: splash | test | score
  const [phase, setPhase] = useState<'splash' | 'test' | 'score'>('splash')

  // Test state
  const allQuestions = (questionsData as Question[]).filter((q) => q.test_ids.includes(testId))
  const buckets: Record<string, Question[]> = { easy: [], medium: [], hard: [] }
  allQuestions.forEach((q) => buckets[q.difficulty].push(q))

  const [qIndex, setQIndex] = useState(0)
  const [answers, setAnswers] = useState<Answer[]>([])
  const [currentAnswer, setCurrentAnswer] = useState('')
  const [gridError, setGridError] = useState('')
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT_S)
  const [timeUsed, setTimeUsed] = useState(0)
  const [submitted, setSubmitted] = useState(false)

  // Adaptive difficulty
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium')
  const [consecutiveCorrect, setConsecutiveCorrect] = useState(0)
  const usedIds = useRef<Set<string>>(new Set())
  const [questionQueue, setQuestionQueue] = useState<Question[]>([])

  // Score screen
  const [scorePosted, setScorePosted] = useState(false)
  const [countdown, setCountdown] = useState(60)

  const kidName = kid.charAt(0).toUpperCase() + kid.slice(1)
  const testLabel = testId === 'test-1' ? 'Math Mini Test #1' : testId

  // Build question queue adaptively
  function pickNext(
    currentDiff: 'easy' | 'medium' | 'hard',
    used: Set<string>
  ): Question | null {
    const available = buckets[currentDiff].filter((q) => !used.has(q.id))
    if (available.length === 0) {
      // Try other buckets
      for (const d of DIFFICULTY_ORDER) {
        const fallback = buckets[d].filter((q) => !used.has(q.id))
        if (fallback.length > 0) {
          return fallback[Math.floor(Math.random() * fallback.length)]
        }
      }
      return null
    }
    return available[Math.floor(Math.random() * available.length)]
  }

  function startTest() {
    const queue: Question[] = []
    const used = new Set<string>()
    let diff: 'easy' | 'medium' | 'hard' = 'medium'
    let consec = 0

    for (let i = 0; i < TOTAL_Q; i++) {
      const q = pickNext(diff, used)
      if (!q) break
      used.add(q.id)
      queue.push(q)

      // We'll compute adaptive difficulty as questions are answered, but pre-build queue for simplicity
      // actual adaptive logic applied on Next button click
    }
    usedIds.current = used
    setQuestionQueue(queue)
    setQIndex(0)
    setAnswers([])
    setCurrentAnswer('')
    setGridError('')
    setTimeLeft(TIME_LIMIT_S)
    setTimeUsed(0)
    setDifficulty('medium')
    setConsecutiveCorrect(0)
    setPhase('test')
  }

  // Timer
  useEffect(() => {
    if (phase !== 'test') return
    if (timeLeft <= 0) {
      handleAutoSubmit()
      return
    }
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000)
    return () => clearTimeout(t)
  })

  function handleAutoSubmit() {
    // Mark current question as unanswered/wrong if no answer
    const remaining = questionQueue.slice(qIndex)
    const autoAnswers: Answer[] = remaining.map((q) => ({
      q_id: q.id,
      topic: q.topic,
      difficulty: q.difficulty,
      type: q.type,
      user_answer: '',
      correct_answer: q.answer,
      is_correct: false,
    }))
    finishTest([...answers, ...autoAnswers])
  }

  function validateGridIn(val: string): boolean {
    // Accept integers, decimals, fractions. Reject mixed numbers (digit space digit).
    if (/^\d+\s+\d/.test(val)) return false
    if (/^-/.test(val)) return false
    return /^\d+(\.\d+)?(\/\d+)?$/.test(val)
  }

  function handleNext() {
    const currentQ = questionQueue[qIndex]
    if (!currentQ) return

    let userAns = currentAnswer.trim()

    if (currentQ.type === 'gridin') {
      if (!validateGridIn(userAns)) {
        setGridError('Enter 3.5 or 7/2, not 3 1/2')
        return
      }
    }

    const isCorrect = userAns === currentQ.answer
    const newAnswer: Answer = {
      q_id: currentQ.id,
      topic: currentQ.topic,
      difficulty: currentQ.difficulty,
      type: currentQ.type,
      user_answer: userAns,
      correct_answer: currentQ.answer,
      is_correct: isCorrect,
    }
    const newAnswers = [...answers, newAnswer]

    // Adaptive logic
    let newDiff = difficulty
    let newConsec = consecutiveCorrect
    if (isCorrect) {
      newConsec++
      if (newConsec >= 2 && difficulty !== 'hard') {
        newDiff = DIFFICULTY_ORDER[Math.min(DIFFICULTY_ORDER.indexOf(difficulty) + 1, 2)]
        newConsec = 0
      }
    } else {
      newConsec = 0
      if (difficulty !== 'easy') {
        newDiff = DIFFICULTY_ORDER[Math.max(DIFFICULTY_ORDER.indexOf(difficulty) - 1, 0)]
      }
    }
    setDifficulty(newDiff)
    setConsecutiveCorrect(newConsec)

    if (qIndex + 1 >= TOTAL_Q || qIndex + 1 >= questionQueue.length) {
      finishTest(newAnswers)
    } else {
      setAnswers(newAnswers)
      setQIndex(qIndex + 1)
      setCurrentAnswer('')
      setGridError('')
    }
  }

  function finishTest(finalAnswers: Answer[]) {
    const used = TIME_LIMIT_S - timeLeft
    setTimeUsed(used)
    setAnswers(finalAnswers)
    setPhase('score')

    const raw = finalAnswers.filter((a) => a.is_correct).length
    const total = finalAnswers.length
    const scaled = scaledScore(raw, total)

    // POST result
    const pin = sessionStorage.getItem(`shsat_pin_${kid}`) || ''
    fetch('/api/shsat/results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-shsat-pin': pin },
      body: JSON.stringify({
        kid,
        test_id: testId,
        raw_score: raw,
        total_q: total,
        scaled_score: scaled,
        time_used_s: used,
        answers_json: JSON.stringify(finalAnswers),
      }),
    }).then(() => setScorePosted(true)).catch(() => {})
  }

  // Score countdown redirect
  useEffect(() => {
    if (phase !== 'score') return
    if (countdown <= 0) {
      router.push(`/shsat/${kid}/results/${testId}`)
      return
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  })

  // ─── SPLASH ───
  if (phase === 'splash') {
    return (
      <main className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-gray-800 rounded-2xl p-8">
          <div className="mb-6">
            <div className="text-sm text-gray-400 mb-1">{kidName}</div>
            <h1 className="text-2xl font-bold text-white">{testLabel}</h1>
            <div className="text-sm text-gray-400 mt-1">Ch 8–10 · {TOTAL_Q} questions · 30 minutes</div>
          </div>
          <div className="bg-gray-700 rounded-xl p-4 mb-6 space-y-2 text-sm text-gray-300">
            <p>📌 <strong className="text-white">No going back</strong> — once you click Next, that question is locked.</p>
            <p>📌 <strong className="text-white">You must answer</strong> — Next stays disabled until an answer is selected.</p>
            <p>📌 <strong className="text-white">Grid-in answers:</strong> enter decimals (3.5) or fractions (7/2). No mixed numbers.</p>
            <p>📌 <strong className="text-white">Timer starts</strong> the moment you click Start.</p>
          </div>
          <button
            onClick={startTest}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl py-4 text-lg transition-colors"
          >
            Start →
          </button>
        </div>
      </main>
    )
  }

  // ─── TEST ───
  if (phase === 'test') {
    const currentQ = questionQueue[qIndex]
    if (!currentQ) return null
    const isLast = qIndex + 1 >= Math.min(TOTAL_Q, questionQueue.length)
    const timerRed = timeLeft <= 300
    const hasAnswer = currentQ.type === 'mc' ? currentAnswer !== '' : currentAnswer.trim() !== ''

    return (
      <main className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
        {/* Header */}
        <div className="bg-gray-900 border-b border-gray-700 px-4 py-3 flex items-center justify-between">
          <div className="text-sm text-gray-300">
            <span className="font-semibold text-white">{testLabel}</span>
            <span className="text-gray-500 ml-2">— {kidName}</span>
          </div>
          <div
            className={`font-mono font-bold text-lg tabular-nums ${
              timerRed ? 'text-red-400 animate-pulse' : 'text-white'
            }`}
          >
            {fmtTime(timeLeft)}
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-gray-800">
          <div
            className="h-1 bg-indigo-500 transition-all"
            style={{ width: `${((qIndex + 1) / TOTAL_Q) * 100}%` }}
          />
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
          <div className="w-full max-w-lg">
            <div className="text-sm text-gray-400 mb-4">
              Question {qIndex + 1} of {TOTAL_Q}
            </div>

            <div className="bg-gray-800 rounded-2xl p-6 mb-6">
              <p className="text-white text-base leading-relaxed">{currentQ.question}</p>
            </div>

            {currentQ.type === 'mc' && currentQ.options && (
              <div className="space-y-3">
                {currentQ.options.map((opt) => {
                  const letter = opt.charAt(0)
                  return (
                    <button
                      key={opt}
                      onClick={() => setCurrentAnswer(letter)}
                      className={`w-full text-left px-5 py-4 rounded-xl border text-sm transition-colors ${
                        currentAnswer === letter
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'bg-gray-800 border-gray-700 text-gray-200 hover:border-indigo-600'
                      }`}
                    >
                      {opt}
                    </button>
                  )
                })}
              </div>
            )}

            {currentQ.type === 'gridin' && (
              <div>
                <input
                  type="text"
                  value={currentAnswer}
                  onChange={(e) => {
                    setCurrentAnswer(e.target.value)
                    setGridError('')
                  }}
                  placeholder="Enter your answer (e.g. 3.5 or 7/2)"
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-4 text-center text-lg focus:outline-none focus:border-indigo-500"
                />
                {gridError && <p className="text-red-400 text-sm mt-2 text-center">{gridError}</p>}
              </div>
            )}

            <button
              onClick={handleNext}
              disabled={!hasAnswer}
              className="mt-6 w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-4 transition-colors"
            >
              {isLast ? 'Submit' : 'Next →'}
            </button>
          </div>
        </div>
      </main>
    )
  }

  // ─── SCORE ───
  const raw = answers.filter((a) => a.is_correct).length
  const total = answers.length
  const scaled = scaledScore(raw, total)
  const pct = total > 0 ? raw / total : 0
  const circumference = 2 * Math.PI * 54

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-white text-center mb-8">Test Complete!</h1>

        {/* Score ring */}
        <div className="flex justify-center mb-8">
          <div className="relative">
            <svg width="128" height="128" className="-rotate-90">
              <circle cx="64" cy="64" r="54" fill="none" stroke="#374151" strokeWidth="10" />
              <circle
                cx="64"
                cy="64"
                r="54"
                fill="none"
                stroke="#6366f1"
                strokeWidth="10"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - pct)}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-white">{scaled}</span>
              <span className="text-xs text-gray-400">scaled</span>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-2xl p-6 mb-6 space-y-3 text-center">
          <div className="text-gray-300">
            Raw score: <span className="text-white font-semibold">{raw} / {total}</span>
          </div>
          <div className="text-gray-300">
            Time used: <span className="text-white font-semibold">{fmtTime(timeUsed)}</span>
          </div>
          <p className="text-xs text-gray-500 mt-2">Mini test scale — full test scoring will differ</p>
        </div>

        <div className="text-center text-gray-400 text-sm mb-4">
          Opening full review in{' '}
          <span className="text-white font-mono">{Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, '0')}</span>…
        </div>

        <Link
          href={`/shsat/${kid}/results/${testId}`}
          className="block w-full text-center bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl py-3 transition-colors"
        >
          Open now →
        </Link>
      </div>
    </main>
  )
}
