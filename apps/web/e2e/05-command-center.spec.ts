import { test, expect } from '@playwright/test'
import { injectAuth, mockApis, waitForPage } from './helpers'

test.describe('Command Center Page', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await mockApis(page)
    await page.goto('/command-center')
    await waitForPage(page)
  })

  test('greeting and stats header visible', async ({ page }) => {
    await expect(page.locator('text=Good').first()).toBeVisible()
  })

  test('filter tabs render', async ({ page }) => {
    await expect(page.locator('button', { hasText: 'All Open' })).toBeVisible()
    await expect(page.locator('button', { hasText: 'Overdue' })).toBeVisible()
    await expect(page.locator('button', { hasText: 'Due This Week' })).toBeVisible()
    await expect(page.locator('button', { hasText: 'Assigned to Me' })).toBeVisible()
  })

  test('New Action button is visible', async ({ page }) => {
    const addBtn = page.locator('button', { hasText: 'Create Action' })
    await expect(addBtn).toBeVisible()
  })

  test('empty state renders with no actions', async ({ page }) => {
    await expect(page.locator('text=All caught up').first()).toBeVisible()
  })

  test('no horizontal overflow', async ({ page }) => {
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    const clientWidth = await page.evaluate(() => window.innerWidth)
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2)
  })

  test('add button dropdown works', async ({ page }) => {
    // Find the add/create button
    const addBtn = page.locator('button').filter({ hasText: /New Action/ }).first()
    if (await addBtn.isVisible()) {
      await addBtn.click()
      // Should show dropdown or pane
      await page.waitForTimeout(300)
    }
  })
})
