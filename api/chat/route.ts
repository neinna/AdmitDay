/**
 * app/api/chat/route.ts
 *
 * RAG-powered chat endpoint for ListReady.
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
  const schoolContext = results
    .map((r, i) => `--- School ${i + 1} (similarity: ${r.score.toFixed(3)}) ---\n${r.chunk}`)
    .join("\n\n");

  // Step 3: Send to Claude with the retrieved context
  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 600,
    system:
      "You are a helpful NYC high school admissions assistant. " +
      "Answer the parent's question using ONLY the school information provided below. " +
      "If the information does not contain enough detail to answer, say so honestly. " +
      "Do not make up information about schools. " +
      "Be specific: mention school names, concrete details, and numbers when available. " +
      "Keep your answer concise, 3-5 sentences unless the question requires more detail.",
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
    })),
  });
}
