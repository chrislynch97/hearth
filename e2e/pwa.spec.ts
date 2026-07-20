// The server answers any unknown non-/trpc path with the SPA shell, so a missing
// static asset comes back as 200 text/html rather than a 404 — which is how the
// favicon stayed broken in every built deploy until #144. Assert the content
// type, not just the status.

import { expect, test } from './fixtures'

const ASSETS = [
  { path: '/manifest.webmanifest', type: /application\/manifest\+json/ },
  { path: '/icons/favicon.svg', type: /image\/svg\+xml/ },
  { path: '/icons/icon-192.png', type: /image\/png/ },
  { path: '/icons/icon-512.png', type: /image\/png/ },
  { path: '/icons/icon-maskable-512.png', type: /image\/png/ },
  { path: '/icons/apple-touch-icon.png', type: /image\/png/ },
]

test('the PWA assets are served from the build, not the SPA fallback', async ({ request }) => {
  for (const asset of ASSETS) {
    const res = await request.get(asset.path)
    expect(res.status(), `${asset.path} status`).toBe(200)
    expect(res.headers()['content-type'], `${asset.path} content-type`).toMatch(asset.type)
  }
})

test('the manifest declares an installable app', async ({ request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json()

  expect(manifest.name).toBe('Hearth')
  expect(manifest.display).toBe('standalone')
  expect(manifest.start_url).toBe('/')

  // Chrome requires a 192px and a 512px icon before it will offer to install,
  // and Android needs a maskable one to avoid letterboxing the icon.
  const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes)
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']))
  expect(manifest.icons.some((icon: { purpose: string }) => icon.purpose === 'maskable')).toBe(true)

  // Every icon the manifest promises has to actually exist.
  for (const icon of manifest.icons as { src: string }[]) {
    expect((await request.get(icon.src)).status(), `${icon.src} status`).toBe(200)
  }
})

test('the document links the manifest and an iOS touch icon', async ({ page }) => {
  await page.goto('/')

  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest')
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    'href',
    '/icons/apple-touch-icon.png'
  )
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute(
    'content',
    'yes'
  )
})
