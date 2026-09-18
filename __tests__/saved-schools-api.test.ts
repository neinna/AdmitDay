/**
 * __tests__/saved-schools-api.test.ts
 *
 * Issue #200 — the API surface behind /find, /school/[dbn], and /my-schools.
 * Mocks @clerk/nextjs/server (auth/currentUser) and @/lib/saved-lists-db
 * directly, so these tests exercise real route-handler logic (auth gate,
 * request validation, parentId resolution) without a real DB or a real
 * Clerk session — the same "import and call the handler" approach as the
 * find/ask route tests.
 *
 * The issue's reviewer risk — one parent reading another's list — is tested
 * against app/api/saved-schools/[listId]/route.ts, the one route that takes
 * a caller-supplied id.
 */

const mockAuth = jest.fn()
const mockCurrentUser = jest.fn()
jest.mock('@clerk/nextjs/server', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
  currentUser: (...args: unknown[]) => mockCurrentUser(...args),
}))

const mockFindParentId = jest.fn()
const mockGetOrCreateParentId = jest.fn()
const mockGetSavedDbns = jest.fn()
const mockAddSavedSchool = jest.fn()
const mockRemoveSavedSchool = jest.fn()
const mockReorderSavedSchools = jest.fn()
const mockGetOwnedList = jest.fn()
jest.mock('@/lib/saved-lists-db', () => ({
  findParentId: (...args: unknown[]) => mockFindParentId(...args),
  getOrCreateParentId: (...args: unknown[]) => mockGetOrCreateParentId(...args),
  getSavedDbns: (...args: unknown[]) => mockGetSavedDbns(...args),
  addSavedSchool: (...args: unknown[]) => mockAddSavedSchool(...args),
  removeSavedSchool: (...args: unknown[]) => mockRemoveSavedSchool(...args),
  reorderSavedSchools: (...args: unknown[]) => mockReorderSavedSchools(...args),
  getOwnedList: (...args: unknown[]) => mockGetOwnedList(...args),
}))

import { GET, POST, DELETE, PUT } from '@/app/api/saved-schools/route'
import { GET as GET_BY_ID } from '@/app/api/saved-schools/[listId]/route'

function jsonRequest(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0]
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('/api/saved-schools — signed out', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ userId: null })
  })

  it('GET returns 401 and never queries the database', async () => {
    const res = await GET()
    expect(res.status).toBe(401)
    expect(mockFindParentId).not.toHaveBeenCalled()
    expect(mockGetSavedDbns).not.toHaveBeenCalled()
  })

  it('POST returns 401 and never writes', async () => {
    const res = await POST(jsonRequest({ dbn: '01M001' }))
    expect(res.status).toBe(401)
    expect(mockAddSavedSchool).not.toHaveBeenCalled()
  })

  it('DELETE returns 401 and never writes', async () => {
    const res = await DELETE(jsonRequest({ dbn: '01M001' }))
    expect(res.status).toBe(401)
    expect(mockRemoveSavedSchool).not.toHaveBeenCalled()
  })

  it('PUT returns 401 and never writes', async () => {
    const res = await PUT(jsonRequest({ order: ['01M001'] }))
    expect(res.status).toBe(401)
    expect(mockReorderSavedSchools).not.toHaveBeenCalled()
  })
})

describe('/api/saved-schools — signed in', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ userId: 'user_1' })
  })

  it('GET returns [] without creating a parent when the user has never saved anything', async () => {
    mockFindParentId.mockResolvedValue(null)
    const res = await GET()
    const body = await res.json()
    expect(body).toEqual({ dbns: [] })
    expect(mockGetOrCreateParentId).not.toHaveBeenCalled()
  })

  it('GET returns the saved dbns for an existing parent', async () => {
    mockFindParentId.mockResolvedValue(42)
    mockGetSavedDbns.mockResolvedValue(['01M001', '02M002'])
    const res = await GET()
    expect(await res.json()).toEqual({ dbns: ['01M001', '02M002'] })
    expect(mockGetSavedDbns).toHaveBeenCalledWith(42)
  })

  it('POST 400s on a missing dbn', async () => {
    const res = await POST(jsonRequest({}))
    expect(res.status).toBe(400)
    expect(mockAddSavedSchool).not.toHaveBeenCalled()
  })

  it('POST creates a parent (fetching identity from Clerk) on a first-ever save', async () => {
    mockFindParentId.mockResolvedValue(null)
    mockCurrentUser.mockResolvedValue({
      emailAddresses: [{ emailAddress: 'a@example.com' }],
      firstName: 'A',
      lastName: 'Parent',
    })
    mockGetOrCreateParentId.mockResolvedValue(7)
    mockAddSavedSchool.mockResolvedValue(['01M001'])

    const res = await POST(jsonRequest({ dbn: '01M001' }))

    expect(mockGetOrCreateParentId).toHaveBeenCalledWith({
      clerkUserId: 'user_1',
      email: 'a@example.com',
      firstName: 'A',
      lastName: 'Parent',
    })
    expect(mockAddSavedSchool).toHaveBeenCalledWith(7, '01M001')
    expect(await res.json()).toEqual({ dbns: ['01M001'] })
  })

  it('POST skips the Clerk identity lookup once the parent already exists', async () => {
    mockFindParentId.mockResolvedValue(7)
    mockAddSavedSchool.mockResolvedValue(['01M001', '02M002'])

    await POST(jsonRequest({ dbn: '02M002' }))

    expect(mockCurrentUser).not.toHaveBeenCalled()
    expect(mockGetOrCreateParentId).not.toHaveBeenCalled()
    expect(mockAddSavedSchool).toHaveBeenCalledWith(7, '02M002')
  })

  it('DELETE 400s on a missing dbn', async () => {
    const res = await DELETE(jsonRequest({}))
    expect(res.status).toBe(400)
  })

  it('PUT 400s when order is not a string array', async () => {
    const res = await PUT(jsonRequest({ order: ['ok', 5] }))
    expect(res.status).toBe(400)
    expect(mockReorderSavedSchools).not.toHaveBeenCalled()
  })

  it('PUT reorders for an existing parent', async () => {
    mockFindParentId.mockResolvedValue(7)
    mockReorderSavedSchools.mockResolvedValue(['02M002', '01M001'])
    const res = await PUT(jsonRequest({ order: ['02M002', '01M001'] }))
    expect(mockReorderSavedSchools).toHaveBeenCalledWith(7, ['02M002', '01M001'])
    expect(await res.json()).toEqual({ dbns: ['02M002', '01M001'] })
  })
})

describe('/api/saved-schools/[listId] — the cross-parent isolation case (issue #200 reviewer risk)', () => {
  it('signed out: 401, and the database is never queried', async () => {
    mockAuth.mockResolvedValue({ userId: null })
    const res = await GET_BY_ID(new Request('http://test/api/saved-schools/1'), {
      params: { listId: '1' },
    })
    expect(res.status).toBe(401)
    expect(mockGetOwnedList).not.toHaveBeenCalled()
  })

  it("signed in as a different parent: 404, not the other parent's schools", async () => {
    mockAuth.mockResolvedValue({ userId: 'attacker' })
    mockFindParentId.mockResolvedValue(99) // attacker's own parent row
    mockGetOwnedList.mockResolvedValue(null) // list 1 belongs to parentId 1, not 99

    const res = await GET_BY_ID(new Request('http://test/api/saved-schools/1'), {
      params: { listId: '1' },
    })

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body).not.toHaveProperty('dbns')
    expect(mockGetOwnedList).toHaveBeenCalledWith(1, 99)
  })

  it('signed in as the owner: 200 with the list', async () => {
    mockAuth.mockResolvedValue({ userId: 'owner' })
    mockFindParentId.mockResolvedValue(1)
    mockGetOwnedList.mockResolvedValue({ id: 1, name: 'My list', dbns: ['01M001'] })

    const res = await GET_BY_ID(new Request('http://test/api/saved-schools/1'), {
      params: { listId: '1' },
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 1, name: 'My list', dbns: ['01M001'] })
  })

  it('a non-numeric list id 404s without ever reaching the database', async () => {
    mockAuth.mockResolvedValue({ userId: 'owner' })
    const res = await GET_BY_ID(new Request('http://test/api/saved-schools/not-a-number'), {
      params: { listId: 'not-a-number' },
    })
    expect(res.status).toBe(404)
    expect(mockFindParentId).not.toHaveBeenCalled()
    expect(mockGetOwnedList).not.toHaveBeenCalled()
  })
})
