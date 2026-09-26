/**
 * __tests__/school-transit-missing.test.tsx
 *
 * Issue #474 — the "Getting there" transit rows follow the same rule as the
 * stat grid (#472) and activity groups (#473): a missing DOE field is a mark
 * (MissingMark), never a sentence. This mirrors the exact Subway/Bus JSX from
 * SchoolDetailClient.tsx (see the source-text check below, which keeps this
 * mirror honest) so the row can be rendered without the Clerk/PostHog
 * providers the full client component requires.
 */

import * as fs from 'fs'
import * as path from 'path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import MissingMark from '@/components/ui/MissingMark'

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf-8')
}

function TransitSection({ subwayLines, busRoutes }: { subwayLines: string[]; busRoutes: string[] }) {
  return (
    <div className="flex flex-col gap-[11px]">
      <div className="flex flex-col gap-[6px]">
        <span className="text-[12.5px] text-faint">Subway</span>
        {subwayLines.length > 0 ? (
          <div className="flex flex-wrap gap-[6px]">
            {subwayLines.map((l) => (
              <span key={l} className="font-mono text-[13px] px-[9px] py-1 border border-border text-ink">
                {l}
              </span>
            ))}
          </div>
        ) : (
          <MissingMark kind="not_reported" className="text-[13px]" />
        )}
      </div>
      <div className="flex flex-col gap-[6px]">
        <span className="text-[12.5px] text-faint">Bus</span>
        {busRoutes.length > 0 ? (
          <div className="flex flex-wrap gap-[6px]">
            {busRoutes.map((r) => (
              <span key={r} className="font-mono text-[13px] px-[9px] py-1 border border-border text-ink">
                {r}
              </span>
            ))}
          </div>
        ) : (
          <MissingMark kind="not_reported" className="text-[13px]" />
        )}
      </div>
    </div>
  )
}

describe('school page transit rows: missing subway/bus show n/a, not a sentence (issue #474)', () => {
  it('a school with subway lines and no bus routes shows the Subway chips and a Bus n/a mark with the DOE tooltip', () => {
    const html = renderToStaticMarkup(
      React.createElement(TransitSection, { subwayLines: ['F', 'G'], busRoutes: [] })
    )
    expect(html).toContain('>F<')
    expect(html).toContain('>G<')
    expect(html).toContain('>n/a<')
    expect(html).toContain('title="The DOE didn&#x27;t publish this."')
    expect(html).toContain('aria-label="The DOE didn&#x27;t publish this."')
  })

  it('a school with no subway lines and some bus routes shows a Subway n/a mark and the Bus chips', () => {
    const html = renderToStaticMarkup(
      React.createElement(TransitSection, { subwayLines: [], busRoutes: ['B41'] })
    )
    expect(html).toContain('>B41<')
    expect(html).toContain('>n/a<')
  })

  it('matches the live Subway/Bus JSX in SchoolDetailClient.tsx (keeps this mirror honest)', () => {
    const src = readSource('app/school/[dbn]/SchoolDetailClient.tsx')
    expect(src).toMatch(/Subway[\s\S]{0,700}MissingMark kind="not_reported"/)
    expect(src).toMatch(/Bus[\s\S]{0,700}MissingMark kind="not_reported"/)
    expect(src).not.toContain('NotReportedLine')
    expect(src).not.toContain('notReportedTransitLabel')
  })
})
