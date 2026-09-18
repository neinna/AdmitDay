'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useClerk } from '@clerk/nextjs'
import Link from 'next/link'
import Footer from '@/components/Footer'

/**
 * Issue #241 (part of #179): the confirmation step for account deletion.
 * `DELETE /api/account` removes our Postgres rows and the Clerk user; only
 * after that succeeds does this sign the browser out and send the parent
 * home, so a failed delete never leaves the session in a half-signed-out
 * state.
 */
export default function AccountDeleteClient() {
  const router = useRouter()
  const { signOut } = useClerk()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)

  async function handleDelete() {
    setPending(true)
    setError(false)

    const res = await fetch('/api/account', { method: 'DELETE' })
    if (!res.ok) {
      setPending(false)
      setError(true)
      return
    }

    await signOut()
    router.push('/')
  }

  return (
    <main className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 flex items-center justify-center px-5">
        <div className="max-w-[440px] w-full">
          <h1 className="font-display font-bold text-[28px] leading-[1.1] tracking-[-0.03em] text-ink">
            Delete your account?
          </h1>
          <p className="text-[15px] text-ink-2 leading-[1.55] mt-3">
            This permanently deletes your AdmitDay account: your name, email, sign-in, and every saved school. It
            can&rsquo;t be undone.
          </p>

          {error && (
            <p role="alert" className="text-[13.5px] text-red-700 mt-3">
              Something went wrong deleting your account. Please try again.
            </p>
          )}

          <div className="flex items-center gap-4 mt-6">
            <button
              type="button"
              onClick={handleDelete}
              disabled={pending}
              className="text-[14px] font-medium text-white bg-accent px-4 py-[9px] hover:opacity-90 transition-opacity duration-[120ms] ease-out disabled:opacity-50"
            >
              {pending ? 'Deleting…' : 'Delete my account'}
            </button>
            <Link
              href="/"
              className="text-[14px] font-medium text-ink hover:text-accent transition-colors duration-[120ms] ease-out"
            >
              Cancel
            </Link>
          </div>
        </div>
      </div>
      <Footer />
    </main>
  )
}
