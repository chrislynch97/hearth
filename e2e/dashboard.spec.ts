import { expect, test } from './fixtures'

test.describe('dashboard', () => {
  test('boots straight into the app with seeded data', async ({ page }) => {
    await page.goto('/')

    // The demo instance has no owner password, so neither auth gate should show.
    await expect(page.getByRole('heading', { level: 2 })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Unlock' })).toHaveCount(0)

    await expect(page.getByRole('link', { name: 'Overview' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Spending' })).toBeVisible()
  })

  test('nav links route to their pages', async ({ page }) => {
    await page.goto('/')

    // Clicking through the nav (rather than goto) is the bit that catches a
    // router-migration regression: the client-side transition, not just the URL.
    await page.getByRole('link', { name: 'Pots' }).click()
    await expect(page).toHaveURL(/\/pots$/)
    await expect(page.getByRole('heading', { name: 'Pots' })).toBeVisible()

    await page.getByRole('link', { name: 'Bills', exact: true }).click()
    await expect(page).toHaveURL(/\/outgoings$/)
  })
})
