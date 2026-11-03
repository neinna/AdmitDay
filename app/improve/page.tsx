import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import ImproveForm from './ImproveForm'

export const metadata: Metadata = {
  title: 'AdmitDay: Improve',
}

/**
 * /improve — issue #714 (part of #713). Owner only: anyone else, signed in or
 * not, gets a 404 so they cannot tell the page exists.
 */
export default async function ImprovePage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { userId } = await auth()
  if (!userId || userId !== process.env.OWNER_CLERK_USER_ID) notFound()

  const { from } = await props.searchParams
  return (
    <main className="max-w-[640px] mx-auto px-6 py-10">
      <ImproveForm from={typeof from === 'string' ? from : ''} />
    </main>
  )
}
