import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  ADMISSION_METHOD_COPY,
  admissionMethodMeaning,
  admissionMethodSlug,
  admissionMethodTerm,
} from '@/lib/school-list-utils'
import Page from '@/app/admission-methods/page'

jest.mock('@/components/AuthControls', () => ({ __esModule: true, default: () => null }))
jest.mock('@/components/Footer', () => ({ __esModule: true, default: () => null }))

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/"/g, '&quot;')

describe('admission method helpers', () => {
  it('derives terms, slugs and meanings', () => {
    expect(admissionMethodTerm('Screened with Assessment')).toBe('Screened + assessment')
    expect(admissionMethodSlug('Screened with Assessment')).toBe('screened-assessment')
    expect(admissionMethodTerm('SHSAT')).toBe('Specialized')
    expect(admissionMethodSlug('SHSAT')).toBe('specialized')
    expect(admissionMethodMeaning('Screened')).toBe('the school ranks applicants on criteria such as grades')
    expect(admissionMethodTerm('Unknown')).toBe('Unknown')
  })
})

describe('/admission-methods page', () => {
  it('renders every method once with id, term and meaning', () => {
    const html = renderToStaticMarkup(React.createElement(Page))
    for (const m of Object.keys(ADMISSION_METHOD_COPY)) {
      expect(html).toContain(`id="${admissionMethodSlug(m)}"`)
      expect(html).toContain(esc(admissionMethodTerm(m)))
      expect(html).toContain(esc(admissionMethodMeaning(m)))
    }
  })
})
