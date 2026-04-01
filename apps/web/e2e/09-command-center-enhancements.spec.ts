import { test, expect } from '@playwright/test'
import { injectAuth, mockApis, waitForPage } from './helpers'

test.describe('Command Center Enhancements', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await mockApis(page)
    await page.goto('/command-center')
    await waitForPage(page)
  })

  test('dashboard statistics are visible in command center', async ({ page }) => {
    // Check for Open stats
    await expect(page.locator('p.uppercase', { hasText: 'Open' })).toBeVisible()
    await expect(page.locator('p.uppercase', { hasText: 'Open' }).locator('xpath=preceding-sibling::p')).toBeVisible()

    // Check for Overdue stats (only if there are overdue actions, might need to mock data to ensure visibility)
    // For now, just check if the label is visible if it appears.
    // The previous implementation used `overdueActions.length > 0 && (...)`, so it might not always be visible.
    const overdueLabel = page.locator('p.uppercase', { hasText: 'Overdue' })
    if (await overdueLabel.isVisible()) {
      await expect(overdueLabel.locator('xpath=preceding-sibling::p')).toBeVisible()
    }

    // Check for Initiatives stats
    await expect(page.locator('p.uppercase', { hasText: 'Initiatives' })).toBeVisible()
    await expect(page.locator('p.uppercase', { hasText: 'Initiatives' }).locator('xpath=preceding-sibling::p')).toBeVisible()
  })

  test('priority queue section is visible', async ({ page }) => {
    await expect(page.locator('h3', { hasText: 'Priority Queue' })).toBeVisible()
    // Further checks could involve verifying the content of the priority queue if mock data is tailored.
  })

  test.describe('Bulk Task Update', () => {
    test.beforeEach(async ({ page }) => {
      // Ensure some tasks are available for selection
      // This might require mocking specific command-center data with tasks
      // For now, we'll assume tasks are present and can be selected.
      // Click on the first task's checkbox
      await page.locator('input[type="checkbox"]').first().check()
      await expect(page.locator('span', { hasText: 'task selected' })).toBeVisible()
    })

    test('bulk update bar appears on task selection', async ({ page }) => {
      await expect(page.locator('.fixed.bottom-0.left-0.right-0')).toBeVisible()
      await expect(page.locator('button', { hasText: 'Clear Selection' })).toBeVisible()
      await expect(page.locator('button', { hasText: /Apply/ })).toBeVisible()
    })

    test('can clear bulk selection', async ({ page }) => {
      await page.locator('button', { hasText: 'Clear Selection' }).click()
      await expect(page.locator('.fixed.bottom-0.left-0.right-0')).not.toBeVisible()
    })

    test('can bulk update status', async ({ page }) => {
      // Select 'In Progress' from status dropdown
      await page.locator('select').selectOption({ label: 'In Progress' })
      await page.locator('button', { hasText: /Apply/ }).click()

      // Expect the bulk update bar to disappear or show a success message (if implemented)
      // For now, we'll just check that it's gone and potentially that the query is invalidated.
      await expect(page.locator('.fixed.bottom-0.left-0.right-0')).not.toBeVisible()

      // Further checks would involve re-fetching data or checking UI to confirm status change
      // This would require more sophisticated mocking or access to the application state.
    })

    test('can bulk update assignee', async ({ page }) => {
      // Select an assignee (requires a mocked user list)
      // Assuming 'Test User' is a valid user for selection
      await page.locator('select').selectOption({ label: 'Test User' })
      await page.locator('button', { hasText: /Apply/ }).click()
      await expect(page.locator('.fixed.bottom-0.left-0.right-0')).not.toBeVisible()
    })

    test('can bulk update due date', async ({ page }) => {
      // Set a future date
      const futureDate = format(new Date(new Date().setDate(new Date().getDate() + 7)), 'yyyy-MM-dd')
      await page.locator('input[type="date"]').fill(futureDate)
      await page.locator('button', { hasText: /Apply/ }).click()
      await expect(page.locator('.fixed.bottom-0.left-0.right-0')).not.toBeVisible()
    })

    test('can bulk associate with initiative', async ({ page }) => {
      // Select an initiative (requires a mocked initiative list)
      // Assuming 'Test Initiative' is a valid initiative for selection
      await page.locator('select').selectOption({ label: 'Test Initiative' })
      await page.locator('button', { hasText: /Apply/ }).click()
      await expect(page.locator('.fixed.bottom-0.left-0.right-0')).not.toBeVisible()
    })
  })
})