import { BasicTracerProvider } from "@opentelemetry/sdk-trace-base";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { setLangfuseTracerProvider } from "@langfuse/tracing";

// Langfuse gets its own tracer provider so Sentry's 10% trace sampling does not
// apply. Never register this provider globally: Sentry owns the global one.
let initialised = false;
let result = false;
let processor: LangfuseSpanProcessor | undefined;

export function initLangfuseTracing(): boolean {
  if (initialised) return result;
  const publicKey = process.env.LANGFUSE_APP_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_APP_SECRET_KEY;
  if (!publicKey || !secretKey) return false;
  initialised = true;
  try {
    const created = new LangfuseSpanProcessor({
      publicKey,
      secretKey,
      baseUrl: process.env.LANGFUSE_APP_HOST || undefined,
      exportMode: "immediate",
    });
    const provider = new BasicTracerProvider({ spanProcessors: [created] });
    setLangfuseTracerProvider(provider);
    processor = created;
    result = true;
  } catch (err) {
    console.warn(
      "[langfuse-otel] init failed:",
      err instanceof Error ? err.message : String(err)
    );
    result = false;
  }
  return result;
}

export async function forceFlushLangfuse(): Promise<void> {
  try {
    await processor?.forceFlush();
  } catch {
    // telemetry must never break a request
  }
}
