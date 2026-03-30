import { test, expect } from '@playwright/test'
import { injectAuth, mockApis, waitForPage } from './helpers'

test.describe('Profile / Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await mockApis(page)
    await page.goto('/profile')
    await waitForPage(page)
  })

  test('profile page renders with user info', async ({ page }) => {
    // Name is populated in the Full Name input (user may not be reflected in h2 until after re-render)
    await expect(page.locator('input#profile-name')).toHaveValue('Test Executive')
  })

  test('sign out button is present', async ({ page }) => {
    const isMobile = page.viewportSize()!.width < 768
    const signOutBtns = page.locator('button', { hasText: /Sign out|Logout|Log out/ })
    if (isMobile) {
      // On mobile, sidebar is hidden — sign-out is in ProfilePage (last in DOM)
      await expect(signOutBtns.last()).toBeVisible()
    } else {
      // On desktop, sign-out is in the sidebar (first in DOM)
      await expect(signOutBtns.first()).toBeVisible()
    }
  })

  test('no horizontal overflow', async ({ page }) => {
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    const clientWidth = await page.evaluate(() => window.innerWidth)
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2)
  })
})
