'use client'

import { useState } from 'react'
import { Button } from '@/components/ui'

export type ImproveResult = { number: number; url: string } | { error: string }

export async function submitImprovement(text: string, from: string): Promise<ImproveResult> {
  try {
    const res = await fetch('/api/improvements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, from }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.status === 201) return { number: data.number, url: data.url }
    return { error: data.error || 'Something went wrong.' }
  } catch {
    return { error: 'Something went wrong.' }
  }
}

export function ImproveStatus({ result }: { result: ImproveResult | null }) {
  if (!result) return null
  if ('error' in result) return <p role="alert" className="text-[14px] text-ink">{result.error}</p>
  return (
    <p className="text-[14px] text-ink">
      <a href={result.url} target="_blank" rel="noopener noreferrer" className="underline">
        Filed #{result.number}
      </a>
    </p>
  )
}

export default function ImproveForm({ from }: { from: string }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImproveResult | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const r = await submitImprovement(text, from)
    setBusy(false)
    setResult(r)
    if (!('error' in r)) setText('')
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <textarea
        rows={4}
        maxLength={4000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="Suggest an improvement"
        className="w-full border border-rule p-3 text-[15px] text-ink"
      />
      <div>
        <Button type="submit" disabled={busy || !text.trim()}>
          Send to the agent
        </Button>
      </div>
      <ImproveStatus result={result} />
    </form>
  )
}
