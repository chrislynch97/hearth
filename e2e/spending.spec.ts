import { expect, test } from './fixtures'

test('adding a spend puts it in the register', async ({ page }) => {
  await page.goto('/spending')

  // Unique per run so a re-run against a stale database can't pass on an old row.
  const description = `E2E smoke ${Date.now()}`

  await page.getByLabel('Amount').fill('12.34')
  await page.getByLabel('Description').fill(description)
  await page.getByRole('button', { name: 'Add spend' }).click()

  await expect(page.getByRole('alert')).toContainText('Logged £12.34')
  // `exact` — the row's action buttons are labelled with the description too.
  await expect(page.getByRole('cell', { name: description, exact: true })).toBeVisible()
})
