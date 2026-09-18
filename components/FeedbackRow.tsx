'use client'

import { useEffect, useState } from 'react'
import { usePostHog } from 'posthog-js/react'

const STORAGE_KEYS: Record<string, string> = {
  school_list: 'feedback_school_list',
  requirements: 'feedback_requirements',
  find_ask: 'feedback_find_ask',
}

type Screen = 'school_list' | 'requirements' | 'find_ask'
type Rating = 'up' | 'down'

interface Props {
  screen: Screen
  // Opaque Langfuse trace id for the answer this row rates (issue #195).
  // Optional — omitted entirely on screens with no LLM trace behind them,
  // in which case feedback behaves exactly as before.
  traceId?: string
}

// A traceId ties a rating to one specific answer, not to the screen as a
// whole — STORAGE_KEYS[screen] is shared by every answer on that screen, so
// reading or writing it for a traced row would leak one trace's rating onto
// another (issue #195 reviewer risk: a stale rating must never appear to
// belong to the current trace). Exported so that leak scenario — rate trace
// A, then mount fresh for trace B — can be tested directly without a DOM.
export function readPersistedRating(screen: Screen, traceId?: string): Rating | null {
  if (traceId) return null
  try {
    const stored = localStorage.getItem(STORAGE_KEYS[screen])
    return stored === 'up' || stored === 'down' ? stored : null
  } catch {
    return null
  }
}

export function persistRating(screen: Screen, traceId: string | undefined, rating: Rating | null): void {
  if (traceId) return
  try {
    if (rating === null) {
      localStorage.removeItem(STORAGE_KEYS[screen])
    } else {
      localStorage.setItem(STORAGE_KEYS[screen], rating)
    }
  } catch {
    // ignore
  }
}

export default function FeedbackRow({ screen, traceId }: Props) {
  const posthog = usePostHog()
  const [rating, setRating] = useState<'up' | 'down' | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [animating, setAnimating] = useState<'up' | 'down' | null>(null)

  useEffect(() => {
    const stored = readPersistedRating(screen, traceId)
    if (stored) setRating(stored)
    setHydrated(true)
  }, [screen, traceId])

  function handleRate(value: 'up' | 'down') {
    const newRating = rating === value ? null : value
    setRating(newRating)
    setAnimating(value)
    setTimeout(() => setAnimating(null), 150)
    persistRating(screen, traceId, newRating)
    if (newRating !== null) {
      posthog?.capture('screen_feedback', {
        screen,
        rating: value,
        ...(traceId ? { trace_id: traceId } : {}),
      })
      if (traceId) {
        fetch('/api/find/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ traceId, rating: value }),
        }).catch(() => {
          // A failed score write must never surface to the user (same rule as #194).
        })
      }
    }
  }

  if (!hydrated) return null

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => handleRate('up')}
        aria-label="Thumbs up"
        aria-pressed={rating === 'up'}
        style={animating === 'up' ? { animation: 'feedback-pop 150ms ease-out' } : undefined}
        className={`flex items-center justify-center w-7 h-7 rounded-full text-base cursor-pointer transition-opacity ${
          rating === 'up'
            ? 'bg-green-100'
            : rating === 'down'
            ? 'opacity-40'
            : 'hover:bg-gray-100'
        }`}
      >
        👍
      </button>
      <button
        onClick={() => handleRate('down')}
        aria-label="Thumbs down"
        aria-pressed={rating === 'down'}
        style={animating === 'down' ? { animation: 'feedback-pop 150ms ease-out' } : undefined}
        className={`flex items-center justify-center w-7 h-7 rounded-full text-base cursor-pointer transition-opacity ${
          rating === 'down'
            ? 'bg-red-100'
            : rating === 'up'
            ? 'opacity-40'
            : 'hover:bg-gray-100'
        }`}
      >
        👎
      </button>
    </div>
  )
}
