/**
 * check-chunks.ts
 *
 * One-time diagnostic for the RAG embeddings store.
 * - Finds entries whose name contains "Brooklyn Technical" or "Brooklyn Tech"
 *   and prints how many chunks each school has, the chunkType of each chunk,
 *   and the character length of each chunk.
 * - Prints totals for how many schools have 1 chunk vs multiple chunks.
 *
 * Run:
 *   npx ts-node scripts/check-chunks.ts
 */

import fs from "fs";
import path from "path";

interface SchoolEmbeddingEntry {
  dbn: string;
  name: string;
  borough: string;
  chunkType: "full" | "identity" | "academics" | "activities";
  chunk: string;
  embedding: number[];
  metadata: Record<string, unknown>;
}

function main(): void {
  const filePath = path.resolve(process.cwd(), "data", "school-embeddings.json");
  if (!fs.existsSync(filePath)) {
    console.error(`Not found: ${filePath}`);
    process.exit(1);
  }

  const entries: SchoolEmbeddingEntry[] = JSON.parse(
    fs.readFileSync(filePath, "utf-8")
  );

  // Brooklyn Tech focused report
  const brooklynTechEntries = entries.filter(
    (e) =>
      e.name.includes("Brooklyn Technical") || e.name.includes("Brooklyn Tech")
  );

  console.log("=== Brooklyn Tech chunks ===");
  if (brooklynTechEntries.length === 0) {
    console.log("No entries matched 'Brooklyn Technical' or 'Brooklyn Tech'.");
  } else {
    // Group by dbn (a school can have multiple chunks)
    const byDbn = new Map<string, SchoolEmbeddingEntry[]>();
    for (const e of brooklynTechEntries) {
      const list = byDbn.get(e.dbn) ?? [];
      list.push(e);
      byDbn.set(e.dbn, list);
    }

    Array.from(byDbn.entries()).forEach(([dbn, chunks]) => {
      console.log(`\nSchool: ${chunks[0].name} (dbn: ${dbn})`);
      console.log(`  Total chunks: ${chunks.length}`);
      chunks.forEach((c: SchoolEmbeddingEntry, i: number) => {
        console.log(
          `  [${i + 1}] chunkType=${c.chunkType}, length=${c.chunk.length} chars`
        );
      });
    });
  }

  // Totals across all schools
  const chunksPerSchool = new Map<string, number>();
  for (const e of entries) {
    chunksPerSchool.set(e.dbn, (chunksPerSchool.get(e.dbn) ?? 0) + 1);
  }

  let singleChunkSchools = 0;
  let multiChunkSchools = 0;
  Array.from(chunksPerSchool.values()).forEach((count) => {
    if (count === 1) singleChunkSchools++;
    else multiChunkSchools++;
  });

  console.log("\n=== Totals ===");
  console.log(`Total chunk records: ${entries.length}`);
  console.log(`Total unique schools: ${chunksPerSchool.size}`);
  console.log(`Schools with 1 chunk:        ${singleChunkSchools}`);
  console.log(`Schools with multiple chunks: ${multiChunkSchools}`);
}

main();
