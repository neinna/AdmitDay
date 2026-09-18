import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import AccountDeleteClient from './AccountDeleteClient'

/**
 * /account/delete — issue #241 (part of #179). Signed out, there is nothing
 * to delete, so this redirects before rendering anything; the confirmation UI
 * and the DELETE /api/account call live in the client component, since the
 * session check itself needs no client-side data.
 */
export default async function AccountDeletePage() {
  const { userId } = await auth()
  if (!userId) redirect('/')

  return <AccountDeleteClient />
}
