// `next build` statically prerenders every page, and <ClerkProvider> (wired
// app-wide in issue #199) throws synchronously if
// NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is unset, even for pages with no Clerk UI
// of their own — surfaced by issue #200's build in an environment with no
// Clerk secrets configured. Vercel always injects the real key in every
// deployed environment, so this fallback is a no-op there; it only applies to
// a local/CI build run without secrets, which never had a working Clerk
// instance to begin with. The value is a syntactically valid but
// non-functional placeholder (base64 of "example.clerk.accounts.dev$") — it
// satisfies Clerk's publishable-key format check without a live instance
// behind it.
process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||= 'pk_test_ZXhhbXBsZS5jbGVyay5hY2NvdW50cy5kZXYk'

/** @type {import('next').NextConfig} */
const nextConfig = {}

module.exports = nextConfig


// Injected content via Sentry wizard below

const { withSentryConfig } = require("@sentry/nextjs");

module.exports = withSentryConfig(module.exports, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "long-tail-studio",
  project: "admitday",

  // Authentication token for uploading source maps
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/sourcemaps/
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Source map upload configuration
  // Deletes source maps from the build output after uploading to Sentry,
  // so they are not publicly served (keeping stack traces readable only in Sentry).
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

});
