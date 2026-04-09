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
  const [animating, setAnimating] = useState<'up' | 'down' | null>(null)

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
    const newRating = rating === value ? null : value
    setRating(newRating)
    setAnimating(value)
    setTimeout(() => setAnimating(null), 150)
    try {
      if (newRating === null) {
        localStorage.removeItem(STORAGE_KEYS[screen])
      } else {
        localStorage.setItem(STORAGE_KEYS[screen], newRating)
      }
    } catch {
      // ignore
    }
    if (newRating !== null) {
      posthog?.capture('screen_feedback', { screen, rating: value })
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
