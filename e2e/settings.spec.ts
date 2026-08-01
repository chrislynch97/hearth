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

// The whole point of the off-site restore panel (#114) is that it works on a host
// with no filesystem to hand — so drive it end to end: take a real backup, and
// check the copy that landed off-site is offered back.
test('a backup lands off-site and is offered for restore', async ({ page }) => {
  await page.goto('/settings/system')
  await expect(page.getByText('Restore from off-site')).toBeVisible()

  // The snapshot is verified by restoring it into a throwaway database, which
  // takes a few seconds on a cold PGlite.
  await page.getByRole('button', { name: 'Back up now' }).click()
  await expect(page.getByText(/Off-site copy uploaded \(directory\)/)).toBeVisible({ timeout: 60_000 })

  // Count isn't asserted: the off-site directory survives between runs, and the
  // scheduler may have taken its own backup on boot. That a copy landed this run
  // is what the message above proves.
  await page.getByRole('combobox', { name: 'Backup' }).click()
  await expect(page.getByRole('option').first()).toBeVisible()
})
