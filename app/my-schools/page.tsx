import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import Footer from '@/components/Footer'
import { getAllSchools } from '@/lib/load-schools'
import { findParentId, getSavedDbns } from '@/lib/saved-lists-db'
import type { ListSchool } from '@/lib/saved-list-utils'
import MySchoolsClient from './MySchoolsClient'

/**
 * /my-schools — issue #137, moved off localStorage onto Postgres in #200.
 *
 * The saved list is a family's, not a device's, so this page requires a
 * session: a signed-out request is redirected before any school or list data
 * is fetched, let alone rendered — the gate lives here, in the server
 * component, rather than in a client-side check that would still ship the
 * data to a signed-out browser first.
 *
 * Ships a slim index of every school (unchanged from #137) and lets the
 * client resolve the session's saved DBNs against it — a few fields per
 * school rather than the full record, which keeps the payload small.
 *
 * Nothing here is a client import: `getAllSchools`, `getSavedDbns`, and the
 * index shaping are server-side, and the only thing handed across the
 * boundary is plain data.
 */
export default async function MySchoolsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/')

  const schools = await getAllSchools()
  const parentId = await findParentId(userId)
  const initialOrder = parentId === null ? [] : await getSavedDbns(parentId)

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
      <MySchoolsClient index={index} initialOrder={initialOrder} />
      <Footer />
    </main>
  )
}
