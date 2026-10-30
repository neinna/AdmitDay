import type { ListSchool, ShortlistProgram } from '@/lib/saved-list-utils'

/** One program per saved dbn, with code `P-<dbn>`, for rendering ShortlistClient in tests. */
export function withPrograms(index: ListSchool[], dbns: string[]) {
  const programs: Record<string, ShortlistProgram> = {}
  for (const dbn of dbns) {
    const school = index.find((s) => s.dbn === dbn)
    programs[`P-${dbn}`] = {
      program_code: `P-${dbn}`,
      dbn,
      name: `Program of ${school?.name ?? dbn}`,
      term: school?.admissions_types?.[0] ?? null,
    }
  }
  return { initialOrder: dbns.map((d) => `P-${d}`), programs }
}
