import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { format, isAfter } from 'date-fns'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import AppLayout from '@/components/layout/AppLayout'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { workspacesApi, tasksApi } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { useSocketStore } from '@/store/socketStore'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Clock, AlertCircle, ListTodo, TrendingUp } from 'lucide-react'

interface Task {
  id: string
  title: string
  status: string
  priority: string
  dueDate?: string | null
  workspaceId: string
  workspace?: { id: string; name: string }
  tags?: string[]
  assignees?: { id: string; name: string }[]
}

interface Workspace {
  id: string
  name: string
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  low: 'bg-green-100 text-green-700 border-green-200',
}

const STATUS_COLORS: Record<string, string> = {
  todo: 'bg-slate-100 text-slate-700',
  'in-progress': 'bg-blue-100 text-blue-700',
  'in-review': 'bg-purple-100 text-purple-700',
  completed: 'bg-green-100 text-green-700',
}

export default function DashboardPage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const { socket, connect, disconnect, joinWorkspace } = useSocketStore()

  const { data: workspacesData } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => workspacesApi.list().then((r) => r.data),
  })

  const workspaces: Workspace[] = workspacesData?.workspaces || workspacesData || []

  // Fetch tasks from all workspaces
  const { data: allTasks = [] } = useQuery({
    queryKey: ['all-tasks', workspaces.map((w: Workspace) => w.id)],
    queryFn: async () => {
      if (!workspaces.length) return []
      const results = await Promise.all(
        workspaces.map((ws: Workspace) =>
          tasksApi.list(ws.id).then((r) => {
            const tasks = r.data?.tasks || r.data || []
            return tasks.map((t: Task) => ({ ...t, workspace: ws }))
          })
        )
      )
      return results.flat() as Task[]
    },
    enabled: workspaces.length > 0,
  })

  // Socket.io real-time updates
  useEffect(() => {
    connect()
    return () => disconnect()
  }, [])

  useEffect(() => {
    if (socket && workspaces.length > 0) {
      workspaces.forEach((ws: Workspace) => joinWorkspace(ws.id))
      socket.on('task:created', () => queryClient.invalidateQueries({ queryKey: ['all-tasks'] }))
      socket.on('task:updated', () => queryClient.invalidateQueries({ queryKey: ['all-tasks'] }))
      socket.on('task:deleted', () => queryClient.invalidateQueries({ queryKey: ['all-tasks'] }))
      return () => {
        socket.off('task:created')
        socket.off('task:updated')
        socket.off('task:deleted')
      }
    }
  }, [socket, workspaces])

  const now = new Date()
  const totalTasks = allTasks.length
  const completedTasks = allTasks.filter((t) => t.status === 'completed').length
  const inProgressTasks = allTasks.filter((t) => t.status === 'in-progress').length
  const overdueTasks = allTasks.filter(
    (t) => t.dueDate && isAfter(now, new Date(t.dueDate)) && t.status !== 'completed'
  ).length

  const recentTasks = [...allTasks]
    .sort((a, b) => (a.title > b.title ? 1 : -1))
    .slice(0, 8)

  const chartData = [
    { name: 'Todo', count: allTasks.filter((t) => t.status === 'todo').length, fill: '#94a3b8' },
    { name: 'In Progress', count: inProgressTasks, fill: '#3b82f6' },
    { name: 'In Review', count: allTasks.filter((t) => t.status === 'in-review').length, fill: '#a855f7' },
    { name: 'Completed', count: completedTasks, fill: '#22c55e' },
  ]

  const stats = [
    { label: 'Total Tasks', value: totalTasks, icon: ListTodo, color: 'text-slate-600', bg: 'bg-slate-100' },
    { label: 'Completed', value: completedTasks, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-100' },
    { label: 'In Progress', value: inProgressTasks, icon: Clock, color: 'text-blue-600', bg: 'bg-blue-100' },
    { label: 'Overdue', value: overdueTasks, icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-100' },
  ]

  return (
    <AppLayout>
      <div className="p-8 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">
            Good{' '}
            {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'},{' '}
            {user?.name?.split(' ')[0]}
          </h1>
          <p className="text-muted-foreground mt-1">
            Here's what's happening across your workspaces
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(({ label, value, icon: Icon, color, bg }) => (
            <Card key={label} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{label}</p>
                    <p className="text-3xl font-bold mt-1">{value}</p>
                  </div>
                  <div className={`p-3 rounded-full ${bg}`}>
                    <Icon className={`w-6 h-6 ${color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chart */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                <CardTitle className="text-lg">Tasks by Status</CardTitle>
              </div>
              <CardDescription>Overview of task distribution</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Workspaces */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Your Workspaces</CardTitle>
              <CardDescription>{workspaces.length} workspace{workspaces.length !== 1 ? 's' : ''}</CardDescription>
            </CardHeader>
            <CardContent>
              {workspaces.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground text-sm">No workspaces yet.</p>
                  <Link to="/workspaces" className="text-primary text-sm hover:underline mt-2 inline-block">
                    Create one
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {workspaces.slice(0, 5).map((ws: Workspace) => (
                    <Link
                      key={ws.id}
                      to={`/workspace/${ws.id}`}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors group"
                    >
                      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-semibold text-sm">
                        {ws.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">{ws.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {allTasks.filter((t) => t.workspace?.id === ws.id).length} tasks
                        </p>
                      </div>
                    </Link>
                  ))}
                  {workspaces.length > 5 && (
                    <Link to="/workspaces" className="text-sm text-primary hover:underline block text-center pt-2">
                      View all workspaces
                    </Link>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Tasks */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Tasks</CardTitle>
            <CardDescription>Tasks across all your workspaces</CardDescription>
          </CardHeader>
          <CardContent>
            {recentTasks.length === 0 ? (
              <div className="text-center py-10">
                <ListTodo className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
                <p className="text-muted-foreground">No tasks yet. Create a workspace and add tasks to get started.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentTasks.map((task) => (
                  <Link
                    key={task.id}
                    to={`/workspace/${task.workspace?.id || task.workspaceId}/tasks/${task.id}`}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-accent transition-colors group"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        task.priority === 'urgent' ? 'bg-red-500' :
                        task.priority === 'high' ? 'bg-orange-500' :
                        task.priority === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                          {task.title}
                        </p>
                        {task.workspace && (
                          <p className="text-xs text-muted-foreground">{task.workspace.name}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                      <Badge className={`text-xs ${STATUS_COLORS[task.status] || 'bg-slate-100 text-slate-700'} border-0`}>
                        {task.status.replace('-', ' ')}
                      </Badge>
                      {task.priority && (
                        <Badge className={`text-xs ${PRIORITY_COLORS[task.priority] || ''}`} variant="outline">
                          {task.priority}
                        </Badge>
                      )}
                      {task.dueDate && (
                        <span className={`text-xs ${
                          isAfter(now, new Date(task.dueDate)) && task.status !== 'completed'
                            ? 'text-red-500 font-medium'
                            : 'text-muted-foreground'
                        }`}>
                          {format(new Date(task.dueDate), 'MMM d')}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  )
}
