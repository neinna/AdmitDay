import * as fs from 'fs'
import * as path from 'path'
import { isNonBrowserRuntimeEvent } from '../lib/sentry-filters'

// ADMITDAY-F: a TypeError whose stack ran through Deno's `ext:core/01_core.js`.
// No browser has that file, so the event came from a bot, not a parent.

const frames = (...filenames: string[]) => ({
  exception: { values: [{ stacktrace: { frames: filenames.map((filename) => ({ filename })) } }] },
})

describe('isNonBrowserRuntimeEvent', () => {
  it('flags the ADMITDAY-F stack (Deno built-in frame)', () => {
    expect(isNonBrowserRuntimeEvent(frames('ext:core/01_core.js', '<script>', '<script>'))).toBe(true)
  })

  it('keeps a normal browser stack', () => {
    expect(
      isNonBrowserRuntimeEvent(frames('https://www.admitday.com/_next/static/chunks/app/page.js'))
    ).toBe(false)
  })

  it('keeps an event with no stack', () => {
    expect(isNonBrowserRuntimeEvent({})).toBe(false)
  })
})

describe('client Sentry config', () => {
  it('drops non-browser-runtime events in beforeSend', () => {
    const source = fs.readFileSync(path.join(__dirname, '../instrumentation-client.ts'), 'utf8')
    expect(source).toContain('isNonBrowserRuntimeEvent(event) ? null : event')
  })
})
