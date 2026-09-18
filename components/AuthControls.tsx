'use client'

import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from '@clerk/nextjs'

/**
 * Issue #199: sign-in / sign-up buttons in the top right of every header, and
 * the signed-in user's name with a log-out menu. Identity only — no saved
 * data moves here, and no route is gated by this component.
 */
export default function AuthControls() {
  return (
    <div className="flex items-center gap-3">
      <SignedOut>
        <SignInButton mode="modal">
          <button
            type="button"
            className="text-[14px] font-medium text-ink hover:text-accent transition-colors duration-[120ms] ease-out"
          >
            Log in
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
        />
      </SignedIn>
    </div>
  )
}
