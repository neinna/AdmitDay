import Link from 'next/link'

const KIDS = [
  { id: 'alice', name: 'Alice', emoji: '🌸' },
  { id: 'jake', name: 'Jake', emoji: '⚡' },
]

const TESTS = [
  {
    id: 'test-1',
    name: 'Weekly Micro Test #1',
    chapters: 'Ch 8–10',
    questions: 15,
    minutes: 30,
  },
]

export default function SHSATPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-white mb-8">SHSAT Micro Tests</h1>

        {/* Kid cards */}
        <div className="grid grid-cols-2 gap-4 mb-10">
          {KIDS.map((kid) => (
            <div key={kid.id} className="bg-gray-800 rounded-xl p-5 flex flex-col gap-3">
              <div className="text-4xl">{kid.emoji}</div>
              <div className="text-lg font-semibold text-white">{kid.name}</div>
              <Link
                href={`/shsat/${kid.id}/results`}
                className="text-sm text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
              >
                View results →
              </Link>
            </div>
          ))}
        </div>

        {/* Test list */}
        <div className="space-y-4">
          {TESTS.map((test) => (
            <div key={test.id} className="bg-gray-800 rounded-xl p-5">
              <div className="mb-1 text-white font-semibold">{test.name}</div>
              <div className="text-sm text-gray-400 mb-4">
                {test.chapters} · {test.questions} questions · {test.minutes} minutes
              </div>
              <div className="flex gap-3">
                {KIDS.map((kid) => (
                  <Link
                    key={kid.id}
                    href={`/shsat/${kid.id}/${test.id}`}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {kid.emoji} {kid.name} → Start
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
