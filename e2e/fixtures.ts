// Shared test base. Every spec gets the console/page-error check for free: a
// page that renders but logs a React or tRPC error is a failure we want to see,
// and it's exactly the kind of breakage a "does it render" assertion misses.

import { test as base, expect } from '@playwright/test'

// Errors that say nothing about the app. Keep this list short and justified —
// each entry is a blind spot.
const IGNORED = [
  // Chromium logs this for the favicon on some runs; not app code.
  /favicon\.ico/,
]

const isIgnored = (text: string) => IGNORED.some((re) => re.test(text))

export const test = base.extend<{ consoleGuard: void }>({
  consoleGuard: [
    async ({ page }, use, testInfo) => {
      const errors: string[] = []
      page.on('console', (msg) => {
        if (msg.type() === 'error' && !isIgnored(msg.text())) errors.push(`console: ${msg.text()}`)
      })
      page.on('pageerror', (err) => errors.push(`uncaught: ${err.message}`))

      await use()

      // Don't pile a console assertion on top of an already-failing test — the
      // original failure is the useful one.
      if (testInfo.status === testInfo.expectedStatus) {
        expect(errors, 'page logged errors').toEqual([])
      }
    },
    { auto: true },
  ],
})

export { expect }
