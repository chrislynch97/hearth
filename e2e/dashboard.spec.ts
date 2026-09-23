import { expect, test } from './fixtures'

test.describe('dashboard', () => {
  test('boots straight into the app with seeded data', async ({ page }) => {
    await page.goto('/')

    // The demo instance has no owner password, so neither auth gate should show.
    await expect(page.getByRole('heading', { level: 2 })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Unlock' })).toHaveCount(0)

    // Overview belongs to no section, so the rail is the whole sidebar here —
    // the page-list tier only appears once you're inside a section.
    const rail = page.getByRole('navigation', { name: 'Sections' })
    await expect(rail.getByRole('link', { name: 'Overview' })).toBeVisible()
    await expect(rail.getByRole('link', { name: 'Money' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Spending' })).toHaveCount(0)
  })

  test('nav links route to their pages', async ({ page }) => {
    await page.goto('/')

    // Clicking through the nav (rather than goto) is the bit that catches a
    // router-migration regression: the client-side transition, not just the URL.
    // A rail section navigates to its first page and opens that section's list.
    const rail = page.getByRole('navigation', { name: 'Sections' })
    await rail.getByRole('link', { name: 'Money' }).click()
    await expect(page).toHaveURL(/\/plan$/)

    const pages = page.getByRole('navigation', { name: 'Money pages' })
    await expect(page.getByRole('heading', { name: 'Plan' })).toBeVisible()

    // Categories, Pots and Bills folded into Plan: still routable, off the list.
    await expect(pages.getByRole('link', { name: 'Pots' })).toHaveCount(0)

    await pages.getByRole('link', { name: 'Upcoming' }).click()
    await expect(page).toHaveURL(/\/upcoming$/)
  })

  test('shows one section at a time, with one rail item lit', async ({
    page,
  }) => {
    await page.goto('/pots')

    const rail = page.getByRole('navigation', { name: 'Sections' })
    await expect(rail.locator('[aria-current]')).toHaveCount(1)
    await expect(rail.locator('[aria-current]')).toContainText('Money')

    // Home's pages belong to another section, so they aren't on screen until you
    // move there — the list follows the route and nothing else.
    await expect(page.getByRole('link', { name: 'Rooms' })).toHaveCount(0)

    await rail.getByRole('link', { name: 'Home' }).click()
    await expect(page).toHaveURL(/\/rooms$/)
    await expect(rail.locator('[aria-current]')).toHaveCount(1)
    await expect(rail.locator('[aria-current]')).toContainText('Home')
  })
})
