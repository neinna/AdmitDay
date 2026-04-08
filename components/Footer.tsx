export default function Footer() {
  return (
    <footer className="border-t border-gray-100 py-5 mt-10">
      <div className="max-w-3xl mx-auto px-4">
        <p className="text-xs text-gray-400 text-center leading-relaxed">
          Every effort was made to keep this data current. AI can make mistakes and school data can change. Even the DOE&apos;s own prediction tool uses randomness as a tiebreaker — no tool can guarantee an offer. Before submitting, confirm deadlines and requirements at{' '}
          <a
            href="https://www.myschools.nyc"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-600"
          >
            myschools.nyc
          </a>
        </p>
        <p className="text-xs text-gray-300 text-center mt-2">
          Built by Long Tail Studio
        </p>
      </div>
    </footer>
  )
}
