import { redirect } from 'next/navigation'

/**
 * Issue #130. The old filter flow (/ → /list → /requirements) and the standalone
 * /chat were retired in favour of the unified /find surface plus /school/[dbn].
 *
 * A redirect rather than moving the route: the landing page is designed and will
 * own / soon, so this keeps that swap to a single file instead of relocating the
 * find surface twice.
 */
export default function Home() {
  redirect('/find')
}
