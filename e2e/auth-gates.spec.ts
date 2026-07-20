// The login and first-run screens can't be reached in demo mode — the demo
// instance is deliberately password-less and opted into open access, and making
// it otherwise would mean mutating the shared demo database mid-suite. So stub
// the one query that chooses the gate (`auth.status`, sent unbatched on its own
// request — see providers.tsx) and check the client wires each state to the
// right screen. The server side of these gates is covered by the router tests.

import { expect, test } from './fixtures'

type AuthStatus = {
  passwordSet: boolean
  authenticated: boolean
  firstRunRequired: boolean
}

const stubAuthStatus = async (page: import('@playwright/test').Page, status: AuthStatus) => {
  await page.route('**/trpc/auth.status*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      // superjson envelope — the tRPC client rejects a bare payload.
      body: JSON.stringify({ result: { data: { json: { ...status, mfaEnabled: false, user: null } } } }),
    })
  )
}

test('a locked instance shows the login gate', async ({ page }) => {
  await stubAuthStatus(page, { passwordSet: true, authenticated: false, firstRunRequired: false })
  await page.goto('/')

  await expect(page.getByText('Sign in to your household.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Unlock' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Overview' })).toHaveCount(0)
})

test('an open-but-exposed instance shows the first-run gate', async ({ page }) => {
  await stubAuthStatus(page, { passwordSet: false, authenticated: true, firstRunRequired: true })
  await page.goto('/')

  await expect(page.getByRole('button', { name: 'Set password & unlock' })).toBeVisible()
  await expect(page.getByLabel('Owner password')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Overview' })).toHaveCount(0)
})
