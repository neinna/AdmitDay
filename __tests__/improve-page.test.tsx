import { renderToStaticMarkup } from 'react-dom/server'

const mockAuth = jest.fn()
const mockNotFound = jest.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})
let mockUserId: string | undefined

jest.mock('@clerk/nextjs/server', () => ({ auth: () => mockAuth() }))
jest.mock('next/navigation', () => ({
  notFound: () => mockNotFound(),
  usePathname: () => '/find',
}))
jest.mock('@clerk/nextjs', () => {
  const UserButton: any = ({ children }: any) => <div>{children}</div>
  UserButton.MenuItems = ({ children }: any) => <div>{children}</div>
  UserButton.Link = ({ label, href }: any) => <a href={href}>{label}</a>
  const Pass = ({ children }: any) => <>{children}</>
  return {
    ClerkLoaded: Pass,
    SignedIn: Pass,
    SignedOut: () => null,
    SignInButton: Pass,
    SignUpButton: Pass,
    UserButton,
    useUser: () => ({ user: mockUserId ? { id: mockUserId } : null }),
  }
})

import ImprovePage from '../app/improve/page'
import { submitImprovement, ImproveStatus } from '../app/improve/ImproveForm'
import AuthControls from '../components/AuthControls'

const OLD_ENV = process.env
beforeEach(() => {
  process.env = { ...OLD_ENV, OWNER_CLERK_USER_ID: 'user_owner', NEXT_PUBLIC_OWNER_CLERK_USER_ID: 'user_owner' }
  mockNotFound.mockClear()
})
afterAll(() => {
  process.env = OLD_ENV
})

describe('/improve page', () => {
  const props = { searchParams: Promise.resolve({ from: '/find' }) }

  it('calls notFound when signed out', async () => {
    mockAuth.mockResolvedValue({ userId: null })
    await expect(ImprovePage(props)).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('calls notFound for a non-owner', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_other' })
    await expect(ImprovePage(props)).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('renders for the owner', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_owner' })
    await ImprovePage(props)
    expect(mockNotFound).not.toHaveBeenCalled()
  })
})

describe('improve form', () => {
  it('posts text and from, then shows Filed #12 on 201', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      status: 201,
      json: async () => ({ number: 12, url: 'https://github.com/x/y/issues/12' }),
    })
    global.fetch = fetchMock as unknown as typeof fetch
    const result = await submitImprovement('make it faster', '/find')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/improvements',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ text: 'make it faster', from: '/find' }) }),
    )
    const html = renderToStaticMarkup(<ImproveStatus result={result} />)
    expect(html).toContain('Filed #12')
    expect(html).toContain('href="https://github.com/x/y/issues/12"')
    expect(html).toContain('target="_blank"')
  })

  it('shows the error text on failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 400,
      json: async () => ({ error: 'Too long' }),
    }) as unknown as typeof fetch
    const result = await submitImprovement('x', '/')
    expect(renderToStaticMarkup(<ImproveStatus result={result} />)).toContain('Too long')
  })
})

describe('account menu item', () => {
  it('renders only for the owner id', () => {
    mockUserId = 'user_owner'
    const html = renderToStaticMarkup(<AuthControls />)
    expect(html).toContain('Suggest an improvement')
    expect(html).toContain('href="/improve?from=%2Ffind"')

    mockUserId = 'user_other'
    expect(renderToStaticMarkup(<AuthControls />)).not.toContain('Suggest an improvement')
  })

  it('renders nothing when the env var is unset', () => {
    delete process.env.NEXT_PUBLIC_OWNER_CLERK_USER_ID
    mockUserId = undefined
    expect(renderToStaticMarkup(<AuthControls />)).not.toContain('Suggest an improvement')
  })
})
