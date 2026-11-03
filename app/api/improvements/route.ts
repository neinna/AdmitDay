/**
 * app/api/improvements/route.ts
 *
 * Owner-only: files the typed improvement as an `agent-ok` GitHub issue.
 * Never puts cookies, headers, user data or env values in the issue.
 */

import { NextRequest } from 'next/server'
import { auth } from '@clerk/nextjs/server'

const MAX_TEXT = 4000
const MAX_FROM = 200
const MAX_TITLE = 80
const FROM_PATTERN = /^\/[A-Za-z0-9/_\-?=&.%]*$/

const NOT_CONFIGURED = () => Response.json({ error: 'improvements not configured' }, { status: 503 })

export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Sign in required' }, { status: 401 })

  const ownerId = process.env.OWNER_CLERK_USER_ID
  if (!ownerId) return NOT_CONFIGURED()
  if (userId !== ownerId) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const token = process.env.GITHUB_IMPROVEMENTS_TOKEN
  if (!token) return NOT_CONFIGURED()

  let payload: { text?: unknown; from?: unknown } | null = null
  try {
    payload = await request.json()
  } catch {
    payload = null
  }
  const text = typeof payload?.text === 'string' ? payload.text.trim() : ''
  if (text.length < 1 || text.length > MAX_TEXT) {
    return Response.json({ error: `text must be 1 to ${MAX_TEXT} characters` }, { status: 400 })
  }
  const rawFrom = payload?.from
  const from =
    typeof rawFrom === 'string' && rawFrom.length <= MAX_FROM && FROM_PATTERN.test(rawFrom) ? rawFrom : undefined

  const firstLine = text.split('\n')[0].trim()
  const title = firstLine.length > MAX_TITLE ? `${firstLine.slice(0, MAX_TITLE)}…` : firstLine
  const body = `${text}\n\n---\nFiled from the in-app improvements box${from ? ` on \`${from}\`` : ''}.`

  const res = await fetch('https://api.github.com/repos/neinna/AdmitDay/issues', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ title, body, labels: ['agent-ok'] }),
  })
  if (!res.ok) {
    console.error(`improvements: GitHub issue create failed with status ${res.status}`)
    return Response.json({ error: 'could not file the issue' }, { status: 502 })
  }
  const issue = await res.json()
  return Response.json({ number: issue.number, url: issue.html_url }, { status: 201 })
}
