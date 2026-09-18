/**
 * app/api/find/feedback/route.ts
 *
 * Attaches a user rating (thumbs up/down) to the Langfuse trace of the
 * ask answer it was given on — the join that makes an eval set possible
 * later (issue #195). Pure observability, same discipline as lib/trace.ts:
 * a failed score write never surfaces to the user.
 */

import { NextRequest } from "next/server";
import { recordLlmFeedback, FeedbackRating } from "@/lib/trace";

function isFeedbackRating(value: unknown): value is FeedbackRating {
  return value === "up" || value === "down";
}

export async function POST(request: NextRequest) {
  const { traceId, rating } = await request.json();

  if (typeof traceId !== "string" || !traceId || !isFeedbackRating(rating)) {
    return Response.json({ error: "traceId and rating are required" }, { status: 400 });
  }

  recordLlmFeedback({ traceId, rating });

  return Response.json({ ok: true });
}
