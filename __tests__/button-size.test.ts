import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import Button from '@/components/ui/Button'

function classesOf(props: Record<string, unknown>): string {
  const html = renderToStaticMarkup(createElement(Button, props, 'Add'))
  return html.match(/class="([^"]*)"/)![1]
}

describe('Button size prop (issue #625)', () => {
  it('sm renders a fixed width and small padding, without md padding', () => {
    const cls = classesOf({ size: 'sm' })
    expect(cls).toContain('w-[68px]')
    expect(cls).toContain('py-[5px]')
    expect(cls).toContain('text-[12.5px]')
    expect(cls).not.toContain('px-[26px]')
    expect(cls).not.toContain('py-[13px]')
  })

  it('default renders the md size', () => {
    const cls = classesOf({})
    expect(cls).toContain('px-[26px]')
    expect(cls).toContain('py-[13px]')
    expect(cls).toContain('text-[15px]')
    expect(cls).not.toContain('w-[68px]')
  })
})
