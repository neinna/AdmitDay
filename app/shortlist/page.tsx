import type { Metadata } from 'next'
import { auth } from '@clerk/nextjs/server'
import Footer from '@/components/Footer'
import { getAllSchools } from '@/lib/load-schools'
import { findParentId, getSavedPrograms } from '@/lib/saved-lists-db'
import { admissionMethodTerm } from '@/lib/school-list-utils'
import type { ListSchool, ListSchoolDetail, ShortlistProgram } from '@/lib/saved-list-utils'
import ShortlistClient from './ShortlistClient'

export const metadata: Metadata = {
  title: 'AdmitDay: Shortlist',
}

/**
 * /shortlist (renamed from /my-schools in issue #283) — issue #137, moved off
 * localStorage onto Postgres in #200.
 *
 * The saved list is a family's, not a device's, so it requires a session.
 * Saving a school requires an account (#240): a signed-out request never
 * fetches school or list data, but still renders this route — the client
 * component shows a sign-in prompt instead of a list.
 *
 * Ships a slim index of every school (unchanged from #137) and lets the
 * client resolve the session's saved DBNs against it — a few fields per
 * school rather than the full record, which keeps the payload small.
 *
 * Nothing here is a client import: `getAllSchools`, `getSavedPrograms`, and the
 * index shaping are server-side, and the only thing handed across the
 * boundary is plain data.
 */
export default async function ShortlistPage() {
  const { userId } = await auth()

  if (!userId) {
    return (
      <main className="min-h-screen bg-white flex flex-col">
        <ShortlistClient index={[]} initialOrder={[]} programs={{}} details={{}} signedIn={false} />
        <Footer />
      </main>
    )
  }

  const schools = await getAllSchools()
  const parentId = await findParentId(userId)
  const savedPrograms = parentId === null ? [] : await getSavedPrograms(parentId)

  const index: ListSchool[] = schools.map((s) => ({
    dbn: s.dbn,
    name: s.name,
    borough: s.borough,
    admissions_types: s.admissions_types ?? [],
    applicants_per_seat: s.applicants_per_seat,
    neighborhood: s.doe_data?.neighborhood ?? null,
  }))

  // Print detail (issue #405) only for schools actually on the list — the
  // index above ships for all schools and must stay slim.
  const schoolByDbn = new Map(schools.map((s) => [s.dbn, s]))
  const programs: Record<string, ShortlistProgram> = {}
  const initialOrder: string[] = []
  for (const item of savedPrograms) {
    const school = schoolByDbn.get(item.dbn)
    const program = school?.programs.find((p) => p.program_code === item.program_code)
    if (!school || !program) continue
    programs[item.program_code] = {
      program_code: item.program_code,
      dbn: item.dbn,
      name: program.program_name ?? program.program ?? item.program_code,
      term: program.admissions_type ? admissionMethodTerm(program.admissions_type) : null,
    }
    initialOrder.push(item.program_code)
  }
  const savedSet = new Set(initialOrder.map((code) => programs[code].dbn))
  const details: Record<string, ListSchoolDetail> = {}
  for (const s of schools) {
    if (!savedSet.has(s.dbn)) continue
    details[s.dbn] = {
      total_students: s.total_students,
      sqr: s.sqr,
      school_website: s.school_website,
      programs: s.programs,
      doe_data: {
        address: s.doe_data?.address ?? null,
        graduation_rate: s.doe_data?.graduation_rate ?? null,
        college_career_rate: s.doe_data?.college_career_rate ?? null,
        attendance_rate: s.doe_data?.attendance_rate ?? null,
        subway: s.doe_data?.subway,
        bus: s.doe_data?.bus,
        website: s.doe_data?.website ?? null,
      },
    }
  }

  return (
    <main className="min-h-screen bg-white flex flex-col">
      <ShortlistClient index={index} initialOrder={initialOrder} programs={programs} details={details} signedIn={true} />
      <Footer />
    </main>
  )
}
