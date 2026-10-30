/**
 * Issue #660 — the disabled Distance buttons explain why: a ZIP or station is
 * needed first. The hint shows only while radiusDisabled is true.
 */

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import FindRail from '../app/find/FindRail'

const HINT = 'Enter a ZIP or subway station first.'

function render(radiusDisabled: boolean): string {
  return renderToStaticMarkup(
    createElement(FindRail, {
      schools: [],
      filters: { boroughs: [], tracks: [], size: '' } as any,
      trackOptions: [],
      startingPointInput: '',
      startingPointNotFound: false,
      startingPointSuggestions: [],
      radiusValue: '',
      radiusDisabled,
      onToggleBorough: () => {},
      onToggleTrack: () => {},
      onSizeChange: () => {},
      onStartingPointInputChange: () => {},
      onRadiusChange: () => {},
      onReset: () => {},
    })
  )
}

describe('FindRail distance hint', () => {
  it('shows the hint and points the control at it when disabled', () => {
    const html = render(true)
    expect(html).toContain(HINT)
    expect(html).toContain('id="radius-hint"')
    expect(html).toContain('aria-describedby="radius-hint"')
  })

  it('hides the hint when enabled', () => {
    const html = render(false)
    expect(html).not.toContain(HINT)
    expect(html).not.toContain('radius-hint')
  })
})
