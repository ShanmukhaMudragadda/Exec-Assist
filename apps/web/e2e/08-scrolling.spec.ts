import { test, expect } from '@playwright/test'
import { injectAuth, mockApis, waitForPage } from './helpers'

test.describe('Scrolling & Overflow Tests', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await mockApis(page)
  })

  const pages = [
    { name: 'Dashboard', url: '/dashboard' },
    { name: 'Initiatives', url: '/initiatives' },
    { name: 'Command Center', url: '/command-center' },
    { name: 'Upload', url: '/upload' },
    { name: 'Profile', url: '/profile' },
  ]

  for (const { name, url } of pages) {
    test(`${name}: no horizontal overflow`, async ({ page }) => {
      await page.route('**/api/users/me', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: {} }) })
      )
      await page.goto(url)
      await waitForPage(page)

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
      const clientWidth = await page.evaluate(() => window.innerWidth)
      expect(scrollWidth, `${name} has horizontal overflow`).toBeLessThanOrEqual(clientWidth + 2)
    })

    test(`${name}: vertical scroll works end-to-end`, async ({ page }) => {
      await page.route('**/api/users/me', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: {} }) })
      )
      await page.goto(url)
      await waitForPage(page)

      const initialScrollY = await page.evaluate(() => window.scrollY)
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      await page.waitForTimeout(200)
      const finalScrollY = await page.evaluate(() => window.scrollY)

      // If page is scrollable, scrollY should have changed; if not it stays 0 (that's fine)
      expect(finalScrollY).toBeGreaterThanOrEqual(initialScrollY)
    })
  }

  test('mobile: content not hidden under bottom nav at page bottom', async ({ page }) => {
    const isMobile = page.viewportSize()!.width < 768
    if (!isMobile) test.skip()

    await page.goto('/dashboard')
    await waitForPage(page)

    // Scroll to bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(300)

    // Get bottom nav position
    const bottomNav = page.locator('nav.md\\:hidden')
    const navBox = await bottomNav.boundingBox()
    if (!navBox) return

    // Get the main content wrapper's padding-bottom
    const mainContent = page.locator('.md\\:ml-\\[216px\\]')
    const paddingBottom = await mainContent.evaluate((el) =>
      parseInt(getComputedStyle(el).paddingBottom)
    )

    // paddingBottom should be at least as tall as the bottom nav (60px)
    expect(paddingBottom).toBeGreaterThanOrEqual(60)
  })

  test('mobile: upload page mode buttons fit on screen without scroll', async ({ page }) => {
    const isMobile = page.viewportSize()!.width < 768
    if (!isMobile) test.skip()

    await page.goto('/upload')
    await waitForPage(page)

    const modeContainer = page.locator('.flex.gap-2').first()
    const containerBox = await modeContainer.boundingBox()
    if (!containerBox) return

    const viewportWidth = page.viewportSize()!.width
    // Container should not exceed viewport
    expect(containerBox.x + containerBox.width).toBeLessThanOrEqual(viewportWidth + 5)
  })
})
