import Footer from '@/components/Footer'
import { getAllSchools } from '@/lib/load-schools'
import { parseFindFilters } from '@/lib/school-list-utils'
import FindClient from './FindClient'

// Issue #114: rebuilt to the approved design (design/find-screen.html) — rail
// hard filters + ask band + ranked results. Filter state lives in the URL
// (searchParams, parsed below) so a filtered view is linkable and survives a
// reload. Reachable only by direct URL for now — nothing links here yet.
export default async function FindPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined }
}) {
  const schools = await getAllSchools()
  const initialFilters = parseFindFilters(searchParams)

  return (
    <main className="min-h-screen bg-white">
      {schools.length === 0 ? (
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div
            className="mb-5 px-4 py-2.5 rounded-md text-sm"
            style={{ backgroundColor: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D' }}
          >
            School data not yet loaded on the server — contact support if this persists.
          </div>
        </div>
      ) : (
        <FindClient schools={schools} initialFilters={initialFilters} />
      )}
      <Footer />
    </main>
  )
}
