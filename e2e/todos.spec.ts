import { expect, test } from './fixtures'

test('a wedding list keeps its own to-dos, filters by tag and ticks them off', async ({ page }) => {
  await page.goto('/todos')
  await expect(page.getByRole('heading', { name: 'To-dos', level: 1 })).toBeVisible()

  // The seeded wedding list (src/server/db/demo.ts).
  await page.getByRole('button', { name: /^Wedding/ }).click()
  await expect(page).toHaveURL(/\/todos\/[0-9a-z]{6}-wedding/)
  await expect(page.getByText(/\d+ of \d+ done/)).toBeVisible()
  await expect(page.getByText('Bin bags')).toBeHidden()

  await page.getByRole('button', { name: 'Food', exact: true }).click()
  await expect(page.getByText('Order the cake')).toBeVisible()
  await expect(page.getByText('Plan the seating')).toBeHidden()

  // Unique per run; added under the filter, so it carries the tag and stays in view.
  const title = `E2E smoke ${Date.now()}`
  await page.getByLabel('What needs doing').fill(title)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText(title)).toBeVisible()

  await page.getByRole('checkbox', { name: `Done: ${title}` }).click()
  await page.getByRole('button', { name: /^Done \(/ }).click()
  await expect(page.getByRole('checkbox', { name: `Done: ${title}` })).toBeChecked()
})
