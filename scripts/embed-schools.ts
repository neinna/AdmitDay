/**
 * embed-schools.ts
 *
 * Ingestion script for AdmitDay RAG.
 * Reads schools.json, converts each school record into one or more
 * semantic text chunks, embeds them using OpenAI's text-embedding-3-small,
 * and saves the vectors + metadata to data/school-embeddings.json.
 *
 * Chunking strategy:
 * - Schools with total chunk text <= 800 chars: one "full" chunk.
 * - Schools with total chunk text > 800 chars: split into up to 3 chunks:
 *     1. "identity" — name, borough, size, students, admissions, flags, interests, stats
 *     2. "academics" — overview, academic opportunities, AP courses, program description
 *     3. "activities" — extracurriculars, sports, additional info
 *   Each chunk is prefixed with a short identity line so it can stand alone.
 *   Chunks are only created if they have content beyond the prefix.
 *
 * Run once (or whenever schools.json changes):
 *   npx ts-node scripts/embed-schools.ts
 *
 * Requires: OPENAI_API_KEY in .env.local
 */

import fs from "fs";
import path from "path";
import OpenAI from "openai";
import dotenv from "dotenv";

// Load env vars from .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CHUNK_THRESHOLD = 800;

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

interface DoeData {
  overview: string;
  language: string;
  extracurriculars: string;
  academic_opportunities: string;
  prgdesc: string;
  interests: string[];
  graduation_rate: number | null;
  attendance_rate: number | null;
  college_career_rate: number | null;
  advancedplacement_courses: string;
  neighborhood: string;
  address: string;
  zip: string;
  subway: string;
  bus: string;
  psal_sports_boys: string;
  psal_sports_girls: string;
  psal_sports_coed: string;
  addtl_info: string;
  [key: string]: unknown;
}

interface School {
  dbn: string;
  name: string;
  borough: string;
  size: string;
  total_students: number;
  applicants_per_seat: number;
  academic_score_pct: number;
  survey_score_pct: number | null;
  admissions_types: string[];
  flags: SchoolFlags;
  doe_data: DoeData;
  sift_url: string;
  shsat_cutoff_score: number | null;
  [key: string]: unknown;
}

export interface SchoolEmbedding {
  dbn: string;
  name: string;
  borough: string;
  chunkType: "full" | "identity" | "academics" | "activities";
  chunk: string;
  embedding: number[];
  metadata: {
    size: string;
    total_students: number;
    applicants_per_seat: number;
    academic_score_pct: number;
    neighborhood: string;
    admissions_types: string[];
    interests: string[];
    flags: SchoolFlags;
  };
}

// ---------------------------------------------------------------------------
// Build chunk parts
// ---------------------------------------------------------------------------

/**
 * Identity prefix: short line that goes at the top of every chunk
 * so each chunk can stand alone in retrieval results.
 */
function identityPrefix(school: School): string {
  return `${school.name} is a ${school.size} high school in ${school.borough}.`;
}

/**
 * Identity chunk: the "who is this school" content.
 * Includes all structured facts, flags, stats, admissions, transit.
 */
function buildIdentityParts(school: School): string[] {
  const d = school.doe_data;
  const f = school.flags;
  const parts: string[] = [];

  parts.push(
    `${school.name} is a ${school.size} high school in ${school.borough}, located in the ${d.neighborhood || "N/A"} neighborhood.`
  );
  parts.push(
    `It has ${school.total_students} students with an applicants-per-seat ratio of ${school.applicants_per_seat}.`
  );

  if (school.admissions_types.length > 0) {
    parts.push(`Admissions methods: ${school.admissions_types.join(", ")}.`);
  }

  // Flags
  const flagSentences: string[] = [];
  if (f.has_shsat) flagSentences.push("This is a specialized high school that requires the SHSAT exam.");
  if (f.has_audition) flagSentences.push("This school requires an audition for admission.");
  if (f.has_screened) flagSentences.push("This school uses a screened admissions process.");
  if (f.has_open) flagSentences.push("This school has open admissions.");
  if (f.has_borough_priority) flagSentences.push("This school gives priority to students from its borough.");
  if (f.is_hidden_gem) flagSentences.push("This school is considered a hidden gem.");
  if (f.has_consortium) flagSentences.push("This school is part of the NYC Performance Standards Consortium.");
  if (f.has_ib) flagSentences.push("This school offers the International Baccalaureate (IB) program.");
  if (flagSentences.length > 0) {
    parts.push(flagSentences.join(" "));
  }

  if (d.interests.length > 0) {
    parts.push(`Focus areas: ${d.interests.join(", ")}.`);
  }

  // Stats
  const stats: string[] = [];
  if (d.graduation_rate != null) stats.push(`graduation rate ${Math.round(d.graduation_rate * 100)}%`);
  if (d.attendance_rate != null) stats.push(`attendance rate ${Math.round(d.attendance_rate * 100)}%`);
  if (d.college_career_rate != null) stats.push(`college/career readiness ${Math.round(d.college_career_rate * 100)}%`);
  if (stats.length > 0) {
    parts.push(`Key stats: ${stats.join(", ")}.`);
  }

  // Transit
  if (d.subway) parts.push(`Subway: ${d.subway}`);

  return parts;
}

/**
 * Academics chunk: overview, academic opportunities, AP courses, program description.
 */
function buildAcademicsParts(school: School): string[] {
  const d = school.doe_data;
  const parts: string[] = [];

  if (d.overview) parts.push(`Overview: ${d.overview}`);
  if (d.academic_opportunities) parts.push(`Academic opportunities: ${d.academic_opportunities}`);
  if (d.advancedplacement_courses) parts.push(`AP courses: ${d.advancedplacement_courses}`);
  if (d.prgdesc) parts.push(`Program description: ${d.prgdesc}`);

  return parts;
}

/**
 * Activities chunk: extracurriculars, sports, additional info.
 */
function buildActivitiesParts(school: School): string[] {
  const d = school.doe_data;
  const parts: string[] = [];

  if (d.extracurriculars) parts.push(`Extracurriculars: ${d.extracurriculars}`);

  const sports: string[] = [];
  if (d.psal_sports_boys) sports.push(`Boys: ${d.psal_sports_boys}`);
  if (d.psal_sports_girls) sports.push(`Girls: ${d.psal_sports_girls}`);
  if (d.psal_sports_coed) sports.push(`Coed: ${d.psal_sports_coed}`);
  if (sports.length > 0) {
    parts.push(`Sports: ${sports.join(". ")}`);
  }

  if (d.addtl_info) parts.push(`Additional info: ${d.addtl_info}`);

  return parts;
}

// ---------------------------------------------------------------------------
// Convert a school record into one or more chunks
// ---------------------------------------------------------------------------

interface ChunkResult {
  chunkType: "full" | "identity" | "academics" | "activities";
  chunk: string;
}

function schoolToChunks(school: School): ChunkResult[] {
  // Build the full text first to check length
  const identityParts = buildIdentityParts(school);
  const academicsParts = buildAcademicsParts(school);
  const activitiesParts = buildActivitiesParts(school);

  const allParts = [...identityParts, ...academicsParts, ...activitiesParts];
  const fullText = allParts.join("\n");

  // Small school: one chunk
  if (fullText.length <= CHUNK_THRESHOLD) {
    return [{ chunkType: "full", chunk: fullText }];
  }

  // Large school: split into semantic chunks, each prefixed with identity line
  const prefix = identityPrefix(school);
  const chunks: ChunkResult[] = [];

  // Identity chunk always exists
  chunks.push({
    chunkType: "identity",
    chunk: identityParts.join("\n"),
  });

  // Academics chunk: only if there's content
  if (academicsParts.length > 0) {
    chunks.push({
      chunkType: "academics",
      chunk: prefix + "\n" + academicsParts.join("\n"),
    });
  }

  // Activities chunk: only if there's content
  if (activitiesParts.length > 0) {
    chunks.push({
      chunkType: "activities",
      chunk: prefix + "\n" + activitiesParts.join("\n"),
    });
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Embed in batches (OpenAI supports up to 2048 inputs per call)
// ---------------------------------------------------------------------------

async function embedBatch(texts: string[]): Promise<number[][]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: texts,
  });
  return response.data.map((item) => item.embedding);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Load schools
  const schoolsPath = path.resolve(process.cwd(), "schools.json");
  if (!fs.existsSync(schoolsPath)) {
    console.error("schools.json not found in project root.");
    process.exit(1);
  }

  const schools: School[] = JSON.parse(fs.readFileSync(schoolsPath, "utf-8"));
  console.log(`Loaded ${schools.length} schools.`);

  // Convert to chunks (one or more per school)
  const allChunkData: {
    school: School;
    chunkType: "full" | "identity" | "academics" | "activities";
    chunk: string;
  }[] = [];

  let singleChunkCount = 0;
  let multiChunkCount = 0;

  for (const school of schools) {
    const chunks = schoolToChunks(school);
    if (chunks.length === 1) {
      singleChunkCount++;
    } else {
      multiChunkCount++;
    }
    for (const c of chunks) {
      allChunkData.push({ school, chunkType: c.chunkType, chunk: c.chunk });
    }
  }

  console.log(`${singleChunkCount} schools with 1 chunk, ${multiChunkCount} schools split into multiple chunks.`);
  console.log(`Total chunks to embed: ${allChunkData.length}`);

  // Show a sample split school
  const sampleSplit = allChunkData.filter((c) => c.chunkType !== "full");
  if (sampleSplit.length > 0) {
    const sampleName = sampleSplit[0].school.name;
    const sampleChunks = allChunkData.filter((c) => c.school.name === sampleName);
    console.log(`\nSample split school: ${sampleName}`);
    for (const c of sampleChunks) {
      console.log(`  [${c.chunkType}] ${c.chunk.length} chars`);
    }
  }

  // Embed in batches of 100
  const batchSize = 100;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < allChunkData.length; i += batchSize) {
    const batch = allChunkData.slice(i, i + batchSize).map((c) => c.chunk);
    console.log(
      `Embedding batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(allChunkData.length / batchSize)}...`
    );
    const embeddings = await embedBatch(batch);
    allEmbeddings.push(...embeddings);
  }

  // Build output
  const output: SchoolEmbedding[] = allChunkData.map((c, i) => ({
    dbn: c.school.dbn,
    name: c.school.name,
    borough: c.school.borough,
    chunkType: c.chunkType,
    chunk: c.chunk,
    embedding: allEmbeddings[i],
    metadata: {
      size: c.school.size,
      total_students: c.school.total_students,
      applicants_per_seat: c.school.applicants_per_seat,
      academic_score_pct: c.school.academic_score_pct,
      neighborhood: c.school.doe_data.neighborhood,
      admissions_types: c.school.admissions_types,
      interests: c.school.doe_data.interests,
      flags: c.school.flags,
    },
  }));

  // Save
  const outputDir = path.resolve(process.cwd(), "data");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, "school-embeddings.json");
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`\nSaved ${output.length} embeddings to ${outputPath}`);
  console.log(`File size: ${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(1)} MB`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
