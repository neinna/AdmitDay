import Footer from '@/components/Footer'
import { getAllSchools } from '@/lib/load-schools'
import type { ListSchool } from '@/lib/saved-list-utils'
import MySchoolsClient from './MySchoolsClient'

/**
 * /my-schools — issue #137. The screen behind the saved count in the header.
 *
 * The saved list lives in localStorage, so the server cannot know which schools
 * a family saved. It therefore ships a slim index of every school and lets the
 * client resolve saved DBNs against it — a few fields per school rather than
 * the full record, which keeps the payload small.
 *
 * Nothing here is a client import: `getAllSchools` and the index shaping are
 * server-side, and the only thing handed across the boundary is plain data.
 */
export default async function MySchoolsPage() {
  const schools = await getAllSchools()

  const index: ListSchool[] = schools.map((s) => ({
    dbn: s.dbn,
    name: s.name,
    borough: s.borough,
    admissions_types: s.admissions_types ?? [],
    applicants_per_seat: s.applicants_per_seat,
    neighborhood: s.doe_data?.neighborhood ?? null,
  }))

  return (
    <main className="min-h-screen bg-white">
      <MySchoolsClient index={index} />
      <Footer />
    </main>
  )
}
