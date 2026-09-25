import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="border-t border-gray-100 py-5 mt-10">
      <div className="max-w-3xl mx-auto px-4">
        <p className="text-xs text-gray-400 text-center">
          <Link href="/privacy" className="underline hover:text-gray-600">Privacy</Link>
          <span className="mx-2">·</span>
          <Link href="/disclaimers" className="underline hover:text-gray-600">Disclaimers</Link>
          <span className="mx-2">·</span>
          <Link href="/terms" className="underline hover:text-gray-600">Terms</Link>
        </p>
      </div>
    </footer>
  )
}
