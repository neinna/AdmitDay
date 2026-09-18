import { clerkMiddleware } from '@clerk/nextjs/server'

// Issue #199: Clerk's middleware makes the session available to server code.
// It gates nothing: every route behaves exactly as before for signed-out
// visitors. Route protection, if any, belongs to #200/#201.
export default clerkMiddleware()

export const config = {
  matcher: [
    // Every page except Next internals, static files, and Sentry's
    // /monitoring tunnel (next.config.js tunnelRoute), which must not pass
    // through middleware or client-side error reporting breaks.
    '/((?!_next|monitoring|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // API routes always run it.
    '/(api|trpc)(.*)',
  ],
}
