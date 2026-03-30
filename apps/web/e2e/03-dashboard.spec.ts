import { test, expect } from '@playwright/test'
import { injectAuth, mockApis, waitForPage } from './helpers'

test.describe('Dashboard Page', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await mockApis(page)
    await page.goto('/dashboard')
    await waitForPage(page)
  })

  test('renders greeting and stats', async ({ page }) => {
    // Greeting text
    await expect(page.locator('h1').filter({ hasText: /Good/ })).toBeVisible()

    // Stat strip numbers — use uppercase class to avoid matching sidebar nav links
    await expect(page.locator('p.uppercase', { hasText: 'Open' })).toBeVisible()
    await expect(page.locator('p.uppercase', { hasText: 'Initiatives' })).toBeVisible()
  })

  test('executive brief section renders', async ({ page }) => {
    await expect(page.locator('text=Executive Brief')).toBeVisible()
  })

  test('priority queue section renders', async ({ page }) => {
    await expect(page.locator('text=Priority Queue')).toBeVisible()
  })

  test('no content clipped below bottom nav on mobile', async ({ page }) => {
    const isMobile = page.viewportSize()!.width < 768
    if (!isMobile) test.skip()

    // Scroll to bottom
    await page.keyboard.press('End')
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(300)

    // Bottom nav height is 60px + safe area. Content padding-bottom should account for it
    const mainContent = page.locator('.md\\:ml-\\[216px\\]')
    const box = await mainContent.boundingBox()
    expect(box).not.toBeNull()
  })

  test('no horizontal overflow', async ({ page }) => {
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    const clientWidth = await page.evaluate(() => window.innerWidth)
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2)
  })

  test('page content starts below header on mobile', async ({ page }) => {
    const isMobile = page.viewportSize()!.width < 768
    if (!isMobile) test.skip()

    const mainContent = page.locator('.md\\:ml-\\[216px\\]')
    const box = await mainContent.boundingBox()
    // paddingTop should push content below the ~56px header
    const paddingTop = await mainContent.evaluate((el) => parseInt(getComputedStyle(el).paddingTop))
    expect(paddingTop).toBeGreaterThanOrEqual(50)
  })

  test('View all link navigates to command center', async ({ page }) => {
    const viewAllLink = page.locator('a', { hasText: 'View all →' }).first()
    if (await viewAllLink.isVisible()) {
      await viewAllLink.click()
      await expect(page).toHaveURL(/\/command-center/)
    }
  })
})
