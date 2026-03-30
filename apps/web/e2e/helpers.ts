import { Page } from '@playwright/test'

/**
 * Inject a fake authenticated user into the Zustand persist store (localStorage)
 * so tests can skip the Google OAuth flow.
 */
export async function injectAuth(page: Page) {
  await page.addInitScript(() => {
    const mockUser = {
      id: 'test-user-1',
      name: 'Test Executive',
      email: 'test@example.com',
      role: 'executive',
      avatar: null,
      timezone: 'America/New_York',
      emailVerified: true,
      emailNotifications: true,
    }
    const authState = {
      state: {
        user: mockUser,
        token: 'mock-jwt-token-for-testing',
        isAuthenticated: true,
      },
      version: 0,
    }
    localStorage.setItem('auth-storage', JSON.stringify(authState))
    // Also set the bare token key that axios reads
    localStorage.setItem('token', 'mock-jwt-token-for-testing')
  })
}

const MOCK_USER = { id: 'test-user-1', name: 'Test Executive', email: 'test@example.com', role: 'executive', avatar: null, timezone: 'America/New_York' }

/**
 * Mock all API calls to return empty/success responses so pages render
 * without a real backend.
 */
export async function mockApis(page: Page) {
  // All backend API calls go to port 3000. Using explicit base URL to avoid
  // accidentally intercepting Vite frontend routes on port 5173.
  const be = 'http://localhost:3000'

  // Block socket.io persistent connections
  await page.route(`${be}/socket.io/**`, (route) => route.abort())

  // Auth - me
  await page.route(`${be}/auth/me`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: MOCK_USER }) })
  )

  // Users profile update (PATCH /users/me)
  await page.route(`${be}/users/me`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: MOCK_USER }) })
  )

  // Dashboard brief
  await page.route(`${be}/ai/brief`, (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ brief: [
        { type: 'info', headline: 'No critical items today', detail: 'All initiatives are on track.', metric: null },
      ]}),
    })
  )

  // Actions - command center (more specific, before generic actions route)
  await page.route(`${be}/actions/command-center`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ actions: [], meta: { total: 0, hasMore: false } }) })
  )

  // Actions - generate standalone
  await page.route(`${be}/actions/generate`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ actions: [] }) })
  )

  // Actions
  await page.route(`${be}/actions/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ actions: [] }) })
  )

  // Initiatives
  await page.route(`${be}/initiatives/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ initiatives: [] }) })
  )
  await page.route(`${be}/initiatives`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ initiatives: [] }) })
  )

  // Users list
  await page.route(`${be}/users/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ users: [] }) })
  )

  // Catch-all for any other backend call — prevents 401 interceptor from firing
  await page.route(`${be}/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
  )
}

/** Wait for page to be visually ready (avoids networkidle which socket.io prevents) */
export async function waitForPage(page: Page) {
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(600)
}
