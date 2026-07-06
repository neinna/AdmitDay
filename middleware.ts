import { NextRequest, NextResponse } from 'next/server'

// Single shared-password gate for the family SHSAT tool (NOT the public product).
// Protects every /shsat page AND every /api/shsat endpoint with HTTP Basic Auth.
//
// Set SHSAT_PASSWORD in the environment (Vercel → Settings → Env Vars). Any username
// is accepted; only the password is checked. Fail-closed: if SHSAT_PASSWORD is unset,
// access is DENIED, so the family data can never accidentally sit open.
export const config = {
  matcher: ['/shsat', '/shsat/:path*', '/api/shsat/:path*'],
}

function unauthorized() {
  return new NextResponse('Authentication required.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="AdmitDay SHSAT", charset="UTF-8"' },
  })
}

export function middleware(req: NextRequest) {
  const password = process.env.SHSAT_PASSWORD
  if (!password) return unauthorized() // fail closed

  const header = req.headers.get('authorization')
  if (!header?.startsWith('Basic ')) return unauthorized()

  let decoded: string
  try {
    decoded = atob(header.slice(6))
  } catch {
    return unauthorized()
  }
  // Format is "username:password"; accept any username, check the password.
  const supplied = decoded.slice(decoded.indexOf(':') + 1)
  if (supplied !== password) return unauthorized()

  return NextResponse.next()
}
