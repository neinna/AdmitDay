/**
 * __tests__/saved-programs-api.test.ts
 *
 * /api/saved-programs: auth gate, validation, and response shapes. Mocks Clerk
 * and @/lib/saved-lists-db the same way the other API tests do.
 */

const mockAuth = jest.fn()
jest.mock('@clerk/nextjs/server', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}))

const mockFindParentId = jest.fn()
const mockGetOrCreateParentId = jest.fn()
const mockGetSavedPrograms = jest.fn()
const mockAddSavedProgram = jest.fn()
const mockRemoveSavedProgram = jest.fn()
const mockReorderSavedPrograms = jest.fn()
jest.mock('@/lib/saved-lists-db', () => ({
  findParentId: (...args: unknown[]) => mockFindParentId(...args),
  getOrCreateParentId: (...args: unknown[]) => mockGetOrCreateParentId(...args),
  getSavedPrograms: (...args: unknown[]) => mockGetSavedPrograms(...args),
  addSavedProgram: (...args: unknown[]) => mockAddSavedProgram(...args),
  removeSavedProgram: (...args: unknown[]) => mockRemoveSavedProgram(...args),
  reorderSavedPrograms: (...args: unknown[]) => mockReorderSavedPrograms(...args),
}))

import { GET, POST, DELETE, PUT } from '@/app/api/saved-programs/route'

function jsonRequest(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0]
}

const A = { dbn: '01M001', program_code: 'M89S' }
const B = { dbn: '02M002', program_code: 'Q60A' }

beforeEach(() => {
  jest.clearAllMocks()
})

describe('/api/saved-programs — signed out', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ userId: null })
  })

  it('GET returns 401 and never queries the database', async () => {
    const res = await GET()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Sign in required' })
    expect(mockFindParentId).not.toHaveBeenCalled()
    expect(mockGetSavedPrograms).not.toHaveBeenCalled()
  })

  it('POST returns 401 and never writes', async () => {
    const res = await POST(jsonRequest(A))
    expect(res.status).toBe(401)
    expect(mockAddSavedProgram).not.toHaveBeenCalled()
  })

  it('DELETE returns 401 and never writes', async () => {
    const res = await DELETE(jsonRequest({ program_code: 'M89S' }))
    expect(res.status).toBe(401)
    expect(mockRemoveSavedProgram).not.toHaveBeenCalled()
  })

  it('PUT returns 401 and never writes', async () => {
    const res = await PUT(jsonRequest({ order: ['M89S'] }))
    expect(res.status).toBe(401)
    expect(mockReorderSavedPrograms).not.toHaveBeenCalled()
  })
})

describe('/api/saved-programs — signed in', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ userId: 'user_1' })
  })

  it('GET returns [] without creating a parent when the user has never saved anything', async () => {
    mockFindParentId.mockResolvedValue(null)
    const res = await GET()
    expect(await res.json()).toEqual({ programs: [] })
    expect(mockGetOrCreateParentId).not.toHaveBeenCalled()
  })

  it('GET returns the saved programs for an existing parent', async () => {
    mockFindParentId.mockResolvedValue(42)
    mockGetSavedPrograms.mockResolvedValue([A, B])
    const res = await GET()
    expect(await res.json()).toEqual({ programs: [A, B] })
    expect(mockGetSavedPrograms).toHaveBeenCalledWith(42)
  })

  it('POST adds a program, creating the parent on a first save', async () => {
    mockFindParentId.mockResolvedValue(null)
    mockGetOrCreateParentId.mockResolvedValue(7)
    mockAddSavedProgram.mockResolvedValue([A])
    const res = await POST(jsonRequest(A))
    expect(mockGetOrCreateParentId).toHaveBeenCalledWith('user_1')
    expect(mockAddSavedProgram).toHaveBeenCalledWith(7, A)
    expect(await res.json()).toEqual({ programs: [A] })
  })

  it.each([
    ['missing both', {}],
    ['bad dbn', { dbn: 'nope', program_code: 'M89S' }],
    ['bad program_code', { dbn: '01M001', program_code: 'm89s' }],
    ['missing program_code', { dbn: '01M001' }],
    ['non-string program_code', { dbn: '01M001', program_code: 5 }],
  ])('POST 400s on %s', async (_name, body) => {
    const res = await POST(jsonRequest(body))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'a valid dbn and program_code are required' })
    expect(mockAddSavedProgram).not.toHaveBeenCalled()
  })

  it('DELETE removes a program for an existing parent', async () => {
    mockFindParentId.mockResolvedValue(7)
    mockRemoveSavedProgram.mockResolvedValue([B])
    const res = await DELETE(jsonRequest({ program_code: 'M89S' }))
    expect(mockRemoveSavedProgram).toHaveBeenCalledWith(7, 'M89S')
    expect(await res.json()).toEqual({ programs: [B] })
  })

  it('DELETE returns [] when there is no parent', async () => {
    mockFindParentId.mockResolvedValue(null)
    const res = await DELETE(jsonRequest({ program_code: 'M89S' }))
    expect(await res.json()).toEqual({ programs: [] })
    expect(mockRemoveSavedProgram).not.toHaveBeenCalled()
  })

  it.each([[{}], [{ program_code: 'bad' }], [{ program_code: 7 }]])('DELETE 400s on %j', async (body) => {
    const res = await DELETE(jsonRequest(body))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'a valid program_code is required' })
  })

  it('PUT reorders for an existing parent', async () => {
    mockFindParentId.mockResolvedValue(7)
    mockReorderSavedPrograms.mockResolvedValue([B, A])
    const res = await PUT(jsonRequest({ order: ['Q60A', 'M89S'] }))
    expect(mockReorderSavedPrograms).toHaveBeenCalledWith(7, ['Q60A', 'M89S'])
    expect(await res.json()).toEqual({ programs: [B, A] })
  })

  it('PUT returns [] when there is no parent', async () => {
    mockFindParentId.mockResolvedValue(null)
    const res = await PUT(jsonRequest({ order: ['M89S'] }))
    expect(await res.json()).toEqual({ programs: [] })
    expect(mockReorderSavedPrograms).not.toHaveBeenCalled()
  })

  it.each([
    ['not an array', { order: 'M89S' }],
    ['a bad item', { order: ['M89S', 'DROP TABLE'] }],
    ['a non-string item', { order: ['M89S', 5] }],
    ['too long', { order: Array(501).fill('M89S') }],
  ])('PUT 400s when order is %s', async (_name, body) => {
    const res = await PUT(jsonRequest(body))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'order must be a program_code array' })
    expect(mockReorderSavedPrograms).not.toHaveBeenCalled()
  })
})
