import Link from 'next/link'
import { Button } from '@/components/ui'
import SiteHeader from './school/[dbn]/SiteHeader'

// Root 404 for any unknown route. Next returns a real 404 status for it.
export default function NotFound() {
  return (
    <main className="max-w-[1120px] mx-auto bg-surface min-h-screen">
      <SiteHeader addedCount={0} />

      <div className="flex flex-col items-center text-center gap-4 px-5 py-24">
        <h1 className="font-display font-bold text-[28px] text-ink tracking-[-0.03em]">
          We can&rsquo;t find that page
        </h1>
        <p className="text-[15px] text-muted max-w-[440px]">The link may be old or mistyped.</p>
        <div className="flex items-center gap-3 pt-2">
          <Link href="/find">
            <Button type="button">Search schools</Button>
          </Link>
          <Link href="/" className="text-[14.5px] text-accent">
            Home
          </Link>
        </div>
      </div>
    </main>
  )
}
