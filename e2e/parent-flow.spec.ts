import { test, expect } from '@playwright/test'
import { ADMISSION_METHOD_COPY } from '../lib/school-list-utils'
import { extractMatchCount } from './find-count'

/**
 * Issue #286: the one browser test that clicks through the real, deployed
 * site as a signed-out parent — every Jest file in __tests__/ runs against
 * fake data in Node, so none of them would have caught the two production
 * incidents smoke.ts documents (a collapsed school list, a 500 on every
 * school detail page). This is the same idea one layer up: real HTML, real
 * Clerk, real MySchools links.
 *
 * Stops short of the ask box (#284/#285 cover it — it calls a paid model and
 * is rate-limited) and short of ever completing sign-up (no email is typed,
 * nothing is submitted, no account is created — see the "signed out, click
 * Save" step below).
 *
 * PostHog must not see any of this: it would count a scripted run as a
 * parent session and skew every funnel metric downstream. Aborting the
 * network requests is simpler and more robust than relying on posthog-js's
 * own opt-out call succeeding before the pages under test fire events.
 *
 * DBN borough letters (K = Brooklyn) come from the DOE code format this repo
 * already validates against in app/api/saved-schools/route.ts
 * (`/^\d{2}[MKXQR]\d{3}$/`), not from a guess.
 */

const ADMISSION_METHODS = Object.keys(ADMISSION_METHOD_COPY)

const MIN_SCHOOLS = 400
const MYSCHOOLS_URL = 'https://www.myschools.nyc'

test('signed-out parent flow', async ({ page }) => {
  // Issue #286: no PostHog events from a scripted run.
  await page.route('**/*posthog*', (route) => route.abort())

  await test.step('home page', async () => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Every NYC public high school')
    await expect(page.getByRole('link', { name: 'AdmitDay home' })).toHaveAttribute('href', '/')
    await expect(page.getByRole('link', { name: 'Find', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Shortlist', exact: true })).toBeVisible()
  })

  let citywideCount = 0

  await test.step('/find lists schools with a count', async () => {
    await page.goto('/find')
    const bodyText = await page.locator('body').innerText()
    const count = extractMatchCount(bodyText, 'citywide')
    expect(count, 'expected a "N matches citywide" count on /find').not.toBeNull()
    citywideCount = count as number
    expect(citywideCount).toBeGreaterThanOrEqual(MIN_SCHOOLS)
  })

  await test.step('borough filter narrows the list to Brooklyn', async () => {
    await page.getByText('Brooklyn', { exact: true }).click()
    await expect(page.getByText(/match(?:es)? in Brooklyn/)).toBeVisible()

    const bodyText = await page.locator('body').innerText()
    const brooklynCount = extractMatchCount(bodyText, 'in Brooklyn')
    expect(brooklynCount).not.toBeNull()
    expect(brooklynCount as number).toBeLessThan(citywideCount)

    const hrefs = await page.locator('a[href^="/school/"]').evaluateAll((els) =>
      els.map((el) => el.getAttribute('href') || '')
    )
    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) {
      const dbn = href.match(/\/school\/([^/?]+)/)?.[1] ?? ''
      expect(dbn.length, `unexpected school href: ${href}`).toBeGreaterThanOrEqual(3)
      expect(dbn[2], `${dbn} (from ${href}) should be a Brooklyn school`).toBe('K')
    }
  })

  await test.step('open the first school', async () => {
    await page.locator('a[href^="/school/"]').first().click()
    await page.waitForURL(/\/school\//)

    const programsHeading = page.getByText('Programs', { exact: true })
    await expect(programsHeading).toBeVisible()
    // Scoped to the Programs block (its grandparent), not the whole page —
    // "Find" is also part of the "Find {dbn} on MySchools" link text below it.
    const programsSection = await programsHeading.locator('xpath=../..').innerText()
    expect(ADMISSION_METHODS.some((method) => programsSection.includes(method))).toBe(true)

    // Issue #482: per-school MySchools pages require a MySchools login, so the
    // link goes to the public High School directory instead, and its label
    // carries the DBN from the current /school/{dbn} URL.
    const dbn = new URL(page.url()).pathname.match(/\/school\/([^/?]+)/)?.[1] ?? ''
    expect(dbn.length).toBeGreaterThanOrEqual(3)
    await expect(page.getByRole('link', { name: /on MySchools/ }).first()).toHaveAttribute(
      'href',
      `${MYSCHOOLS_URL}/en/schools/high-school/`
    )
  })

  await test.step('Save while signed out opens the Clerk sign-up box — stop there', async () => {
    await page.getByRole('button', { name: 'Add to list' }).click()
    // Whatever Clerk's exact copy is, a sign-up form always has a way to
    // enter an email — that's the signal a real form mounted, not a no-op.
    await expect(
      page.locator('input[type="email"], input[name="emailAddress"], input[autocomplete="email"]').first()
    ).toBeVisible()
    // Deliberately stop here: no typing, no submit, no account created.
  })

  await test.step('/shortlist asks a signed-out visitor to sign in', async () => {
    await page.goto('/shortlist')
    await expect(page.getByText('Sign in to see your saved schools.')).toBeVisible()
  })

  await test.step('an excluded school 404s', async () => {
    const response = await page.goto('/school/08X537')
    expect(response?.status()).toBe(404)
  })
})
