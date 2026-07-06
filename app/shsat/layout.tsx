import type { Metadata } from 'next'

// The SHSAT family tool is NOT part of the public product. Keep the whole /shsat
// subtree out of search indexes. NOTE: this prevents indexing/discovery, not direct
// URL access — real access control / separation is a pending decision (see ROADMAP
// "Separate family SHSAT tool from the public product").
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
}

export default function ShsatLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
