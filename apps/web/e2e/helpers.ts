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
const MOCK_OTHER_USER = { id: 'test-user-2', name: 'Another User', email: 'another@example.com', role: 'member', avatar: null, timezone: 'America/New_York' }

const MOCK_ACTIONS = [
  {
    id: 'action-1',
    title: 'Review Q1 Performance',
    description: 'Analyze sales figures and prepare report.',
    status: 'in-progress',
    priority: 'high',
    dueDate: new Date(new Date().setDate(new Date().getDate() + 2)).toISOString(), // Due in 2 days
    createdBy: MOCK_USER.id,
    assigneeId: MOCK_USER.id,
    initiativeId: 'initiative-1',
    initiative: { id: 'initiative-1', title: 'Strategic Planning', status: 'active' },
    assignee: MOCK_USER,
    creator: MOCK_USER,
    tags: [{ tag: { id: 'tag-1', name: 'finance', color: '#FF0000' } }],
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'action-2',
    title: 'Prepare Board Meeting Agenda',
    description: 'Draft topics and distribute to attendees.',
    status: 'todo',
    priority: 'urgent',
    dueDate: new Date(new Date().setDate(new Date().getDate() - 1)).toISOString(), // Overdue
    createdBy: MOCK_USER.id,
    assigneeId: MOCK_OTHER_USER.id,
    initiativeId: 'initiative-1',
    initiative: { id: 'initiative-1', title: 'Strategic Planning', status: 'active' },
    assignee: MOCK_OTHER_USER,
    creator: MOCK_USER,
    tags: [{ tag: { id: 'tag-2', name: 'board', color: '#00FF00' } }],
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'action-3',
    title: 'Follow up on Project X',
    description: 'Check status with engineering team.',
    status: 'completed',
    priority: 'medium',
    dueDate: new Date(new Date().setDate(new Date().getDate() - 5)).toISOString(), // Completed in past
    createdBy: MOCK_USER.id,
    assigneeId: MOCK_USER.id,
    initiativeId: 'initiative-2',
    initiative: { id: 'initiative-2', title: 'Project X Launch', status: 'active' },
    assignee: MOCK_USER,
    creator: MOCK_USER,
    tags: [],
    updatedAt: new Date().toISOString(),
  },
];

const MOCK_INITIATIVES = [
  { id: 'initiative-1', title: 'Strategic Planning', description: 'Annual strategic review.', status: 'active', createdBy: MOCK_USER.id },
  { id: 'initiative-2', title: 'Project X Launch', description: 'Launch of new product X.', status: 'active', createdBy: MOCK_USER.id },
];

const MOCK_USERS = [
  MOCK_USER,
  MOCK_OTHER_USER,
];

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

  // Users list
  await page.route(`${be}/users`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ users: MOCK_USERS }) })
  )

  // Dashboard brief
  await page.route(`${be}/executive-brief`, (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ brief: [
        { type: 'info', headline: 'No critical items today', detail: 'All initiatives are on track.', metric: null },
      ]}),
    })
  )

  // Actions - command center
  await page.route(`${be}/command-center`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        actions: MOCK_ACTIONS,
        meta: { total: MOCK_ACTIONS.length, hasMore: false },
      }),
    })
  )

  // Actions - bulk update
  await page.route(`${be}/actions/bulk-update`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 1, updatedActionIds: [] }) })
  )

  // Actions - generate standalone
  await page.route(`${be}/actions/generate`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ actions: [] }) })
  )

  // Generic actions - list/get/create/update/delete
  await page.route(`${be}/actions/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ actions: MOCK_ACTIONS }) })
  )

  // Initiatives - list
  await page.route(`${be}/initiatives`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ initiatives: MOCK_INITIATIVES }) })
  )

  // Initiatives - get single
  await page.route(`${be}/initiatives/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ initiative: MOCK_INITIATIVES[0] }) })
  )

  // Catch-all for any other backend call — prevents 401 interceptor from firing
  await page.route(`${be}/**`, (route) => {
    console.log(`[Playwright] Unmocked Backend Request: ${route.request().url()}`);
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });
}

/** Wait for page to be visually ready (avoids networkidle which socket.io prevents) */
export async function waitForPage(page: Page) {
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(600)
}

