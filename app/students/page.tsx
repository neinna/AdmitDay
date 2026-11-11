import type { Metadata } from 'next'
import { auth } from '@clerk/nextjs/server'
import Footer from '@/components/Footer'
import { findParentId } from '@/lib/saved-lists-db'
import { getStudent } from '@/lib/students-db'
import { getAllSchools } from '@/lib/load-schools'
import { zonedSchools } from '@/lib/students'
import StudentsClient from './StudentsClient'

export const metadata: Metadata = {
  title: 'AdmitDay: Students',
}

/**
 * /students — one student per account for now. Signed out, nothing is read
 * from Postgres and the client shows a sign-in prompt.
 */
export default async function StudentsPage() {
  const { userId } = await auth()
  let student = null
  let zoned: { dbn: string; name: string }[] = []
  if (userId) {
    const parentId = await findParentId(userId)
    student = parentId === null ? null : await getStudent(parentId)
    zoned = zonedSchools(await getAllSchools())
  }
  return (
    <main className="min-h-screen bg-white flex flex-col">
      <StudentsClient signedIn={!!userId} initialStudent={student} zonedOptions={zoned} />
      <Footer />
    </main>
  )
}
