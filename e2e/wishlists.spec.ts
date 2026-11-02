import { expect, test } from './fixtures'

test('a wish list keeps its own items, filters by tag and ticks them off as bought', async ({ page }) => {
  await page.goto('/wishlists')
  await expect(page.getByRole('heading', { name: 'Wish lists', level: 1 })).toBeVisible()

  // The seeded kitchen list (src/server/db/demo.ts).
  await page.getByRole('button', { name: /^Kitchen/ }).click()
  await expect(page).toHaveURL(/\/wishlists\/[0-9a-z]{6}-kitchen/)
  await expect(page.getByText('Garden bench')).toBeHidden()

  await page.getByRole('button', { name: 'Baking', exact: true }).click()
  await expect(page.getByText('Stand mixer')).toBeVisible()
  await expect(page.getByText('Knife block')).toBeHidden()

  // Unique per run; added under the filter, so it carries the tag and stays in view.
  const name = `E2E smoke ${Date.now()}`
  await page.getByLabel('What do you want').fill(name)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText(name)).toBeVisible()

  await page.getByRole('checkbox', { name: `Bought: ${name}` }).click()
  await page.getByRole('button', { name: /^Bought \(/ }).click()
  await expect(page.getByRole('checkbox', { name: `Bought: ${name}` })).toBeChecked()
})
