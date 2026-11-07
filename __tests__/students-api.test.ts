/**
 * /api/students: auth gate, validation, and that parentId comes only from the
 * session.
 */

const mockAuth = jest.fn()
jest.mock('@clerk/nextjs/server', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}))

const mockFindParentId = jest.fn()
const mockGetOrCreateParentId = jest.fn()
jest.mock('@/lib/saved-lists-db', () => ({
  findParentId: (...args: unknown[]) => mockFindParentId(...args),
  getOrCreateParentId: (...args: unknown[]) => mockGetOrCreateParentId(...args),
}))

const mockGetStudent = jest.fn()
const mockSaveStudent = jest.fn()
const mockDeleteStudent = jest.fn()
jest.mock('@/lib/students-db', () => ({
  getStudent: (...args: unknown[]) => mockGetStudent(...args),
  saveStudent: (...args: unknown[]) => mockSaveStudent(...args),
  deleteStudent: (...args: unknown[]) => mockDeleteStudent(...args),
}))

import { GET, PUT, DELETE } from '@/app/api/students/route'

function jsonRequest(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof PUT>[0]
}

const STUDENT = {
  label: 'Kid 1',
  home_borough: 'K',
  home_district: 15,
  school_borough: null,
  school_district: null,
  zoned_dbn: null,
  lottery: 63,
}

beforeEach(() => jest.clearAllMocks())

describe('/api/students — signed out', () => {
  beforeEach(() => mockAuth.mockResolvedValue({ userId: null }))

  it('GET, PUT and DELETE return 401 and never touch the database', async () => {
    expect((await GET()).status).toBe(401)
    expect((await PUT(jsonRequest(STUDENT))).status).toBe(401)
    expect((await DELETE()).status).toBe(401)
    expect(mockFindParentId).not.toHaveBeenCalled()
    expect(mockSaveStudent).not.toHaveBeenCalled()
    expect(mockDeleteStudent).not.toHaveBeenCalled()
  })
})

describe('/api/students — signed in', () => {
  beforeEach(() => mockAuth.mockResolvedValue({ userId: 'user_a' }))

  it('GET returns null for a parent with no row', async () => {
    mockFindParentId.mockResolvedValue(null)
    const res = await GET()
    expect(await res.json()).toEqual({ student: null })
    expect(mockGetStudent).not.toHaveBeenCalled()
  })

  it('PUT saves the validated student under the session parent, dropping unknown fields', async () => {
    mockFindParentId.mockResolvedValue(7)
    mockSaveStudent.mockImplementation(async (_id: number, s: unknown) => s)
    const res = await PUT(jsonRequest({ ...STUDENT, parentId: 99, name: 'Real Name' }))
    expect(res.status).toBe(200)
    expect(mockSaveStudent).toHaveBeenCalledWith(7, STUDENT)
    expect(await res.json()).toEqual({ student: STUDENT })
  })

  it('PUT creates the parent row on first save', async () => {
    mockFindParentId.mockResolvedValue(null)
    mockGetOrCreateParentId.mockResolvedValue(8)
    mockSaveStudent.mockImplementation(async (_id: number, s: unknown) => s)
    await PUT(jsonRequest(STUDENT))
    expect(mockSaveStudent).toHaveBeenCalledWith(8, STUDENT)
  })

  it('PUT rejects an invalid body with 400 and never writes', async () => {
    const res = await PUT(jsonRequest({ ...STUDENT, lottery: '3f2a9c0b7d114e2a9b3c0123456789ab' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'lottery must be 0-255' })
    expect(mockSaveStudent).not.toHaveBeenCalled()
  })

  it('DELETE removes the session parent\'s student', async () => {
    mockFindParentId.mockResolvedValue(7)
    const res = await DELETE()
    expect(await res.json()).toEqual({ student: null })
    expect(mockDeleteStudent).toHaveBeenCalledWith(7)
  })
})
