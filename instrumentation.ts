import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Guard against null errors passed by Next.js internals (e.g. 405 handling for
// POST requests on statically pre-rendered pages calls renderError(null, ...),
// which propagates null into createErrorHandler and causes:
//   TypeError: Cannot read properties of null (reading 'digest')
// Filtering null here prevents that false-positive from being reported.
export const onRequestError: typeof Sentry.captureRequestError = (
  err,
  request,
  context
) => {
  if (err == null) return;
  return Sentry.captureRequestError(err, request, context);
};
