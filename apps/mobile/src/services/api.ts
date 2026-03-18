import axios from 'axios'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  User,
  Task,
  Workspace,
  TaskUpdate,
  WorkspaceAnalytics,
  CreateTaskInput,
  UpdateTaskInput,
  TasksListResponse,
  WorkspacesListResponse,
  TaskUpdatesListResponse,
} from '../types'

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000'

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Attach stored JWT to every request
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ user: User; token: string }>('/auth/login', { email, password }),

  register: (name: string, email: string, password: string) =>
    api.post<{ user: User; token: string }>('/auth/register', { name, email, password }),

  googleAuth: (params: { credential?: string; code?: string; codeVerifier?: string; redirectUri?: string }) =>
    api.post<{ user: User; token: string }>('/auth/google', params),

  me: () => api.get<{ user: User }>('/auth/me'),

  requestPasswordReset: (email: string) =>
    api.post('/auth/reset-password', { email }),

  resetPassword: (token: string, password: string) =>
    api.post('/auth/new-password', { token, password }),
}

// ─── Workspaces ───────────────────────────────────────────────────────────────

export const workspacesApi = {
  list: () => api.get<WorkspacesListResponse>('/workspaces'),

  create: (name: string, description?: string) =>
    api.post<{ workspace: Workspace }>('/workspaces', { name, description }),

  get: (id: string) => api.get<{ workspace: Workspace }>(`/workspaces/${id}`),

  update: (id: string, data: { name?: string; description?: string }) =>
    api.patch<{ workspace: Workspace }>(`/workspaces/${id}`, data),

  delete: (id: string) => api.delete<{ message: string }>(`/workspaces/${id}`),

  getAnalytics: (id: string) =>
    api.get<WorkspaceAnalytics>(`/workspaces/${id}/analytics`),

  sendInvitation: (workspaceId: string, data: { email: string; role?: string }) =>
    api.post(`/workspaces/${workspaceId}/invitations`, data),

  getMembers: (id: string) =>
    api.get<{ members: Array<{ userId: string; workspaceId: string; role: string; user: Pick<User, 'id' | 'name' | 'email' | 'avatar'> }> }>(`/workspaces/${id}/members`),

  updateMemberRole: (workspaceId: string, userId: string, role: string) =>
    api.patch(`/workspaces/${workspaceId}/members/${userId}`, { role }),

  updateMember: (workspaceId: string, userId: string, data: { role?: string; profile?: string }) =>
    api.patch(`/workspaces/${workspaceId}/members/${userId}`, data),

  removeMember: (workspaceId: string, userId: string) =>
    api.delete(`/workspaces/${workspaceId}/members/${userId}`),

  getEmailSettings: (workspaceId: string) =>
    api.get<{ notifyOnTaskCreate: boolean; notifyOnTaskAssign: boolean; notifyOnTaskComplete: boolean; notifyOnComment: boolean; notifyOnDueDate: boolean }>(`/workspaces/${workspaceId}/email-settings`),

  updateEmailSettings: (workspaceId: string, data: Partial<{ notifyOnTaskCreate: boolean; notifyOnTaskAssign: boolean; notifyOnTaskComplete: boolean; notifyOnComment: boolean; notifyOnDueDate: boolean }>) =>
    api.patch(`/workspaces/${workspaceId}/email-settings`, data),
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

export const tasksApi = {
  list: (workspaceId: string, params?: Record<string, string>) =>
    api.get<TasksListResponse>(`/workspaces/${workspaceId}/tasks`, { params }),

  get: (taskId: string) => api.get<{ task: Task }>(`/tasks/${taskId}`),

  create: (workspaceId: string, data: CreateTaskInput) =>
    api.post<{ task: Task }>(`/workspaces/${workspaceId}/tasks`, data),

  update: (taskId: string, data: UpdateTaskInput) =>
    api.patch<{ task: Task }>(`/tasks/${taskId}`, data),

  delete: (taskId: string) => api.delete<{ message: string }>(`/tasks/${taskId}`),

  getUpdates: (taskId: string, page = 1, limit = 20) =>
    api.get<TaskUpdatesListResponse>(`/tasks/${taskId}/updates`, {
      params: { page: String(page), limit: String(limit) },
    }),

  createUpdate: (taskId: string, content: string) =>
    api.post<{ update: TaskUpdate }>(`/tasks/${taskId}/updates`, { content }),

  deleteUpdate: (updateId: string) =>
    api.delete<{ message: string }>(`/tasks/updates/${updateId}`),
}

// ─── Transcripts ──────────────────────────────────────────────────────────────

export const transcriptsApi = {
  list: (workspaceId: string) =>
    api.get<{ transcripts: Array<{ id: string; title: string; content: string; type: string; processed: boolean; createdAt: string }> }>(
      `/workspaces/${workspaceId}/transcripts`
    ),

  createText: (workspaceId: string, data: { title: string; content: string; type: string }) =>
    api.post<{ transcript: { id: string; title: string; content: string } }>(
      `/workspaces/${workspaceId}/transcripts/text`, data
    ),

  uploadAudio: (workspaceId: string, uri: string, name: string, mimeType: string) => {
    const formData = new FormData()
    formData.append('audio', { uri, name, type: mimeType } as unknown as Blob)
    return api.post<{ transcript: { id: string }; transcription: string }>(
      `/workspaces/${workspaceId}/transcripts/upload`, formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    )
  },

  generateTasks: (workspaceId: string, transcriptId: string) =>
    api.post<{ extractedTasks: Array<{ title: string; description?: string; priority: string; category?: string; tags?: string[] }> }>(
      `/workspaces/${workspaceId}/transcripts/${transcriptId}/generate-tasks`
    ),

  saveTasks: (workspaceId: string, transcriptId: string, tasks: unknown[]) =>
    api.post(`/workspaces/${workspaceId}/transcripts/${transcriptId}/save-tasks`, { tasks }),
}

// ─── Import ───────────────────────────────────────────────────────────────────

export const importApi = {
  uploadExcel: (workspaceId: string, uri: string, name: string, mimeType: string) => {
    const formData = new FormData()
    formData.append('file', { uri, name, type: mimeType } as unknown as Blob)
    return api.post<{ extractedTasks: Array<{
      title: string; description?: string; priority: string; status?: string;
      category?: string; tags?: string[]; dueDate?: string | null; assigneeIds?: string[]
    }>; count: number }>(
      `/workspaces/${workspaceId}/import/excel`, formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    )
  },
}

// ─── User ─────────────────────────────────────────────────────────────────────

export const userApi = {
  updateProfile: (data: { name?: string; emailNotifications?: boolean; dailyReportTime?: string | null }) =>
    api.patch<{ user: User }>('/users/me', data),

  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<{ message: string }>('/users/me/password', { currentPassword, newPassword }),
}
