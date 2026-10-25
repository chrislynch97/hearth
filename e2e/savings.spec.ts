import { expect, test } from './fixtures'

test('savings planners list the goals and open one to answer a what-if', async ({ page }) => {
  await page.goto('/planners')

  await expect(page.getByRole('heading', { name: 'Savings planners' })).toBeVisible()

  // The demo wedding runs ahead of its target (src/server/db/demo.ts).
  await page.getByRole('link', { name: /Wedding/ }).click()
  await expect(page).toHaveURL(/\/planners\/wedding$/)
  await expect(page.getByRole('heading', { name: 'Wedding' })).toBeVisible()
  await expect(page.getByText(/puts you £[\d,.]+ over/)).toBeVisible()
  await expect(page.locator('.recharts-surface')).toBeVisible()

  // A much smaller amount can't make it, and the sentence says so.
  await page.getByLabel('What if we put in').fill('50')
  await expect(page.getByText(/you're £[\d,.]+ short on/)).toBeVisible()
})
