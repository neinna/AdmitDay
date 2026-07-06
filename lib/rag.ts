/**
 * rag.ts
 *
 * RAG search module for AdmitDay.
 * Loads pre-computed school embeddings into memory,
 * embeds a user query via OpenAI, and returns the
 * most similar schools using cosine similarity.
 *
 * With semantic chunking, a school may have multiple chunks
 * (identity, academics, activities). Search scores all chunks,
 * deduplicates by school (DBN), ranks by best-scoring chunk,
 * and returns ALL chunks for each winning school so Claude
 * gets the full picture.
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
  chunkType: "full" | "identity" | "academics" | "activities";
  chunk: string;
  embedding: number[];
  metadata: SchoolMetadata;
}

export interface SearchResult {
  dbn: string;
  name: string;
  borough: string;
  /** All chunks for this school, concatenated. Claude sees the full picture. */
  chunk: string;
  metadata: SchoolMetadata;
  /** Cosine similarity of the best-matching chunk for this school. */
  score: number;
  /** Which chunk type scored highest for this school. */
  matchedChunkType: string;
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
    throw new Error(
      "school-embeddings.json not found. Run scripts/embed-schools.ts first."
    );
  }

  cachedEmbeddings = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  console.log(`Loaded ${cachedEmbeddings!.length} chunk embeddings into memory.`);
  return cachedEmbeddings!;
}

// ---------------------------------------------------------------------------
// Search: embed query, find top matches, deduplicate by school
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

  // Load all chunk embeddings
  const allChunks = loadEmbeddings();

  // Score every chunk against the query
  const scored = allChunks.map((entry) => ({
    ...entry,
    score: cosineSimilarity(queryEmbedding, entry.embedding),
  }));

  // Group by school (DBN). For each school, track:
  // - the highest score and which chunk type produced it
  // - all chunks (so we can concatenate them for Claude)
  const schoolMap = new Map<
    string,
    {
      dbn: string;
      name: string;
      borough: string;
      metadata: SchoolMetadata;
      bestScore: number;
      matchedChunkType: string;
      chunks: { chunkType: string; chunk: string; score: number }[];
    }
  >();

  for (const entry of scored) {
    const existing = schoolMap.get(entry.dbn);
    if (!existing) {
      schoolMap.set(entry.dbn, {
        dbn: entry.dbn,
        name: entry.name,
        borough: entry.borough,
        metadata: entry.metadata,
        bestScore: entry.score,
        matchedChunkType: entry.chunkType,
        chunks: [{ chunkType: entry.chunkType, chunk: entry.chunk, score: entry.score }],
      });
    } else {
      existing.chunks.push({ chunkType: entry.chunkType, chunk: entry.chunk, score: entry.score });
      if (entry.score > existing.bestScore) {
        existing.bestScore = entry.score;
        existing.matchedChunkType = entry.chunkType;
      }
    }
  }

  // Sort schools by best chunk score, take top K
  const ranked = Array.from(schoolMap.values());
  ranked.sort((a, b) => b.bestScore - a.bestScore);
  const topSchools = ranked.slice(0, topK);

  // Build results: concatenate all chunks per school in a logical order
  const chunkOrder = ["identity", "full", "academics", "activities"];

  return topSchools.map((school) => {
    // Sort chunks by the defined order
    const sortedChunks = school.chunks.sort(
      (a, b) => chunkOrder.indexOf(a.chunkType) - chunkOrder.indexOf(b.chunkType)
    );

    // For "full" type (single-chunk schools), just use the one chunk.
    // For multi-chunk schools, concatenate all chunks with a separator.
    const combinedChunk = sortedChunks.map((c) => c.chunk).join("\n\n");

    return {
      dbn: school.dbn,
      name: school.name,
      borough: school.borough,
      chunk: combinedChunk,
      metadata: school.metadata,
      score: school.bestScore,
      matchedChunkType: school.matchedChunkType,
    };
  });
}
