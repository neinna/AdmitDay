/**
 * Issue #466 — PostHog init runs after child mount effects, so list_viewed
 * is dropped.
 *
 * This repo's jest config runs in the `node` environment with no jsdom, so
 * there is no way to mount a real React tree and let React's own effect
 * scheduler order parent vs. child effects (see the note in
 * auth-header.test.ts). What we can pin instead is the actual mechanism the
 * fix relies on: `posthog.init` must run as a side effect of evaluating the
 * PosthogProvider module itself (module scope, guarded by `window` and
 * `__loaded`), not inside a `useEffect` — because module evaluation always
 * happens before React mounts anything and runs any effect, parent or
 * child. We prove that by requiring the real module (with `posthog-js`
 * mocked) and recording call order against a simulated child mount effect
 * that fires immediately after the module is required, mirroring how
 * FindClient's mount effect (issue #276) fires its capture.
 */

describe('components/PosthogProvider — init runs before any mount effect can capture (issue #466)', () => {
  const originalWindow = (global as any).window

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (global as any).window
    } else {
      ;(global as any).window = originalWindow
    }
    jest.resetModules()
  })

  it('calls posthog.init before a simulated child mount-effect capture, in the browser', () => {
    ;(global as any).window = {}

    const calls: string[] = []
    jest.resetModules()
    jest.doMock('posthog-js', () => ({
      __esModule: true,
      default: {
        __loaded: false,
        init: jest.fn(() => {
          calls.push('init')
        }),
        capture: jest.fn(() => {
          calls.push('capture')
        }),
      },
    }))
    jest.doMock('posthog-js/react', () => ({
      PostHogProvider: ({ children }: { children: unknown }) => children,
    }))

    // Requiring the provider module is what happens when Next.js loads the
    // app shell — well before FindClient's mount effect can run.
    require('../components/PosthogProvider')
    const posthog = require('posthog-js').default

    // Simulate the child's mount effect (FindClient's list_viewed capture)
    // firing right after the provider module is in place.
    posthog.capture('list_viewed')

    expect(calls).toEqual(['init', 'capture'])
  })

  it('does not call posthog.init when there is no window (server render)', () => {
    delete (global as any).window

    jest.resetModules()
    const init = jest.fn()
    jest.doMock('posthog-js', () => ({
      __esModule: true,
      default: { __loaded: false, init, capture: jest.fn() },
    }))
    jest.doMock('posthog-js/react', () => ({
      PostHogProvider: ({ children }: { children: unknown }) => children,
    }))

    require('../components/PosthogProvider')

    expect(init).not.toHaveBeenCalled()
  })
})
