/**
 * rag.ts
 *
 * RAG search module for ListReady.
 * Loads pre-computed school embeddings into memory,
 * embeds a user query via OpenAI, and returns the
 * most similar schools using cosine similarity.
 *
 * Place at: lib/rag.ts
 */

import fs from "fs";
import path from "path";
import OpenAI from "openai";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SchoolFlags {
  has_shsat: boolean;
  has_audition: boolean;
  has_screened: boolean;
  has_open: boolean;
  has_borough_priority: boolean;
  is_hidden_gem: boolean;
  has_consortium: boolean;
  has_ib: boolean;
}

interface SchoolMetadata {
  size: string;
  total_students: number;
  applicants_per_seat: number;
  academic_score_pct: number;
  neighborhood: string;
  admissions_types: string[];
  interests: string[];
  flags: SchoolFlags;
}

interface SchoolEmbedding {
  dbn: string;
  name: string;
  borough: string;
  chunk: string;
  embedding: number[];
  metadata: SchoolMetadata;
}

export interface SearchResult {
  dbn: string;
  name: string;
  borough: string;
  chunk: string;
  metadata: SchoolMetadata;
  score: number;
}

// ---------------------------------------------------------------------------
// Cosine similarity
// ---------------------------------------------------------------------------

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ---------------------------------------------------------------------------
// Load embeddings (cached in memory after first load)
// ---------------------------------------------------------------------------

let cachedEmbeddings: SchoolEmbedding[] | null = null;

function loadEmbeddings(): SchoolEmbedding[] {
  if (cachedEmbeddings) return cachedEmbeddings;

  const filePath = path.resolve(process.cwd(), "data", "school-embeddings.json");
  if (!fs.existsSync(filePath)) {
    throw new Error("school-embeddings.json not found. Run scripts/embed-schools.ts first.");
  }

  cachedEmbeddings = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  console.log(`Loaded ${cachedEmbeddings!.length} school embeddings into memory.`);
  return cachedEmbeddings!;
}

// ---------------------------------------------------------------------------
// Search: embed query, find top matches
// ---------------------------------------------------------------------------

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function searchSchools(
  query: string,
  topK: number = 5
): Promise<SearchResult[]> {
  // Embed the user's query
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
  });
  const queryEmbedding = response.data[0].embedding;

  // Load school embeddings
  const schools = loadEmbeddings();

  // Score every school against the query
  const scored = schools.map((school) => ({
    dbn: school.dbn,
    name: school.name,
    borough: school.borough,
    chunk: school.chunk,
    metadata: school.metadata,
    score: cosineSimilarity(queryEmbedding, school.embedding),
  }));

  // Sort by similarity (highest first) and return top K
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}
