// ─── User ────────────────────────────────────────────────────────────────────

export interface User {
  id: string
  email: string
  name: string
  role: string
  emailVerified: boolean
  avatar?: string | null
  emailNotifications: boolean
  dailyReportTime?: string | null
  createdAt?: string
}

// ─── Workspace ───────────────────────────────────────────────────────────────

export type WorkspaceMemberRole = 'owner' | 'admin' | 'member'

export interface WorkspaceMember {
  userId: string
  workspaceId: string
  role: WorkspaceMemberRole
  user: Pick<User, 'id' | 'name' | 'email' | 'avatar'>
}

export interface Workspace {
  id: string
  name: string
  description?: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  memberRole?: WorkspaceMemberRole
  _count?: {
    members: number
    tasks: number
  }
  members?: WorkspaceMember[]
}

// ─── Task ─────────────────────────────────────────────────────────────────────

export type TaskStatus = 'todo' | 'in-progress' | 'in-review' | 'review' | 'completed' | 'cancelled'
export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low'

export interface TaskAssignee {
  taskId: string
  userId: string
  user: Pick<User, 'id' | 'name' | 'email' | 'avatar'>
}

export interface Task {
  id: string
  title: string
  description?: string | null
  status: TaskStatus
  priority: TaskPriority
  category?: string | null
  tags: string[]
  dueDate?: string | null
  workspaceId: string
  createdBy: string
  createdAt: string
  updatedAt: string
  sourceType?: string | null
  sourceId?: string | null
  assignees: TaskAssignee[]
  creator: Pick<User, 'id' | 'name' | 'email' | 'avatar'>
  workspace?: Pick<Workspace, 'id' | 'name'>
  _count?: {
    updates: number
  }
}

export interface CreateTaskInput {
  title: string
  description?: string
  status?: TaskStatus
  priority?: TaskPriority
  category?: string
  tags?: string[]
  dueDate?: string
  assigneeIds?: string[]
}

export interface UpdateTaskInput {
  title?: string
  description?: string | null
  status?: TaskStatus
  priority?: TaskPriority
  category?: string | null
  tags?: string[]
  dueDate?: string | null
  assigneeIds?: string[]
}

// ─── Task Update (Comment) ────────────────────────────────────────────────────

export interface TaskUpdate {
  id: string
  taskId: string
  userId: string
  content: string
  createdAt: string
  user: Pick<User, 'id' | 'name' | 'email' | 'avatar'>
}

// ─── Analytics ───────────────────────────────────────────────────────────────

export interface WorkspaceAnalytics {
  overview: {
    total: number
    completed: number
    inProgress: number
    overdue: number
    completionRate: number
  }
  byStatus: { status: TaskStatus; count: number }[]
  byPriority: { priority: TaskPriority; count: number }[]
  byTag: { tag: string; count: number }[]
}

// ─── API Responses ────────────────────────────────────────────────────────────

export interface PaginationMeta {
  total: number
  page: number
  limit: number
  pages?: number
}

export interface TasksListResponse {
  tasks: Task[]
  pagination: PaginationMeta
}

export interface WorkspacesListResponse {
  workspaces: Workspace[]
}

export interface TaskUpdatesListResponse {
  updates: TaskUpdate[]
  pagination: PaginationMeta
}

// ─── Navigation ───────────────────────────────────────────────────────────────

export type AuthStackParamList = {
  Login: undefined
}

export type MainStackParamList = {
  Main: undefined
  TaskDetail: { taskId: string; workspaceId: string }
  CreateTask: { workspaceId: string }
  SmartCreate: { workspaceId: string; initialMode?: 'manual' | 'transcript' | 'audio' | 'live' | null }
  Profile: undefined
  WorkspaceSettings: { workspaceId: string }
  Transcripts: { workspaceId: string }
  AITasksPreview: {
    tasks: Array<{
      title: string
      description?: string
      priority: string
      status?: string
      category?: string
      tags?: string[]
      dueDate?: string | null
      assigneeIds?: string[]
    }>
    workspaceId: string
    sourceType?: string
    sourceId?: string
  }
}

export type TabParamList = {
  Home: undefined
  Tasks: { workspaceId?: string } | undefined
  Workspaces: undefined
  Profile: undefined
}
