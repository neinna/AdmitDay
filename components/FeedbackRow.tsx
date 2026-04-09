'use client'

import { useEffect, useState } from 'react'
import { usePostHog } from 'posthog-js/react'

const STORAGE_KEYS: Record<string, string> = {
  school_list: 'feedback_school_list',
  requirements: 'feedback_requirements',
}

interface Props {
  screen: 'school_list' | 'requirements'
}

export default function FeedbackRow({ screen }: Props) {
  const posthog = usePostHog()
  const [rating, setRating] = useState<'up' | 'down' | null>(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS[screen])
      if (stored === 'up' || stored === 'down') {
        setRating(stored)
      }
    } catch {
      // ignore
    }
    setHydrated(true)
  }, [screen])

  function handleRate(value: 'up' | 'down') {
    if (rating !== null) return
    setRating(value)
    try {
      localStorage.setItem(STORAGE_KEYS[screen], value)
    } catch {
      // ignore
    }
    posthog?.capture('screen_feedback', { screen, rating: value })
  }

  if (!hydrated) return null

  return (
    <div className="mt-8 flex items-center gap-3 justify-center text-sm text-gray-500">
      <span>Was this helpful?</span>
      <button
        onClick={() => handleRate('up')}
        disabled={rating !== null}
        aria-label="Thumbs up"
        aria-pressed={rating === 'up'}
        className={`text-xl transition-opacity ${
          rating === null
            ? 'hover:opacity-80 cursor-pointer'
            : rating === 'up'
            ? 'opacity-100 cursor-default'
            : 'opacity-30 cursor-default'
        }`}
      >
        👍
      </button>
      <button
        onClick={() => handleRate('down')}
        disabled={rating !== null}
        aria-label="Thumbs down"
        aria-pressed={rating === 'down'}
        className={`text-xl transition-opacity ${
          rating === null
            ? 'hover:opacity-80 cursor-pointer'
            : rating === 'down'
            ? 'opacity-100 cursor-default'
            : 'opacity-30 cursor-default'
        }`}
      >
        👎
      </button>
      {rating !== null && (
        <span className="text-gray-500 text-sm">Thanks for the feedback!</span>
      )}
    </div>
  )
}
