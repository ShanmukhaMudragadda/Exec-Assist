import { test, expect } from '@playwright/test'
import { waitForPage } from './helpers'

test.describe('Login Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth/login')
  })

  test('shows login page correctly on desktop', async ({ page }) => {
    const viewport = page.viewportSize()
    if (!viewport || viewport.width < 1024) test.skip()
    // Left panel visible on desktop (hidden lg:flex means visible at lg breakpoint = 1024px)
    await expect(page.locator('text=ExecAssist').first()).toBeVisible()
    await expect(page.locator('text=Welcome')).toBeVisible()
    await expect(page.locator('#google-signin-btn')).toBeVisible()
  })

  test('shows mobile-friendly login on mobile', async ({ page }) => {
    await page.goto('/auth/login')
    const viewport = page.viewportSize()
    if (!viewport || viewport.width >= 768) test.skip()
    // Left panel should be hidden on mobile (hidden lg:flex)
    const leftPanel = page.locator('section.hidden.lg\\:flex')
    await expect(leftPanel).not.toBeVisible()

    // Mobile logo should be visible
    const mobileLogo = page.locator('.lg\\:hidden').first()
    await expect(mobileLogo).toBeVisible()

    // Sign-in button should be visible
    await expect(page.locator('#google-signin-btn')).toBeVisible()
  })

  test('no horizontal overflow on mobile', async ({ page }) => {
    const bodyWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    const windowWidth = await page.evaluate(() => window.innerWidth)
    expect(bodyWidth).toBeLessThanOrEqual(windowWidth + 2)
  })

  test('error message area renders', async ({ page }) => {
    // Error div is only shown when error exists, so it should not be visible by default
    const errorDiv = page.locator('[class*="bg-red-50"]')
    await expect(errorDiv).not.toBeVisible()
  })

  test('redirect to dashboard when already authenticated', async ({ page }) => {
    const { injectAuth, mockApis } = await import('./helpers')
    await injectAuth(page)
    await mockApis(page)
    await page.goto('/auth/login')
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 8000 })
  })
})
