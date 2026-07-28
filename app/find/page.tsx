import Footer from '@/components/Footer'
import { getAllSchools } from '@/lib/load-schools'
import FindClient from './FindClient'

// Issue #108 (first step of #99): unified "Find schools" shell. Deterministic
// filters here are a hard floor (they exclude schools); the chat "ask" box on
// this same page is soft and only annotates the list — see FindClient.
// Reachable only by direct URL for now — nothing links here yet.
export default async function FindPage() {
  const schools = await getAllSchools()

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-5">
          <h1 className="text-xl font-bold text-gray-900">Find schools</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Filters narrow the list. The ask box below just annotates it — nothing gets removed.
          </p>
        </div>

        {schools.length === 0 ? (
          <div
            className="mb-5 px-4 py-2.5 rounded-md text-sm"
            style={{ backgroundColor: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D' }}
          >
            School data not yet loaded on the server — contact support if this persists.
          </div>
        ) : (
          <FindClient schools={schools} />
        )}
      </div>
      <Footer />
    </main>
  )
}
