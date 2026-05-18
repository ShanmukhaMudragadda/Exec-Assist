export interface AuthData {
  apiUrl: string
  accessToken: string
  refreshToken: string
  expiresAt: string // ISO string
  name?: string
  email?: string
}

export interface User {
  id: string
  name: string
  email: string
  avatar: string | null
  role: string
}

export interface Initiative {
  id: string
  title: string
  status: string
  priority: string
  progress: number
  dueDate: string | null
  createdAt: string
  creator?: { id: string; name: string }
  _count?: { actions: number; members: number }
  actions?: Action[]
  members?: Member[]
}

export interface Member {
  id: string
  userId: string
  role: string
  department: string | null
  user: { id: string; name: string; email: string; avatar: string | null }
}

export interface Action {
  id: string
  actionNumber: number
  title: string
  description: string | null
  status: string
  priority: string
  dueDate: string | null
  createdAt: string
  updatedAt: string
  initiative: { id: string; title: string } | null
  creator?: { id: string; name: string }
  assignees: { id: string; name: string; avatar: string | null }[]
  tags?: { id: string; name: string; color: string }[]
}

export interface CommandCenterResponse {
  actions: Action[]
  stats: {
    total: number
    open: number
    completed: number
    overdue: number
  }
  nextCursor?: string
}

export interface EltSummary {
  initiatives: {
    id: string; title: string; status: string; priority: string; progress: number
    dueDate: string | null; ownerName: string; memberCount: number
    actionCount: number; completedCount: number; openCount: number
    overdueCount: number; riskScore: number
  }[]
  actionCounts: { total: number; open: number; overdue: number; completed: number }
  overdueActions: Action[]
  statusFunnel: Record<string, number>
  priorityDistribution: Record<string, number>
  memberWorkload: {
    id: string; name: string; avatar: string | null; department: string | null
    assigned: number; open: number; overdue: number; completed: number
    avgAgeDays: number; staleCount: number
  }[]
  staleActions: Action[]
  longRunningActions: Action[]
  onTimeRate: number | null
  unassignedHighPriority: number
  dueSoon: number
}
