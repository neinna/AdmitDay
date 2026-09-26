/**
 * Issue #478 — PostHog identity must be reset from PostHog's own persisted
 * state ($user_state), not from an in-memory ref that resets to false on
 * every page load. A page that loads already signed out must still call
 * reset() when PostHog still thinks it's identified.
 *
 * This repo's jest config runs in the `node` environment with no jsdom, so
 * react hooks are mocked to run synchronously instead of rendering through
 * react-dom (see auth-header.test.ts for the existing source-text
 * convention this test departs from, deliberately, to pin behaviour).
 */

jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useEffect: (fn: () => void) => fn(),
  useRef: (init: unknown) => ({ current: init }),
}))

const mockIdentify = jest.fn()
const mockReset = jest.fn()
const mockGetProperty = jest.fn()

jest.mock('posthog-js', () => ({
  __esModule: true,
  default: {
    identify: (...args: unknown[]) => mockIdentify(...args),
    reset: (...args: unknown[]) => mockReset(...args),
    get_property: (...args: unknown[]) => mockGetProperty(...args),
  },
}))

const mockUseUser = jest.fn()

jest.mock('@clerk/nextjs', () => ({
  useUser: () => mockUseUser(),
}))

describe('components/AuthPosthogSync — reset on already-signed-out load (issue #478)', () => {
  const ORIGINAL_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'test-key'
    jest.resetModules()
  })

  afterAll(() => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = ORIGINAL_KEY
  })

  it('calls reset() on first render when loaded, signed out, and PostHog is still identified', () => {
    mockUseUser.mockReturnValue({ isSignedIn: false, isLoaded: true, user: null })
    mockGetProperty.mockReturnValue('identified')

    const AuthPosthogSync = require('@/components/AuthPosthogSync').default
    AuthPosthogSync()

    expect(mockGetProperty).toHaveBeenCalledWith('$user_state')
    expect(mockReset).toHaveBeenCalledTimes(1)
    expect(mockIdentify).not.toHaveBeenCalled()
  })

  it('does not call reset() when loaded, signed out, and PostHog is already anonymous', () => {
    mockUseUser.mockReturnValue({ isSignedIn: false, isLoaded: true, user: null })
    mockGetProperty.mockReturnValue('anonymous')

    const AuthPosthogSync = require('@/components/AuthPosthogSync').default
    AuthPosthogSync()

    expect(mockReset).not.toHaveBeenCalled()
    expect(mockIdentify).not.toHaveBeenCalled()
  })

  it('calls identify(user.id) once when loaded and signed in', () => {
    mockUseUser.mockReturnValue({ isSignedIn: true, isLoaded: true, user: { id: 'user_1' } })
    mockGetProperty.mockReturnValue('anonymous')

    const AuthPosthogSync = require('@/components/AuthPosthogSync').default
    AuthPosthogSync()

    expect(mockIdentify).toHaveBeenCalledTimes(1)
    expect(mockIdentify).toHaveBeenCalledWith('user_1')
    expect(mockReset).not.toHaveBeenCalled()
  })
})
