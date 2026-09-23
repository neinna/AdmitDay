// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

// Only Vercel deployments should report to Sentry. Without this guard, the
// coding agent's own VPS checkout — which deliberately has no secrets (#232)
// and throws on every run — reports those throws into the production project.
// NEXT_PUBLIC_VERCEL_ENV is the client-bundle-safe mirror of VERCEL_ENV; plain
// VERCEL isn't inlined into the browser bundle.
if (process.env.NEXT_PUBLIC_VERCEL_ENV) {
  Sentry.init({
    dsn: "https://50b3b81955c8e03faf9108c48d32b64a@o4511185594744832.ingest.us.sentry.io/4511185656741888",

    // Vercel sets NODE_ENV to "production" for preview deploys too, so without
    // this, preview and production events are indistinguishable in Sentry.
    // VERCEL_ENV itself isn't in the browser bundle (only NEXT_PUBLIC_* vars
    // and NODE_ENV are) — Vercel mirrors it as NEXT_PUBLIC_VERCEL_ENV for
    // exactly this case.
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,

    // Add optional integrations for additional features
    // Replay masking is pinned explicitly rather than left to the SDK default.
    // These are the defaults today, but this product records sessions of parents
    // researching schools for their children: the masking must be a stated
    // decision in this file, not an inherited one that a future SDK upgrade or a
    // copy-pasted config could silently flip.
    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
      }),
    ],

    // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
    tracesSampleRate: 1,
    // Enable logs to be sent to Sentry
    enableLogs: true,

    // Define how likely Replay events are sampled.
    // This sets the sample rate to be 10%. You may want this to be 100% while
    // in development and sample at a lower rate in production
    replaysSessionSampleRate: 0.1,

    // Define how likely Replay events are sampled when an error occurs.
    replaysOnErrorSampleRate: 1.0,

    // PII is deliberately NOT sent. AdmitDay is used by parents applying on
    // behalf of minors, and accounts (#179) will add real names and emails to the
    // browser session. Attaching IPs and user context to every client event would
    // put that in a third-party error store for no debugging benefit we need.
    // Matches sentry.server.config.ts, which already sets this to false.
    sendDefaultPii: false,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
