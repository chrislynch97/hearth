import { expect, test } from './fixtures'

test('funding plan shows a per-person breakdown', async ({ page }) => {
  await page.goto('/funding')

  await expect(page.getByRole('heading', { name: 'Funding Plan' })).toBeVisible()

  // Ava and Ben are the demo household's two people (src/server/db/demo.ts).
  for (const person of ['Ava', 'Ben']) {
    const card = page.locator('[data-slot=card]').filter({ has: page.getByText(person, { exact: true }) })
    await expect(card).toContainText('By standing order')
    // A real money figure, not a spinner or a dash.
    await expect(card).toContainText(/£\d/)
  }
})
