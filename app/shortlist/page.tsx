import type { Metadata } from 'next'
import { auth } from '@clerk/nextjs/server'
import Footer from '@/components/Footer'
import { getAllSchools } from '@/lib/load-schools'
import { findParentId, getSavedDbns } from '@/lib/saved-lists-db'
import type { ListSchool } from '@/lib/saved-list-utils'
import ShortlistClient from './ShortlistClient'

export const metadata: Metadata = {
  title: 'Shortlist · AdmitDay',
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
 * Nothing here is a client import: `getAllSchools`, `getSavedDbns`, and the
 * index shaping are server-side, and the only thing handed across the
 * boundary is plain data.
 */
export default async function ShortlistPage() {
  const { userId } = await auth()

  if (!userId) {
    return (
      <main className="min-h-screen bg-white">
        <ShortlistClient index={[]} initialOrder={[]} signedIn={false} />
        <Footer />
      </main>
    )
  }

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
      <ShortlistClient index={index} initialOrder={initialOrder} signedIn={true} />
      <Footer />
    </main>
  )
}
