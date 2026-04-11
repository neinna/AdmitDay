'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import PinGate from '@/components/shsat/PinGate'

interface TestResult {
  id: number
  kid: string
  test_id: string
  timestamp: string
  raw_score: number
  total_q: number
  scaled_score: number
  time_used_s: number
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function testLabel(testId: string) {
  if (testId === 'test-1') return 'Math Mini Test #1'
  return testId
}

function ResultsContent({ kid }: { kid: string }) {
  const [results, setResults] = useState<TestResult[] | null>(null)
  const [error, setError] = useState('')
  const kidName = kid.charAt(0).toUpperCase() + kid.slice(1)

  useEffect(() => {
    const pin = sessionStorage.getItem(`shsat_pin_${kid}`) || ''
    fetch(`/api/shsat/results/${kid}`, {
      headers: { 'x-shsat-pin': pin },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setResults(data.results)
        else setError(data.error || 'Failed to load results.')
      })
      .catch(() => setError('Network error.'))
  }, [kid])

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-white">{kidName}&apos;s Results</h1>
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
            <Link
              href="/shsat"
              className="mt-4 inline-block text-indigo-400 hover:text-indigo-300 text-sm"
            >
              Take a test →
            </Link>
          </div>
        )}

        {results !== null && results.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 text-left border-b border-gray-700">
                  <th className="pb-3 font-medium">Date</th>
                  <th className="pb-3 font-medium">Test</th>
                  <th className="pb-3 font-medium text-right">Raw</th>
                  <th className="pb-3 font-medium text-right">Scaled</th>
                  <th className="pb-3 font-medium text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {results.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-800/50 transition-colors">
                    <td className="py-3 pr-4 text-gray-300 whitespace-nowrap">{fmtDate(r.timestamp)}</td>
                    <td className="py-3 pr-4">
                      <Link
                        href={`/shsat/${kid}/results/${r.test_id}`}
                        className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
                      >
                        {testLabel(r.test_id)}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 text-right text-gray-300 whitespace-nowrap">
                      {r.raw_score} / {r.total_q}
                    </td>
                    <td className="py-3 pr-4 text-right text-white font-semibold">{r.scaled_score}</td>
                    <td className="py-3 text-right text-gray-400">{fmtTime(r.time_used_s)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  )
}

export default function ResultsPage({ params }: { params: { kid: string } }) {
  return (
    <PinGate kid={params.kid}>
      <ResultsContent kid={params.kid} />
    </PinGate>
  )
}
