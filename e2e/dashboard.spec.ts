import { expect, test } from './fixtures'

test.describe('dashboard', () => {
  test('boots straight into the app with seeded data', async ({ page }) => {
    await page.goto('/')

    // The demo instance has no owner password, so neither auth gate should show.
    await expect(page.getByRole('heading', { level: 2 })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Unlock' })).toHaveCount(0)

    // Money is mostly built, so it starts open; Home is all "Soon", so it starts
    // folded.
    const nav = page.getByRole('navigation', { name: 'Main' })
    await expect(nav.getByRole('link', { name: 'Overview' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Spending' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Rooms' })).toHaveCount(0)
  })

  test('nav links route to their pages', async ({ page }) => {
    await page.goto('/')

    // Clicking through the nav (rather than goto) is the bit that catches a
    // router-migration regression: the client-side transition, not just the URL.
    const nav = page.getByRole('navigation', { name: 'Main' })
    await nav.getByRole('link', { name: 'Plan', exact: true }).click()
    await expect(page).toHaveURL(/\/plan$/)
    await expect(page.getByRole('heading', { name: 'Plan' })).toBeVisible()
    await expect(nav.locator('[data-active="true"]')).toHaveText('Plan')

    // Categories, Pots and Bills folded into Plan: still routable, off the list.
    await expect(nav.getByRole('link', { name: 'Pots' })).toHaveCount(0)

    await nav.getByRole('link', { name: 'Upcoming' }).click()
    await expect(page).toHaveURL(/\/upcoming$/)
  })

  test('unfolds a section and jumps to a page by name', async ({ page }) => {
    await page.goto('/')

    const nav = page.getByRole('navigation', { name: 'Main' })
    await nav.getByRole('button', { name: 'Home' }).click()
    await nav.getByRole('link', { name: 'Rooms' }).click()
    await expect(page).toHaveURL(/\/rooms$/)

    await page.keyboard.press('/')
    await page.keyboard.type('payslips')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/payslips$/)
  })

  test('opens a full-screen menu on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')

    await page.getByRole('button', { name: 'Open menu' }).click()
    const menu = page.getByRole('dialog', { name: 'Menu' })
    await expect(menu).toBeVisible()

    // Picking a page is the end of the trip, so the menu gets out of the way.
    await menu.getByRole('link', { name: 'Spending' }).click()
    await expect(page).toHaveURL(/\/spending$/)
    await expect(menu).toBeHidden()
  })
})
