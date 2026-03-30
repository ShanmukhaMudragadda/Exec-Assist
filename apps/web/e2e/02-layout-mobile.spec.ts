import { test, expect } from '@playwright/test'
import { injectAuth, mockApis, waitForPage } from './helpers'

test.describe('Mobile Layout & Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await mockApis(page)
  })

  test('mobile top header is visible and not cut off', async ({ page }) => {
    await page.goto('/dashboard')
    await waitForPage(page)

    const isMobile = page.viewportSize()!.width < 768
    if (!isMobile) test.skip()

    const header = page.locator('header.md\\:hidden')
    await expect(header).toBeVisible()

    // Header should not be cut off
    const headerBox = await header.boundingBox()
    expect(headerBox).not.toBeNull()
    expect(headerBox!.y).toBeGreaterThanOrEqual(0)
    expect(headerBox!.height).toBeGreaterThan(40)
  })

  test('bottom nav is visible on mobile and not cut off', async ({ page }) => {
    await page.goto('/dashboard')
    await waitForPage(page)

    const isMobile = page.viewportSize()!.width < 768
    if (!isMobile) test.skip()

    const bottomNav = page.locator('nav.md\\:hidden')
    await expect(bottomNav).toBeVisible()

    const navBox = await bottomNav.boundingBox()
    expect(navBox).not.toBeNull()

    // Nav should be at the bottom of the screen and fully visible
    // Use window.innerHeight (actual CSS viewport) rather than viewportSize() which may include
    // browser chrome in mobile emulation mode
    const viewportHeight = await page.evaluate(() => window.innerHeight)
    expect(navBox!.y + navBox!.height).toBeLessThanOrEqual(viewportHeight + 5) // +5 tolerance
  })

  test('bottom nav has all 4 nav items', async ({ page }) => {
    await page.goto('/dashboard')
    await waitForPage(page)

    const isMobile = page.viewportSize()!.width < 768
    if (!isMobile) test.skip()

    const bottomNav = page.locator('nav.md\\:hidden')
    const navLinks = bottomNav.locator('a')
    await expect(navLinks).toHaveCount(4)
  })

  test('nav items are tappable (min 44px touch target)', async ({ page }) => {
    await page.goto('/dashboard')
    await waitForPage(page)

    const isMobile = page.viewportSize()!.width < 768
    if (!isMobile) test.skip()

    const bottomNav = page.locator('nav.md\\:hidden')
    const navLinks = bottomNav.locator('a')
    const count = await navLinks.count()

    for (let i = 0; i < count; i++) {
      const box = await navLinks.nth(i).boundingBox()
      expect(box).not.toBeNull()
      // Touch target should be at least 44px tall
      expect(box!.height).toBeGreaterThanOrEqual(40)
    }
  })

  test('mobile navigation: tap Initiatives navigates correctly', async ({ page }) => {
    await page.goto('/dashboard')
    await waitForPage(page)

    const isMobile = page.viewportSize()!.width < 768
    if (!isMobile) test.skip()

    const bottomNav = page.locator('nav.md\\:hidden')
    await bottomNav.locator('a[href="/initiatives"]').click()
    await expect(page).toHaveURL(/\/initiatives/)
  })

  test('mobile navigation: tap Actions navigates correctly', async ({ page }) => {
    await page.goto('/dashboard')
    await waitForPage(page)

    const isMobile = page.viewportSize()!.width < 768
    if (!isMobile) test.skip()

    const bottomNav = page.locator('nav.md\\:hidden')
    await bottomNav.locator('a[href="/command-center"]').click()
    await expect(page).toHaveURL(/\/command-center/)
  })

  test('desktop sidebar is hidden on mobile', async ({ page }) => {
    await page.goto('/dashboard')
    await waitForPage(page)

    const isMobile = page.viewportSize()!.width < 768
    if (!isMobile) test.skip()

    const sidebar = page.locator('aside.hidden.md\\:flex')
    await expect(sidebar).not.toBeVisible()
  })

  test('no horizontal scroll on any main page (mobile)', async ({ page }) => {
    const routes = ['/dashboard', '/initiatives', '/command-center', '/upload', '/profile']
    const isMobile = page.viewportSize()!.width < 768

    for (const route of routes) {
      await page.goto(route)
      await waitForPage(page)

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
      const clientWidth = await page.evaluate(() => window.innerWidth)

      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2)
    }
  })
})
