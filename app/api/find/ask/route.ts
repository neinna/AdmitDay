/**
 * app/api/find/ask/route.ts
 *
 * RAG-powered ask endpoint for the /find page.
 * Takes a user question, retrieves the most relevant schools
 * from the vector store, and passes them to Claude to generate
 * a grounded answer.
 */

import { randomUUID, createHash } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import * as Sentry from "@sentry/nextjs";
import { NextRequest } from "next/server";
import { searchSchools } from "@/lib/rag";
import { checkRateLimit } from "@/lib/rate-limit";
import { classifyProviderError } from "@/lib/provider-error";
import { recordLlmTrace } from "@/lib/trace";
import { estimateCostUsd } from "@/lib/model-cost";

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  anthropicClient ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return anthropicClient;
}

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

  const { question } = await request.json();

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

  try {
    // Step 1: Retrieve the top 5 most relevant schools
    const results = await searchSchools(question, 5);

    // Step 2: Build context from retrieved schools
    // Each result already contains all chunks for that school, concatenated.
    const schoolContext = results
      .map(
        (r, i) =>
          `--- School ${i + 1} (similarity: ${r.score.toFixed(3)}, matched on: ${r.matchedChunkType}) ---\n${r.chunk}`
      )
      .join("\n\n");

    // Step 3: Send to Claude with the retrieved context
    const message = await getAnthropicClient().messages.create({
      model: "claude-sonnet-5",
      max_tokens: 600,
      system:
        "You are an experienced NYC high school admissions consultant. Answer the parent's question using ONLY the school information provided below.\n\nFor each school provided, state the school name, then 1-2 sentences about why it is relevant to the parent's question. Mention concrete details and numbers when available. Describe every school provided. Do not skip any.\n\nUse only facts from the provided context. Never say 'appears to', 'seems to', or other hedging language. If a specific detail is not stated in the context, say it is not listed. Do not make up information about schools.\n\nAfter describing all schools, provide a 1-2 sentence summary.",
      messages: [
        {
          role: "user",
          content:
            `Here are the most relevant schools for this question:\n\n${schoolContext}\n\n` +
            `Parent's question: ${question}`,
        },
      ],
    });

    const answer =
      message.content[0].type === "text" ? message.content[0].text : "";

    // Built once so the id returned to the client and the id attached to
    // the Langfuse trace below are the same value — that join is what lets
    // a rating (issue #195) land on the trace that earned it. traceId is a
    // fresh, content-free correlation id; client-side analytics (ask_answered,
    // issue #196) reports it alongside latency so a slow or odd-looking
    // answer in PostHog can be traced back to this request.
    const responseBody = {
      answer,
      sources: results.map((r) => ({
        name: r.name,
        dbn: r.dbn,
        borough: r.borough,
        score: r.score,
        matchedOn: r.matchedChunkType,
      })),
      traceId: randomUUID(),
    };

    recordLlmTrace({
      route: "find_ask",
      sessionId,
      traceId: responseBody.traceId,
      questionLength,
      questionHash,
      retrieval: results.map((r) => ({
        dbn: r.dbn,
        score: r.score,
        matchedChunkType: r.matchedChunkType,
      })),
      model: message.model,
      inputTokens: message.usage?.input_tokens,
      outputTokens: message.usage?.output_tokens,
      latencyMs: Date.now() - startedAt,
      costUsd: estimateCostUsd(message.model, message.usage?.input_tokens, message.usage?.output_tokens),
      outcome: "ok",
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
