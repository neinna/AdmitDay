/**
 * app/api/chat/route.ts
 *
 * RAG-powered chat endpoint for AdmitDay.
 * Takes a user question, retrieves the most relevant schools
 * from the vector store, and passes them to Claude to generate
 * a grounded answer.
 */

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { searchSchools } from "@/lib/rag";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: NextRequest) {
  const { question } = await request.json();

  if (!question || typeof question !== "string") {
    return Response.json({ error: "question is required" }, { status: 400 });
  }

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
  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
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

  // Return the answer and the schools that were retrieved (for transparency)
  return Response.json({
    answer,
    sources: results.map((r) => ({
      name: r.name,
      dbn: r.dbn,
      borough: r.borough,
      score: r.score,
      matchedOn: r.matchedChunkType,
    })),
  });
}
