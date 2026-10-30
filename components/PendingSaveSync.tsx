'use client'

import { useEffect, useRef } from 'react'
import { useAuth } from '@clerk/nextjs'

// Issue #240: the signed-out Save flow (FindClient, SchoolDetailClient)
// stashes the clicked { dbn, program_code } here as JSON before opening the
// sign-up modal, since there's no account yet to save it against.
export const PENDING_SAVE_KEY = 'admitday:pendingSave'

/**
 * Lives in the root layout next to AuthPosthogSync. Once isSignedIn turns
 * true, posts the pending { dbn, program_code } (if any) to
 * /api/saved-programs and clears the key. Any other value (e.g. an old bare
 * DBN) is dropped unposted. Leaves the key in place on failure so the next
 * page load retries.
 */
export default function PendingSaveSync() {
  const { isSignedIn, isLoaded } = useAuth()
  const firedRef = useRef(false)

  useEffect(() => {
    if (!isLoaded) return
    if (!isSignedIn) {
      firedRef.current = false
      return
    }
    if (firedRef.current) return
    firedRef.current = true

    let raw: string | null = null
    try {
      raw = sessionStorage.getItem(PENDING_SAVE_KEY)
    } catch {
      return
    }
    if (!raw) return

    let pending: { dbn: string; program_code: string } | null = null
    try {
      const parsed = JSON.parse(raw)
      if (
        parsed &&
        typeof parsed === 'object' &&
        typeof parsed.dbn === 'string' &&
        typeof parsed.program_code === 'string'
      ) {
        pending = { dbn: parsed.dbn, program_code: parsed.program_code }
      }
    } catch {
      // not JSON — fall through and drop it
    }
    if (!pending) {
      try {
        sessionStorage.removeItem(PENDING_SAVE_KEY)
      } catch {
        // ignore
      }
      return
    }

    fetch('/api/saved-programs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pending),
    })
      .then((res) => {
        if (!res.ok) return
        try {
          sessionStorage.removeItem(PENDING_SAVE_KEY)
        } catch {
          // ignore
        }
      })
      .catch(() => {
        // keep the key so the next page load retries
      })
  }, [isLoaded, isSignedIn])

  return null
}
