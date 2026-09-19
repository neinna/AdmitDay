'use client'

import { ClerkLoaded, SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from '@clerk/nextjs'

/**
 * Issue #199: sign-in / sign-up buttons in the top right of every header, and
 * the signed-in user's name with a log-out menu. Identity only — no saved
 * data moves here, and no route is gated by this component.
 *
 * Wrapped in <ClerkLoaded> so the server and the browser's first render both
 * output nothing here: the controls appear once Clerk has loaded. Without it,
 * statically prerendered pages hit a hydration mismatch in the header.
 */
export default function AuthControls() {
  return (
    <div className="flex items-center gap-3">
      <ClerkLoaded>
      <SignedOut>
        <SignInButton mode="modal">
          <button
            type="button"
            className="text-[14px] font-medium text-ink hover:text-accent transition-colors duration-[120ms] ease-out"
          >
            Sign in
          </button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button
            type="button"
            className="text-[14px] font-medium text-white bg-accent px-4 py-[9px] hover:opacity-90 transition-opacity duration-[120ms] ease-out"
          >
            Sign up
          </button>
        </SignUpButton>
      </SignedOut>
      <SignedIn>
        <UserButton
          showName
          appearance={{
            elements: {
              rootBox: 'flex items-center',
              userButtonBox: 'flex-row-reverse',
              userButtonOuterIdentifier: 'text-[14px] font-medium text-ink',
              userButtonTrigger: 'rounded-none shadow-none focus:shadow-none',
              userButtonAvatarBox: 'w-[26px] h-[26px] rounded-none',
              userButtonPopoverCard: 'rounded-none shadow-none border border-rule',
              userButtonPopoverActionButton: 'rounded-none',
            },
          }}
        >
          {/* Issue #241 (part of #179): account deletion needs a confirmation
              page, so this links to /account/delete rather than acting here. */}
          <UserButton.MenuItems>
            <UserButton.Link
              label="Delete account"
              href="/account/delete"
              labelIcon={
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m2 0-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7h14Z" />
                </svg>
              }
            />
          </UserButton.MenuItems>
        </UserButton>
      </SignedIn>
      </ClerkLoaded>
    </div>
  )
}
