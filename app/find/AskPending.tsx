'use client'

import { useEffect, useState } from 'react'

// Shown only while an ask is running, so the counter starts at 0 on mount.
export default function AskPending() {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-[2px] overflow-hidden bg-rule-light" aria-hidden="true">
        <div className="ask-progress-bar absolute inset-y-0 left-0 w-1/4 bg-accent" />
      </div>
      <p role="status" className="font-mono text-[12px] text-ink-2">
        Searching
        <span aria-hidden="true"> · {seconds}s</span>
      </p>
    </div>
  )
}
