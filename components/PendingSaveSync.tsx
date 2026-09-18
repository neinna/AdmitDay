'use client'

import { useEffect, useRef } from 'react'
import { useAuth } from '@clerk/nextjs'

// Issue #240: the signed-out Save flow (FindClient, SchoolDetailClient)
// stashes the clicked DBN here before opening the sign-up modal, since
// there's no account yet to save it against.
export const PENDING_SAVE_KEY = 'admitday:pendingSave'

/**
 * Lives in the root layout next to AuthPosthogSync. Once isSignedIn turns
 * true, posts the pending DBN (if any) to /api/saved-schools and clears the
 * key. Leaves the key in place on failure so the next page load retries.
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

    let dbn: string | null = null
    try {
      dbn = sessionStorage.getItem(PENDING_SAVE_KEY)
    } catch {
      return
    }
    if (!dbn) return

    fetch('/api/saved-schools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dbn }),
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
