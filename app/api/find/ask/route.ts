/**
 * app/api/find/ask/route.ts
 *
 * RAG-powered ask endpoint for the /find page.
 * Takes a user question, retrieves the most relevant schools
 * from the vector store, and passes them to Claude to generate
 * a grounded answer.
 */

import { randomUUID, createHash } from "crypto";
import * as Sentry from "@sentry/nextjs";
import { NextRequest } from "next/server";
import { HardFilters } from "@/lib/rag";
import { checkRateLimit } from "@/lib/rate-limit";
import { classifyProviderError } from "@/lib/provider-error";
import { recordLlmTrace } from "@/lib/trace";
import { estimateCostUsd } from "@/lib/model-cost";
import { MAX_QUESTION_LENGTH, TOO_LONG } from "@/lib/ask-guardrails";
import { answerQuestion } from "@/lib/ask";

// Anonymous, per-request identifier for the Langfuse trace only — never
// used for anything that affects the response. Prefers the client's
// existing PostHog distinct id (if it chooses to send one) so a family's
// asks group together in Langfuse; otherwise a fresh uuid per request.
function getSessionId(request: NextRequest): string {
  return request.headers.get("x-posthog-distinct-id") || randomUUID();
}

function hashQuestion(question: string): string {
  return createHash("sha256").update(question).digest("hex").slice(0, 16);
}

// The /find rail's active borough/track/size filters (lib/school-list-utils.ts
// FindFilters), sent alongside the question so retrieval never draws on a
// school outside them (issue #231). Untrusted request input, so each field is
// coerced to the expected shape rather than assumed.
function parseHardFilters(value: unknown): HardFilters {
  const v = (value ?? {}) as Record<string, unknown>;
  const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : []);
  return {
    boroughs: strings(v.boroughs),
    tracks: strings(v.tracks),
    size: typeof v.size === "string" ? v.size : undefined,
  };
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const sessionId = getSessionId(request);

  const rl = await checkRateLimit(request);
  if (!rl.ok) {
    recordLlmTrace({
      route: "find_ask",
      sessionId,
      latencyMs: Date.now() - startedAt,
      outcome: "rate_limited",
    });
    return Response.json(
      { error: "You're sending requests too quickly — please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const { question, filters } = await request.json();
  const hardFilters = parseHardFilters(filters);

  if (!question || typeof question !== "string") {
    recordLlmTrace({
      route: "find_ask",
      sessionId,
      latencyMs: Date.now() - startedAt,
      outcome: "bad_request",
    });
    return Response.json({ error: "question is required" }, { status: 400 });
  }

  const questionLength = question.length;
  const questionHash = hashQuestion(question);

  if (questionLength > MAX_QUESTION_LENGTH) {
    recordLlmTrace({
      route: "find_ask",
      sessionId,
      questionLength,
      questionHash,
      latencyMs: Date.now() - startedAt,
      outcome: "bad_request",
      guardrail: "too_long",
    });
    return Response.json({ error: TOO_LONG }, { status: 400 });
  }

  try {
    const { answer, guardrail, retrieved, sources, reasons, model, usage, stopReason, contentBlockTypes } =
      await answerQuestion({ question, filters: hardFilters });

    // Built once so the id returned to the client and the id attached to
    // the Langfuse trace below are the same value — that join is what lets
    // a rating (issue #195) land on the trace that earned it. traceId is a
    // fresh, content-free correlation id; client-side analytics (ask_answered,
    // issue #196) reports it alongside latency so a slow or odd-looking
    // answer in PostHog can be traced back to this request.
    const responseBody = {
      answer,
      sources: sources.map((r) => ({
        name: r.name,
        dbn: r.dbn,
        borough: r.borough,
        score: r.score,
        matchedOn: r.matchedChunkType,
      })),
      reasons,
      traceId: randomUUID(),
    };

    recordLlmTrace({
      route: "find_ask",
      sessionId,
      traceId: responseBody.traceId,
      questionLength,
      questionHash,
      retrieval: retrieved.map((r) => ({
        dbn: r.dbn,
        score: r.score,
        matchedChunkType: r.matchedChunkType,
      })),
      model,
      inputTokens: usage?.input_tokens,
      outputTokens: usage?.output_tokens,
      latencyMs: Date.now() - startedAt,
      costUsd: estimateCostUsd(model, usage?.input_tokens, usage?.output_tokens),
      // Issue #354: a usage-limit hit answers successfully (PROVIDER_LIMIT +
      // sources) so it never reaches the catch block below, but it must
      // still show up distinctly from an ordinary "ok" answer in Langfuse.
      outcome: guardrail === "provider_limit" ? "provider_limit" : "ok",
      guardrail,
      stopReason,
      contentBlockTypes,
    });

    return Response.json(responseBody);
  } catch (err) {
    // Log the real error (vendor detail, status, request id) to Sentry —
    // never let any part of it reach the client.
    Sentry.captureException(err);
    const { status, body, classification } = classifyProviderError(err);
    recordLlmTrace({
      route: "find_ask",
      sessionId,
      questionLength,
      questionHash,
      latencyMs: Date.now() - startedAt,
      outcome: classification === "rate_limited" ? "rate_limited" : "provider_error",
      errorClassification: classification,
    });
    return Response.json(body, { status });
  }
}
