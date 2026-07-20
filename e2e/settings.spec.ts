import { expect, test } from './fixtures'

test('settings tabs open', async ({ page }) => {
  // /settings redirects to the first tab everyone can see.
  await page.goto('/settings')
  await expect(page).toHaveURL(/\/settings\/account$/)
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

  await page.getByRole('tab', { name: 'Household' }).click()
  await expect(page).toHaveURL(/\/settings\/household$/)
  await expect(page.getByLabel('Household name')).toBeVisible()

  await page.getByRole('tab', { name: 'Account' }).click()
  await expect(page).toHaveURL(/\/settings\/account$/)
})
