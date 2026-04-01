import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/auth/login'
    }
    return Promise.reject(error)
  }
)

// ── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  googleLogin: (credential: string) =>
    api.post('/auth/google', { credential }),
  me: () => api.get('/auth/me'),
}

// ── Users ────────────────────────────────────────────────────────────────────
export const usersApi = {
  updateProfile: (data: Partial<{ name: string; avatar: string | null; timezone: string; emailNotifications: boolean }>) =>
    api.patch('/users/me', data),
  getUser: (id: string) => api.get(`/users/${id}`),
}

// ── Initiatives ───────────────────────────────────────────────────────────────
export const initiativesApi = {
  create: (data: { title: string; description?: string; priority?: string; status?: string; dueDate?: string | null }) =>
    api.post('/initiatives', data),
  list: () => api.get('/initiatives'),
  get: (initiativeId: string) => api.get(`/initiatives/${initiativeId}`),
  update: (initiativeId: string, data: Partial<{
    title: string; description: string | null; status: string; priority: string; progress: number; dueDate: string | null
  }>) => api.patch(`/initiatives/${initiativeId}`, data),
  delete: (initiativeId: string) => api.delete(`/initiatives/${initiativeId}`),
}

// ── Initiative Members ────────────────────────────────────────────────────────
export const membersApi = {
  list: (initiativeId: string) => api.get(`/initiatives/${initiativeId}/members`),
  remove: (initiativeId: string, memberId: string) =>
    api.delete(`/initiatives/${initiativeId}/members/${memberId}`),
  addMember: (initiativeId: string, data: { email: string; role?: string; department?: string }) =>
    api.post(`/initiatives/${initiativeId}/members/add`, data),
  updateMember: (initiativeId: string, memberId: string, data: { role?: string; department?: string | null }) =>
    api.patch(`/initiatives/${initiativeId}/members/${memberId}`, data),
}

// ── Initiative Settings ────────────────────────────────────────────────────────
export const initiativeSettingsApi = {
  get: (initiativeId: string) => api.get(`/initiatives/${initiativeId}/settings`),
  update: (initiativeId: string, data: Partial<{
    emailNotifications: boolean
    dailyReportEnabled: boolean
    dailyReportTime: string
    dailyReportEmails: string[]
  }>) => api.patch(`/initiatives/${initiativeId}/settings`, data),
}

// ── Tags ─────────────────────────────────────────────────────────────────────
export const tagsApi = {
  list: (initiativeId: string) => api.get(`/initiatives/${initiativeId}/tags`),
  create: (initiativeId: string, data: { name: string; color?: string }) =>
    api.post(`/initiatives/${initiativeId}/tags`, data),
  delete: (initiativeId: string, tagId: string) =>
    api.delete(`/initiatives/${initiativeId}/tags/${tagId}`),
  listAll: () => api.get('/tags'),
  createGlobal: (data: { name: string; color?: string }) => api.post('/tags', data),
}

// ── Actions ───────────────────────────────────────────────────────────────────
export const actionsApi = {
  create: (initiativeId: string, data: {
    title: string; description?: string; priority?: string; status?: string;
    dueDate?: string | null; assigneeId?: string | null;
    sourceType?: string; sourceId?: string; tagIds?: string[];
  }) => api.post(`/initiatives/${initiativeId}/actions`, data),
  createStandalone: (data: {
    title: string; description?: string; priority?: string; status?: string;
    dueDate?: string | null; assigneeId?: string | null; tagIds?: string[];
  }) => api.post('/actions', data),
  bulkCreate: (initiativeId: string, actions: unknown[]) =>
    api.post(`/initiatives/${initiativeId}/actions/bulk`, { actions }),
  generateFromTranscript: (initiativeId: string, data: { content: string; title?: string }) =>
    api.post(`/initiatives/${initiativeId}/actions/generate`, data),
  generateStandalone: (content: string) =>
    api.post('/actions/generate', { content }),
  transcribeAudio: (audio: string, mimeType: string) =>
    api.post('/transcribe', { audio, mimeType }),
  update: (actionId: string, data: Partial<{
    title: string; description: string | null; status: string; priority: string;
    dueDate: string | null; assigneeId: string | null; tagIds: string[];
    initiativeId: string | null;
  }>) => api.patch(`/actions/${actionId}`, data),
  delete: (actionId: string) => api.delete(`/actions/${actionId}`),
  getCommandCenter: (cursor?: string, filter?: string, search?: string) =>
    api.get('/command-center', { params: { ...(cursor ? { cursor } : {}), ...(filter && filter !== 'all' ? { filter } : {}), ...(search ? { search } : {}) } }),
  listForInitiative: (initiativeId: string, cursor: string, filter?: string, search?: string) =>
    api.get(`/initiatives/${initiativeId}/actions`, { params: { cursor, ...(filter && filter !== 'all' ? { filter } : {}), ...(search ? { search } : {}) } }),
  getExecutiveBrief: (refresh = false) => api.get('/executive-brief', { params: refresh ? { refresh: 'true' } : {} }),
  getDetail: (actionId: string) => api.get(`/actions/${actionId}`),
  addUpdate: (actionId: string, content: string) =>
    api.post(`/actions/${actionId}/updates`, { content }),
  editUpdate: (actionId: string, updateId: string, content: string) =>
    api.patch(`/actions/${actionId}/updates/${updateId}`, { content }),
}

// ── Push Notifications ────────────────────────────────────────────────────────
export const pushApi = {
  getVapidKey: () => api.get<{ key: string }>('/push/vapid-public-key'),
  subscribe: (data: { endpoint: string; keys: { p256dh: string; auth: string }; userAgent?: string }) =>
    api.post('/push/subscribe', data),
  unsubscribe: (endpoint?: string) =>
    api.delete('/push/unsubscribe', { data: { endpoint } }),
}
