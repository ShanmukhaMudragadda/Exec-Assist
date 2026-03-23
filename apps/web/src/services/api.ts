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

// Auth
export const authApi = {
  register: (data: { email: string; name: string; password: string }) =>
    api.post('/auth/register', data),
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  googleLogin: (credential: string) =>
    api.post('/auth/google', { credential }),
  me: () => api.get('/auth/me'),
  verifyEmail: (token: string) => api.post('/auth/verify-email', { token }),
  requestReset: (email: string) => api.post('/auth/reset-password', { email }),
  resetPassword: (token: string, password: string) =>
    api.post('/auth/new-password', { token, password }),
}

// Users
export const usersApi = {
  updateProfile: (data: Partial<{ name: string; avatar: string; emailNotifications: boolean; dailyReportTime: string; timezone: string }>) =>
    api.patch('/users/me', data),
  getUser: (id: string) => api.get(`/users/${id}`),
}

// Workspaces
export const workspacesApi = {
  create: (data: { name: string; description?: string; icon?: string }) =>
    api.post('/workspaces', data),
  list: () => api.get('/workspaces'),
  get: (id: string) => api.get(`/workspaces/${id}`),
  update: (id: string, data: Partial<{ name: string; description: string }>) =>
    api.patch(`/workspaces/${id}`, data),
  delete: (id: string) => api.delete(`/workspaces/${id}`),
  getMembers: (id: string) => api.get(`/workspaces/${id}/members`),
  updateMemberRole: (workspaceId: string, userId: string, role: string) =>
    api.patch(`/workspaces/${workspaceId}/members/${userId}`, { role }),
  updateMember: (workspaceId: string, userId: string, data: { role?: string; profile?: string }) =>
    api.patch(`/workspaces/${workspaceId}/members/${userId}`, data),
  removeMember: (workspaceId: string, userId: string) =>
    api.delete(`/workspaces/${workspaceId}/members/${userId}`),
  addMember: (workspaceId: string, data: { email: string; role?: string; profile?: string }) =>
    api.post(`/workspaces/${workspaceId}/members`, data),
  sendInvitation: (workspaceId: string, data: { email: string; role?: string }) =>
    api.post(`/workspaces/${workspaceId}/invitations`, data),
  acceptInvitation: (invitationId: string) =>
    api.post(`/workspaces/invitations/${invitationId}/accept`),
  rejectInvitation: (invitationId: string) =>
    api.post(`/workspaces/invitations/${invitationId}/reject`),
  getAnalytics: (id: string) => api.get(`/workspaces/${id}/analytics`),

  getEmailSettings: (workspaceId: string) =>
    api.get(`/workspaces/${workspaceId}/email-settings`),

  updateEmailSettings: (workspaceId: string, data: Partial<{ notifyOnTaskCreate: boolean; notifyOnTaskAssign: boolean; notifyOnTaskComplete: boolean; notifyOnComment: boolean; notifyOnDueDate: boolean }>) =>
    api.patch(`/workspaces/${workspaceId}/email-settings`, data),
}

// Tasks
export const tasksApi = {
  create: (workspaceId: string, data: {
    title: string;
    description?: string;
    category?: string;
    tags?: string[];
    status?: string;
    priority?: string;
    dueDate?: string | null;
    assigneeIds?: string[];
  }) => api.post(`/workspaces/${workspaceId}/tasks`, data),
  list: (workspaceId: string, params?: Record<string, string>) =>
    api.get(`/workspaces/${workspaceId}/tasks`, { params }),
  get: (taskId: string) => api.get(`/tasks/${taskId}`),
  update: (taskId: string, data: Partial<{
    title: string;
    description: string | null;
    category: string | null;
    tags: string[];
    status: string;
    priority: string;
    dueDate: string | null;
  }>) => api.patch(`/tasks/${taskId}`, data),
  delete: (taskId: string) => api.delete(`/tasks/${taskId}`),
  assign: (taskId: string, userId: string) =>
    api.post(`/tasks/${taskId}/assign`, { userId }),
  removeAssignee: (taskId: string, userId: string) =>
    api.delete(`/tasks/${taskId}/assignees/${userId}`),
  getUpdates: (taskId: string, params?: Record<string, string>) =>
    api.get(`/tasks/${taskId}/updates`, { params }),
  createUpdate: (taskId: string, content: string) =>
    api.post(`/tasks/${taskId}/updates`, { content }),
  deleteUpdate: (taskId: string, updateId: string) =>
    api.delete(`/tasks/${taskId}/updates/${updateId}`),
}

// Import
export const importApi = {
  uploadExcel: (workspaceId: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post<{ extractedTasks: Array<{
      title: string; description?: string; priority: string; status?: string;
      category?: string; tags?: string[]; dueDate?: string | null; assigneeIds?: string[]
    }>; count: number }>(`/workspaces/${workspaceId}/import/excel`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}

// Transcripts
export const transcriptsApi = {
  uploadAudio: (workspaceId: string, file: File) => {
    const formData = new FormData()
    formData.append('audio', file)
    return api.post(`/workspaces/${workspaceId}/transcripts/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  createText: (workspaceId: string, data: { title: string; content: string; type: string }) =>
    api.post(`/workspaces/${workspaceId}/transcripts/text`, data),
  list: (workspaceId: string) =>
    api.get(`/workspaces/${workspaceId}/transcripts`),
  generateTasks: (workspaceId: string, transcriptId: string) =>
    api.post(`/workspaces/${workspaceId}/transcripts/${transcriptId}/generate-tasks`),
  saveTasks: (workspaceId: string, transcriptId: string, tasks: unknown[]) =>
    api.post(`/workspaces/${workspaceId}/transcripts/${transcriptId}/save-tasks`, { tasks }),
}
