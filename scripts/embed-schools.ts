/**
 * embed-schools.ts
 *
 * Ingestion script for ListReady RAG.
 * Reads schools.json, converts each school record into a text chunk,
 * embeds it using OpenAI's text-embedding-3-small, and saves the
 * vectors + metadata to data/school-embeddings.json.
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

interface SchoolEmbedding {
  dbn: string;
  name: string;
  borough: string;
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
// Convert a school record into readable text for embedding
// ---------------------------------------------------------------------------

function schoolToChunk(school: School): string {
  const d = school.doe_data;
  const f = school.flags;

  // Convert flags to readable sentences
  const flagSentences: string[] = [];
  if (f.has_shsat) flagSentences.push("This is a specialized high school that requires the SHSAT exam.");
  if (f.has_audition) flagSentences.push("This school requires an audition for admission.");
  if (f.has_screened) flagSentences.push("This school uses a screened admissions process.");
  if (f.has_open) flagSentences.push("This school has open admissions.");
  if (f.has_borough_priority) flagSentences.push("This school gives priority to students from its borough.");
  if (f.is_hidden_gem) flagSentences.push("This school is considered a hidden gem.");
  if (f.has_consortium) flagSentences.push("This school is part of the NYC Performance Standards Consortium.");
  if (f.has_ib) flagSentences.push("This school offers the International Baccalaureate (IB) program.");

  // Build the chunk as readable text
  const parts: string[] = [];

  parts.push(`${school.name} is a ${school.size} high school in ${school.borough}, located in the ${d.neighborhood || "N/A"} neighborhood.`);
  parts.push(`It has ${school.total_students} students with an applicants-per-seat ratio of ${school.applicants_per_seat}.`);

  if (school.admissions_types.length > 0) {
    parts.push(`Admissions methods: ${school.admissions_types.join(", ")}.`);
  }

  if (flagSentences.length > 0) {
    parts.push(flagSentences.join(" "));
  }

  if (d.overview) {
    parts.push(`Overview: ${d.overview}`);
  }

  if (d.interests.length > 0) {
    parts.push(`Focus areas: ${d.interests.join(", ")}.`);
  }

  if (d.academic_opportunities) {
    parts.push(`Academic opportunities: ${d.academic_opportunities}`);
  }

  if (d.advancedplacement_courses) {
    parts.push(`AP courses: ${d.advancedplacement_courses}`);
  }

  if (d.extracurriculars) {
    parts.push(`Extracurriculars: ${d.extracurriculars}`);
  }

  if (d.prgdesc) {
    parts.push(`Program description: ${d.prgdesc}`);
  }

  // Sports
  const sports: string[] = [];
  if (d.psal_sports_boys) sports.push(`Boys: ${d.psal_sports_boys}`);
  if (d.psal_sports_girls) sports.push(`Girls: ${d.psal_sports_girls}`);
  if (d.psal_sports_coed) sports.push(`Coed: ${d.psal_sports_coed}`);
  if (sports.length > 0) {
    parts.push(`Sports: ${sports.join(". ")}`);
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

  if (d.addtl_info) {
    parts.push(`Additional info: ${d.addtl_info}`);
  }

  return parts.join("\n");
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

  // Convert to text chunks
  const chunks = schools.map(schoolToChunk);
  console.log(`Sample chunk (first school):\n---\n${chunks[0]}\n---\n`);

  // Embed in batches of 100
  const batchSize = 100;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    console.log(`Embedding batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunks.length / batchSize)}...`);
    const embeddings = await embedBatch(batch);
    allEmbeddings.push(...embeddings);
  }

  // Build output
  const output: SchoolEmbedding[] = schools.map((school, i) => ({
    dbn: school.dbn,
    name: school.name,
    borough: school.borough,
    chunk: chunks[i],
    embedding: allEmbeddings[i],
    metadata: {
      size: school.size,
      total_students: school.total_students,
      applicants_per_seat: school.applicants_per_seat,
      academic_score_pct: school.academic_score_pct,
      neighborhood: school.doe_data.neighborhood,
      admissions_types: school.admissions_types,
      interests: school.doe_data.interests,
      flags: school.flags,
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
