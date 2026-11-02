import { auth } from '@clerk/nextjs/server'
import { POST } from '@/app/api/improvements/route'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn() }))

const mockAuth = auth as unknown as jest.Mock
const mockFetch = jest.fn()

function req(body: unknown) {
  return new Request('http://localhost/api/improvements', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as any
}

const ORIGINAL_ENV = process.env

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, OWNER_CLERK_USER_ID: 'owner', GITHUB_IMPROVEMENTS_TOKEN: 'tok' }
  mockAuth.mockResolvedValue({ userId: 'owner' })
  mockFetch.mockReset()
  global.fetch = mockFetch as any
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  process.env = ORIGINAL_ENV
  jest.restoreAllMocks()
})

describe('POST /api/improvements', () => {
  it('401 when signed out', async () => {
    mockAuth.mockResolvedValue({ userId: null })
    expect((await POST(req({ text: 'x' }))).status).toBe(401)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('403 for a non-owner', async () => {
    mockAuth.mockResolvedValue({ userId: 'someone' })
    expect((await POST(req({ text: 'x' }))).status).toBe(403)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('503 when the owner id is unset', async () => {
    delete process.env.OWNER_CLERK_USER_ID
    const res = await POST(req({ text: 'x' }))
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'improvements not configured' })
  })

  it('503 when the token is unset', async () => {
    delete process.env.GITHUB_IMPROVEMENTS_TOKEN
    const res = await POST(req({ text: 'x' }))
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'improvements not configured' })
  })

  it('400 for empty or too-long text', async () => {
    expect((await POST(req({ text: '   ' }))).status).toBe(400)
    expect((await POST(req({ text: 'a'.repeat(4001) }))).status).toBe(400)
    expect((await POST(req({}))).status).toBe(400)
  })

  it('files an agent-ok issue with a cut title and the from line', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 201, json: async () => ({ number: 7, html_url: 'https://gh/7' }) })
    const text = 'a'.repeat(100) + '\nsecond line'
    const res = await POST(req({ text, from: '/school/02M475?x=1' }))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ number: 7, url: 'https://gh/7' })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.github.com/repos/neinna/AdmitDay/issues')
    expect(init.headers.Authorization).toBe('Bearer tok')
    const sent = JSON.parse(init.body)
    expect(sent.labels).toEqual(['agent-ok'])
    expect(sent.title).toBe('a'.repeat(80) + '…')
    expect(sent.body).toBe(`${text}\n\n---\nFiled from the in-app improvements box on \`/school/02M475?x=1\`.`)
  })

  it('drops an invalid from', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 201, json: async () => ({ number: 1, html_url: 'u' }) })
    await POST(req({ text: 'hi', from: 'https://evil.example' }))
    const sent = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(sent.title).toBe('hi')
    expect(sent.body).toBe('hi\n\n---\nFiled from the in-app improvements box.')
  })

  it('502 when GitHub fails', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    const res = await POST(req({ text: 'hi' }))
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'could not file the issue' })
  })
})
