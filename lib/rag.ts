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
import { extractFilters, hasFilters, QueryFilters } from "./query-filters";

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
// Deterministic pre-filter (roadmap #72 item 6): restrict the candidate pool
// by borough/sport/interest signals extracted from the question, before the
// existing semantic ranking runs within that pool.
// ---------------------------------------------------------------------------

function includesWord(haystack: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(haystack);
}

function schoolMatchesFilters(entries: SchoolEmbedding[], filters: QueryFilters): boolean {
  const { borough, metadata } = entries[0];

  if (filters.borough && borough !== filters.borough) return false;

  if (filters.sports.length > 0 || filters.interests.length > 0) {
    const combinedText = entries.map((e) => e.chunk).join(" ");
    const interestsList = metadata.interests ?? [];

    if (
      filters.sports.length > 0 &&
      !filters.sports.some((sport) => includesWord(combinedText, sport))
    ) {
      return false;
    }

    if (
      filters.interests.length > 0 &&
      !filters.interests.some(
        (interest) =>
          includesWord(combinedText, interest) ||
          interestsList.some((i) => includesWord(i, interest))
      )
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Restricts chunks to schools matching the deterministic filters. Falls back
 * to the full candidate pool if the filters match zero schools, so an
 * overly-specific extraction can't zero out retrieval entirely.
 */
function applyDeterministicFilters(
  chunks: SchoolEmbedding[],
  filters: QueryFilters
): SchoolEmbedding[] {
  if (!hasFilters(filters)) return chunks;

  const byDbn = new Map<string, SchoolEmbedding[]>();
  for (const entry of chunks) {
    const group = byDbn.get(entry.dbn);
    if (group) group.push(entry);
    else byDbn.set(entry.dbn, [entry]);
  }

  const matchingDbns = new Set(
    Array.from(byDbn.entries())
      .filter(([, entries]) => schoolMatchesFilters(entries, filters))
      .map(([dbn]) => dbn)
  );

  if (matchingDbns.size === 0) return chunks;
  return chunks.filter((entry) => matchingDbns.has(entry.dbn));
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

  // Load all chunk embeddings, then restrict to schools matching any
  // deterministic filters (borough/sport/interest) extracted from the query.
  const allChunks = loadEmbeddings();
  const filters = extractFilters(query);
  const candidateChunks = applyDeterministicFilters(allChunks, filters);

  // Score every candidate chunk against the query
  const scored = candidateChunks.map((entry) => ({
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
