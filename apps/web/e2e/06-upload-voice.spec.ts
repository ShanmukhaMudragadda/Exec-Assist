import { test, expect } from '@playwright/test'
import { injectAuth, mockApis, waitForPage } from './helpers'

test.describe('Upload / Voice Page', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await mockApis(page)
  })

  test('page header and mode tabs render', async ({ page }) => {
    await page.goto('/upload')
    await waitForPage(page)

    await expect(page.locator('h1', { hasText: 'Import & Generate' })).toBeVisible()
    await expect(page.locator('button', { hasText: 'Transcript' })).toBeVisible()
    await expect(page.locator('button', { hasText: 'Spreadsheet' })).toBeVisible()
    await expect(page.locator('button', { hasText: 'Voice' })).toBeVisible()
  })

  test('mode tabs are not overflowing on mobile', async ({ page }) => {
    await page.goto('/upload')
    await waitForPage(page)

    const isMobile = page.viewportSize()!.width < 768

    const modeTabs = page.locator('button', { hasText: 'Transcript' }).first()
    const box = await modeTabs.boundingBox()
    expect(box).not.toBeNull()

    if (isMobile) {
      // Buttons should be within viewport width
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 10)
    }
  })

  test('transcript mode: textarea is visible and editable', async ({ page }) => {
    await page.goto('/upload?mode=transcript')
    await waitForPage(page)

    const textarea = page.locator('textarea').first()
    await expect(textarea).toBeVisible()
    await textarea.fill('Meeting with sales team. John will follow up on deal by Friday.')
    await expect(textarea).toHaveValue(/John/)
  })

  test('voice mode: record button is visible', async ({ page }) => {
    await page.goto('/upload?mode=live')
    await waitForPage(page)

    // Should show record/start button
    const recordBtn = page.locator('button').filter({ hasText: /Start Recording|Stop Recording/ }).first()
    await expect(recordBtn).toBeVisible()
  })

  test('voice mode: canvas visualizer is present', async ({ page }) => {
    await page.goto('/upload?mode=live')
    await waitForPage(page)

    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible()
  })

  test('voice mode: shows idle state when not recording', async ({ page }) => {
    await page.goto('/upload?mode=live')
    await waitForPage(page)

    // Should show Idle status indicator
    await expect(page.locator('text=Idle')).toBeVisible()
  })

  test('voice mode record button meets touch target', async ({ page }) => {
    await page.goto('/upload?mode=live')
    await waitForPage(page)

    const isMobile = page.viewportSize()!.width < 768
    if (!isMobile) test.skip()

    const recordBtn = page.locator('button').filter({ hasText: /Start Recording|Stop Recording/ }).first()
    if (await recordBtn.isVisible()) {
      const box = await recordBtn.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.height).toBeGreaterThanOrEqual(44)
      expect(box!.width).toBeGreaterThanOrEqual(44)
    }
  })

  test('spreadsheet mode: file upload area visible', async ({ page }) => {
    await page.goto('/upload?mode=sheets')
    await waitForPage(page)

    await expect(page.locator('text=Upload Spreadsheet')).toBeVisible()
    await expect(page.locator('text=CSV · XLSX supported')).toBeVisible()
  })

  test('no horizontal overflow', async ({ page }) => {
    await page.goto('/upload')
    await waitForPage(page)

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    const clientWidth = await page.evaluate(() => window.innerWidth)
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2)
  })
})
