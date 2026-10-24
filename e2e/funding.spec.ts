import { expect, test } from './fixtures'

test('funding plan shows a per-person breakdown', async ({ page }) => {
  await page.goto('/funding')

  await expect(page.getByRole('heading', { name: 'Funding Plan' })).toBeVisible()

  // Ava and Ben are the demo household's two people (src/server/db/demo.ts).
  for (const person of ['Ava', 'Ben']) {
    // Level 2 is the person's own card; their name also heads groups (level 3) in other cards.
    const card = page.locator('section').filter({ has: page.getByRole('heading', { name: person, exact: true, level: 2 }) })
    await expect(card).toContainText('By standing order')
    // A real money figure, not a spinner or a dash.
    await expect(card).toContainText(/£\d/)
  }
})
