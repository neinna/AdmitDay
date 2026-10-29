import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import AskPending from '../app/find/AskPending'

describe('AskPending (issue #582)', () => {
  const html = renderToStaticMarkup(React.createElement(AskPending))

  it('renders a status line with the seconds counter at 0', () => {
    expect(html).toContain('role="status"')
    expect(html).toContain('Searching schools and writing an answer')
    expect(html).toContain('0s')
  })

  it('renders the moving bar inside an aria-hidden wrapper', () => {
    expect(html).toContain('ask-progress-bar')
    expect(html).toMatch(/aria-hidden="true"[^>]*><div class="ask-progress-bar/)
  })
})
