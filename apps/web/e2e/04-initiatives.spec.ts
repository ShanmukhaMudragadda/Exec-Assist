import { test, expect } from '@playwright/test'
import { injectAuth, mockApis, waitForPage } from './helpers'

test.describe('Initiatives Page', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await mockApis(page)
    await page.goto('/initiatives')
    await waitForPage(page)
  })

  test('page title and New Initiative button visible', async ({ page }) => {
    await expect(page.locator('h1', { hasText: 'Initiatives' })).toBeVisible()
    await expect(page.locator('button', { hasText: 'New Initiative' })).toBeVisible()
  })

  test('status tabs are visible', async ({ page }) => {
    await expect(page.locator('button', { hasText: 'All' })).toBeVisible()
    await expect(page.locator('button', { hasText: 'Active' })).toBeVisible()
    await expect(page.locator('button', { hasText: 'At Risk' })).toBeVisible()
  })

  test('empty state renders when no initiatives', async ({ page }) => {
    await expect(page.locator('text=No initiatives yet')).toBeVisible()
  })

  test('New Initiative button opens create pane', async ({ page }) => {
    await page.locator('button', { hasText: 'New Initiative' }).click()
    await expect(page.locator('text=New Initiative').nth(1)).toBeVisible()
    // The pane title
    await expect(page.locator('h2', { hasText: 'New Initiative' })).toBeVisible()
  })

  test('create pane closes on cancel', async ({ page }) => {
    await page.locator('button', { hasText: 'New Initiative' }).click()
    await expect(page.locator('h2', { hasText: 'New Initiative' })).toBeVisible()
    // Use close button (always visible at top) — Cancel footer button may require scrolling on mobile
    const closeBtn = page.locator('button').filter({ has: page.locator('span.material-symbols-outlined') }).last()
    if (await closeBtn.isVisible()) {
      await closeBtn.click()
    } else {
      const cancelBtn = page.locator('button', { hasText: 'Cancel' })
      await cancelBtn.scrollIntoViewIfNeeded()
      await cancelBtn.click()
    }
    await expect(page.locator('h2', { hasText: 'New Initiative' })).not.toBeVisible()
  })

  test('no horizontal overflow', async ({ page }) => {
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    const clientWidth = await page.evaluate(() => window.innerWidth)
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2)
  })

  test('New Initiative button meets touch target on mobile', async ({ page }) => {
    const isMobile = page.viewportSize()!.width < 768
    if (!isMobile) test.skip()

    const btn = page.locator('button', { hasText: 'New Initiative' })
    const box = await btn.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.height).toBeGreaterThanOrEqual(44)
  })

  test('with mock initiative data - card renders', async ({ page }) => {
    // Override the initiatives mock to include one initiative
    await page.route('http://localhost:3000/initiatives', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          initiatives: [{
            id: 'init-1', title: 'Q1 Revenue Growth', description: 'Achieve 20% growth', status: 'active',
            priority: 'high', progress: 45, dueDate: '2025-12-31', actionCount: 3,
            actions: [], creator: { id: 'test-user-1', name: 'Test Executive' }, members: [],
          }]
        }),
      })
    )
    await page.reload()
    await waitForPage(page)
    await expect(page.locator('text=Q1 Revenue Growth')).toBeVisible()
    await expect(page.locator('text=45%')).toBeVisible()
  })
})
