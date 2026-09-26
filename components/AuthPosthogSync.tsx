'use client'

import { useEffect, useRef } from 'react'
import { useUser } from '@clerk/nextjs'
import posthog from 'posthog-js'

/**
 * Issue #199: makes the PostHog funnel (#196) per-person once an account
 * exists. identify() on sign-in, reset() on sign-out — no email or name goes
 * to PostHog, only the stable Clerk user id.
 */
export default function AuthPosthogSync() {
  const { isSignedIn, isLoaded, user } = useUser()
  const identifiedRef = useRef(false)

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY || !isLoaded) return

    if (isSignedIn && user && !identifiedRef.current) {
      identifiedRef.current = true
      posthog.identify(user.id)
    } else if (!isSignedIn && posthog.get_property('$user_state') === 'identified') {
      identifiedRef.current = false
      posthog.reset()
    }
  }, [isLoaded, isSignedIn, user])

  return null
}
