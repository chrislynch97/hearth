import { readFile } from 'node:fs/promises'
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

// The portability right (#228) is only real if the button actually produces the
// file, so drive the download and read what landed.
test('a household owner can download their own household as JSON', async ({ page }) => {
  await page.goto('/settings/household')

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download my data' }).click()
  const file = await download

  expect(file.suggestedFilename()).toMatch(/^hearth-maple-street-\d{4}-\d{2}-\d{2}\.json$/)
  const snapshot = JSON.parse(await readFile(await file.path(), 'utf8')) as {
    tables: Record<string, Array<Record<string, unknown>>>
  }
  expect(snapshot.tables['household']).toHaveLength(1)
  expect(snapshot.tables['spendTransaction']?.length).toBeGreaterThan(0)
  // Credentials never leave the instance, even for the owner's own household.
  for (const u of snapshot.tables['user'] ?? []) expect(u['passwordHash']).toBeNull()
})

// The demo instance only ever has the primary household, which `eraseHousehold`
// refuses — so what's checkable end to end is that the UI says why rather than
// hiding the control. The confirmation flow itself is driven in
// src/client/pages/settings/HouseholdDataSection.test.tsx, which can put the app
// on a household that is erasable.
test('the primary household explains why it can’t be deleted here', async ({ page }) => {
  await page.goto('/settings/household')

  await expect(page.getByText(/can't be deleted here/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled()
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
