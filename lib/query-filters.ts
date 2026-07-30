/**
 * query-filters.ts
 *
 * Deterministic pre-filter extraction for chat retrieval (roadmap #72 item 6).
 *
 * Compound questions like "CS + soccer + Brooklyn" mix signals that are
 * unambiguous in text (a borough name, a sport, a subject) with signals that
 * genuinely need semantic search (school "vibe", size, rigor). This module
 * only pulls out the deterministic part; anything not clearly recognized is
 * left for the embedding-based ranker in lib/rag.ts to handle.
 *
 * Place at: lib/query-filters.ts
 */

// Same five boroughs used throughout the app (see BOROUGH_ORDER in
// lib/school-list-utils.ts and the school data's `borough` field).
const BOROUGHS = ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"];

// PSAL sports as they appear in the school data's activities text, plus
// common aliases students use when asking about them.
const SPORT_ALIASES: Record<string, string> = {
  badminton: "Badminton",
  baseball: "Baseball",
  basketball: "Basketball",
  bowling: "Bowling",
  cricket: "Cricket",
  "cross country": "Cross Country",
  "double dutch": "Double Dutch",
  fencing: "Fencing",
  "flag football": "Flag Football",
  football: "Football",
  golf: "Golf",
  gymnastics: "Gymnastics",
  handball: "Handball",
  "indoor track": "Indoor Track",
  "outdoor track": "Outdoor Track",
  "track & field": "Track",
  "track and field": "Track",
  track: "Track",
  lacrosse: "Lacrosse",
  rugby: "Rugby",
  soccer: "Soccer",
  softball: "Softball",
  stunt: "Stunt",
  swimming: "Swimming",
  "table tennis": "Table Tennis",
  tennis: "Tennis",
  volleyball: "Volleyball",
  wrestling: "Wrestling",
};

// Deterministic keyword -> interest-category aliases. Matched against the
// `interests` strings in each school's metadata (e.g. "Computer Science &
// Technology"), so we only need the distinctive part of the phrase. Only
// keywords that map unambiguously to a single real category are included —
// broad terms like "arts" or "STEM" span multiple categories in the data and
// are left for semantic ranking instead of a deterministic filter.
const INTEREST_ALIASES: Record<string, string> = {
  cs: "Computer Science",
  "computer science": "Computer Science",
  coding: "Computer Science",
  programming: "Computer Science",
  engineering: "Engineering",
  robotics: "Engineering",
  business: "Business",
  government: "Law & Government",
  medicine: "Health Professions",
  nursing: "Health Professions",
  culinary: "Culinary Arts",
  cosmetology: "Cosmetology",
  architecture: "Architecture",
  "environmental science": "Environmental Science",
  film: "Film/Video",
  "visual art": "Visual Art & Design",
  "performing art": "Performing Arts",
  theater: "Performing Arts",
  theatre: "Performing Arts",
  humanities: "Humanities & Interdisciplinary",
  jrotc: "JROTC",
};

export interface QueryFilters {
  borough?: string;
  sports: string[];
  interests: string[];
}

function findWord(question: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(question);
}

/**
 * Pulls out deterministic borough / sport / interest signals from a free-text
 * question. Returns empty arrays and an undefined borough when nothing
 * matches, so callers can treat that as "no filters, behave as before".
 */
export function extractFilters(question: string): QueryFilters {
  const borough = BOROUGHS.find((b) => findWord(question, b));

  const sports = Array.from(
    new Set(
      Object.entries(SPORT_ALIASES)
        .filter(([alias]) => findWord(question, alias))
        .map(([, canonical]) => canonical)
    )
  );

  const interests = Array.from(
    new Set(
      Object.entries(INTEREST_ALIASES)
        .filter(([alias]) => findWord(question, alias))
        .map(([, canonical]) => canonical)
    )
  );

  return { borough, sports, interests };
}

/** True when extractFilters found at least one deterministic signal. */
export function hasFilters(filters: QueryFilters): boolean {
  return Boolean(filters.borough) || filters.sports.length > 0 || filters.interests.length > 0;
}

// ── Applied chips (issue #114: /find ask band) ──────────────────────────────
// The ask band shows one removable chip per extracted signal. Removing a
// chip must re-rank without calling the model again, so chip removal is a
// pure edit of the already-extracted QueryFilters, not a new extraction.

export interface AppliedSignal {
  kind: "borough" | "sport" | "interest";
  value: string;
  label: string;
}

/** Flattens extracted ask criteria into individually-removable chip descriptors. */
export function appliedSignals(filters: QueryFilters): AppliedSignal[] {
  const signals: AppliedSignal[] = [];
  if (filters.borough) {
    signals.push({ kind: "borough", value: filters.borough, label: filters.borough });
  }
  for (const sport of filters.sports) {
    signals.push({ kind: "sport", value: sport, label: `${sport} (PSAL)` });
  }
  for (const interest of filters.interests) {
    signals.push({ kind: "interest", value: interest, label: interest });
  }
  return signals;
}

/**
 * Removes a single signal from a previously-extracted QueryFilters. Pure and
 * deterministic — callers use this for chip removal so re-ranking never
 * triggers another /api/chat (LLM) call.
 */
export function removeSignal(
  filters: QueryFilters,
  kind: AppliedSignal["kind"],
  value: string
): QueryFilters {
  if (kind === "borough") {
    return { ...filters, borough: filters.borough === value ? undefined : filters.borough };
  }
  if (kind === "sport") {
    return { ...filters, sports: filters.sports.filter((s) => s !== value) };
  }
  return { ...filters, interests: filters.interests.filter((i) => i !== value) };
}
