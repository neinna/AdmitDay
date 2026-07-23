'use client'

import { useState } from 'react'

interface Source {
  name: string
  dbn: string
  borough: string
  score: number
}

interface ChatResponse {
  answer: string
  sources: Source[]
}

export default function ChatPage() {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    const trimmed = question.trim()
    if (!trimmed) return

    setLoading(true)
    setError('')
    setAnswer('')
    setSources([])

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed }),
      })

      if (!res.ok) {
        throw new Error(`Request failed (${res.status})`)
      }

      const data: ChatResponse = await res.json()
      setAnswer((data.answer ?? '').replace(/\*\*/g, ''))
      setSources(Array.isArray(data.sources) ? data.sources : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Ask about NYC high schools</h1>
          <p className="mt-1.5 text-gray-500 text-sm">
            Ask a question and get an answer grounded in real NYC high school data.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="question" className="block text-sm font-medium text-gray-700 mb-1.5">
              Your question
            </label>
            <textarea
              id="question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit(e)
                }
              }}
              placeholder="e.g. Which Brooklyn high schools have strong STEM programs? (Enter to ask, Shift+Enter for a new line)"
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900"
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="w-full bg-gray-900 text-white py-3 px-4 rounded-md text-sm font-medium hover:bg-gray-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? 'Thinking…' : 'Ask'}
          </button>
        </form>

        {error && (
          <div
            role="alert"
            className="mt-6 px-4 py-3 rounded-md border"
            style={{ backgroundColor: '#FEF2F2', borderColor: '#FCA5A5', color: '#991B1B' }}
          >
            <p className="text-sm">{error}</p>
          </div>
        )}

        {loading && (
          <div className="mt-6 text-sm text-gray-500">Searching schools and generating an answer…</div>
        )}

        {!loading && answer && (
          <div className="mt-8">
            <p className="text-gray-900 text-sm whitespace-pre-wrap leading-relaxed">{answer}</p>
          </div>
        )}

        {!loading && sources.length > 0 && (
          <div className="mt-8">
            <h2 className="text-sm font-medium text-gray-700 mb-2">Sources</h2>
            <ol className="space-y-2 list-decimal list-inside">
              {sources.map((s, i) => (
                <li
                  key={s.dbn}
                  className="flex items-center justify-between px-3 py-2 rounded-md border border-gray-200 bg-gray-50"
                >
                  <div className="text-sm text-gray-900">
                    <span className="text-gray-500 tabular-nums mr-1.5">{i + 1}.</span>
                    <span className="font-medium">{s.name}</span>
                    <span className="text-gray-500"> — {s.borough}</span>
                  </div>
                  <div className="text-xs text-gray-500 tabular-nums">
                    similarity: {s.score.toFixed(3)}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </main>
  )
}
