// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://50b3b81955c8e03faf9108c48d32b64a@o4511185594744832.ingest.us.sentry.io/4511185656741888",

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,

  // Filter out a false-positive error from Next.js internals:
  // When a POST request hits a statically pre-rendered page (e.g. form submit
  // before JS hydrates), Next.js calls renderError(null, …) for the 405
  // response. The null propagates into createErrorHandler which does
  // `if (!err.digest)` and throws:
  //   TypeError: Cannot read properties of null (reading 'digest')
  // This is a Next.js bug — the stack trace contains no app code — so we
  // drop these events rather than alerting on them.
  beforeSend(event, hint) {
    const err = hint?.originalException;
    if (
      err instanceof TypeError &&
      err.message === "Cannot read properties of null (reading 'digest')"
    ) {
      return null;
    }
    return event;
  },
});
