import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppLayout from '@/components/layout/AppLayout'
import TaskListCard from '@/components/tasks/TaskListCard'
import TaskDetailPane from '@/components/tasks/TaskDetailPane'
import { Button } from '@/components/ui/button'
import { tasksApi, workspacesApi } from '@/services/api'
import { useSocketStore } from '@/store/socketStore'
import { toast } from '@/hooks/use-toast'
import {
  Plus, ChevronDown, Mic, Upload, FileText, Sheet,
  CheckCircle2, Clock, AlertCircle, ClipboardList,
  X, Search, Tag, Folder,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Task {
  id: string
  title: string
  description?: string | null
  status: string
  priority: string
  tags?: string[]
  category?: string | null
  dueDate?: string | null
  assignees?: { userId: string; user: { id: string; name: string; avatar?: string | null } }[]
  workspaceId: string
}

interface Member {
  id: string
  name: string
  email: string
}

interface ScopeFilter {
  id: string
  scope: 'name' | 'tag' | 'category' | 'status' | 'assignee' | 'all'
  value: string
  label: string
}

export default function WorkspacePage() {
  const { id: workspaceId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { socket, connect, joinWorkspace, leaveWorkspace } = useSocketStore()

  const [addDropdownOpen, setAddDropdownOpen] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [scopeFilters, setScopeFilters] = useState<ScopeFilter[]>([])
  const [searchText, setSearchText] = useState('')
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false)

  const { data: tasksData, isLoading } = useQuery({
    queryKey: ['tasks', workspaceId],
    queryFn: () => tasksApi.list(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  })
  const tasks: Task[] = tasksData?.tasks || tasksData || []

  const { data: membersData } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => workspacesApi.getMembers(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  })
  const members: Member[] = membersData?.members?.map((m: { user: Member }) => m.user) || []

  // Socket.io real-time
  useEffect(() => {
    if (!socket) connect()
  }, [])

  useEffect(() => {
    if (socket && workspaceId) {
      joinWorkspace(workspaceId)
      const invalidate = () => queryClient.invalidateQueries({ queryKey: ['tasks', workspaceId] })
      socket.on('task:created', invalidate)
      socket.on('task:updated', invalidate)
      socket.on('task:deleted', invalidate)
      socket.on('task:commented', invalidate)
      return () => {
        leaveWorkspace(workspaceId)
        socket.off('task:created', invalidate)
        socket.off('task:updated', invalidate)
        socket.off('task:deleted', invalidate)
        socket.off('task:commented', invalidate)
      }
    }
  }, [socket, workspaceId])

  // Filter tasks
  const filteredTasks = tasks.filter((task) => {
    return scopeFilters.every((f) => {
      const q = f.value.toLowerCase()
      switch (f.scope) {
        case 'name': return task.title.toLowerCase().includes(q)
        case 'tag': return task.tags?.some((t) => t.toLowerCase().includes(q))
        case 'category': return (task.category || '').toLowerCase().includes(q)
        case 'status': return task.status === f.value
        case 'assignee': return task.assignees?.some((a) => a.user.id === f.value)
        case 'all':
          return task.title.toLowerCase().includes(q) ||
            (task.description || '').toLowerCase().includes(q) ||
            task.tags?.some((t) => t.toLowerCase().includes(q)) ||
            (task.category || '').toLowerCase().includes(q)
        default: return true
      }
    })
  })

  // Stats — reflect current search/filter results
  const now = new Date()
  const totalTasks = filteredTasks.length
  const inProgressCount = filteredTasks.filter((t) => t.status === 'in-progress').length
  const completedCount = filteredTasks.filter((t) => t.status === 'completed').length
  const overdueCount = filteredTasks.filter((t) => t.dueDate && new Date(t.dueDate) < now && t.status !== 'completed').length

  const activeFilterCount = scopeFilters.length

  const openCreate = (mode: 'manual' | 'transcript' | 'audio' | 'live' | 'excel' | null = null) => {
    setAddDropdownOpen(false)
    const url = `/workspace/${workspaceId}/smart-create${mode ? `?mode=${mode}` : ''}`
    navigate(url)
  }

  return (
    <AppLayout>
      <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)' }}>

        {/* ── Stats bar ───────────────────────────────────────────────── */}
        <div className="px-6 py-4 border-b bg-card">
          <div className="flex items-center gap-4 flex-wrap">
            <StatCard icon={<ClipboardList className="w-4 h-4" />} label="Total" value={totalTasks} color="text-slate-600" bg="bg-slate-100" />
            <StatCard icon={<Clock className="w-4 h-4" />} label="In Progress" value={inProgressCount} color="text-blue-600" bg="bg-blue-100" />
            <StatCard icon={<CheckCircle2 className="w-4 h-4" />} label="Completed" value={completedCount} color="text-green-600" bg="bg-green-100" />
            <StatCard icon={<AlertCircle className="w-4 h-4" />} label="Overdue" value={overdueCount} color="text-red-600" bg="bg-red-100" />

            <div className="ml-auto flex items-center gap-2">
              {/* Direct task create */}
              <Button size="sm" className="gap-2" onClick={() => openCreate('manual')}>
                <Plus className="w-4 h-4" />
                New Task
              </Button>

              {/* Mic split button: mic → live, chevron → transcript/audio dropdown */}
              <div className="relative flex items-center">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 px-3 rounded-r-none border-r-0"
                  onClick={() => openCreate('live')}
                >
                  <Mic className="w-4 h-4 text-rose-500" />
                  <span className="text-xs font-medium hidden sm:block">Record</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="px-2 rounded-l-none"
                  onClick={() => setAddDropdownOpen((v) => !v)}
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </Button>

                {addDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setAddDropdownOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 w-52 rounded-xl border bg-popover shadow-lg z-20 py-2 overflow-hidden">
                      <p className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">AI Create</p>
                      {[
                        { mode: 'transcript' as const, icon: <FileText className="w-4 h-4 text-indigo-500" />, label: 'From Transcript', sub: 'Pick an existing transcript' },
                        { mode: 'audio' as const, icon: <Upload className="w-4 h-4 text-purple-500" />, label: 'Upload Audio', sub: 'Upload a recording' },
                        { mode: 'excel' as const, icon: <Sheet className="w-4 h-4 text-emerald-500" />, label: 'Import Excel / CSV', sub: 'Upload .xlsx, .xls or .csv' },
                      ].map(({ mode, icon, label, sub }) => (
                        <button
                          key={mode}
                          onClick={() => openCreate(mode)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-accent transition-colors text-left"
                        >
                          <span className="shrink-0">{icon}</span>
                          <div>
                            <div className="font-medium text-sm">{label}</div>
                            <div className="text-xs text-muted-foreground">{sub}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Smart Search ──────────────────────────────────────────────────── */}
        <div className="px-6 py-2.5 border-b bg-background/95 backdrop-blur-sm">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search by name, tag, category, status, or assignee…"
              value={searchText}
              onChange={(e) => { setSearchText(e.target.value); setSearchDropdownOpen(e.target.value.length > 0) }}
              onFocus={() => searchText.length > 0 && setSearchDropdownOpen(true)}
              onBlur={() => setTimeout(() => setSearchDropdownOpen(false), 150)}
              className="w-full pl-10 pr-9 py-2 text-sm border rounded-lg bg-muted/40 focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/60 transition-all placeholder:text-muted-foreground/60"
            />
            {searchText ? (
              <button
                onClick={() => { setSearchText(''); setSearchDropdownOpen(false) }}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            ) : (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-medium text-muted-foreground/50 hidden sm:block select-none">⌘K</span>
            )}

            {/* Suggestions dropdown */}
            {searchDropdownOpen && searchText.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1.5 bg-popover border border-border/80 rounded-xl shadow-xl z-30 overflow-hidden">
                {/* Search scope section */}
                <div className="px-3 pt-2.5 pb-1">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-1.5">Search scope</p>
                  {[
                    { scope: 'all' as const, label: 'Everywhere', desc: `"${searchText}"`, icon: <Search className="w-3.5 h-3.5" /> },
                    { scope: 'name' as const, label: 'Task name', desc: `contains "${searchText}"`, icon: <span className="text-[13px]">T</span> },
                    { scope: 'tag' as const, label: 'Tag', desc: `"${searchText}"`, icon: <Tag className="w-3.5 h-3.5" /> },
                    { scope: 'category' as const, label: 'Category', desc: `"${searchText}"`, icon: <Folder className="w-3.5 h-3.5" /> },
                  ].map((s) => (
                    <button
                      key={s.scope}
                      className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm hover:bg-accent transition-colors text-left group"
                      onMouseDown={() => {
                        const id = `${s.scope}-${searchText}-${Date.now()}`
                        setScopeFilters((prev) => [...prev, { id, scope: s.scope, value: searchText, label: `${s.label}: ${searchText}` }])
                        setSearchText('')
                        setSearchDropdownOpen(false)
                      }}
                    >
                      <span className="w-7 h-7 rounded-md bg-muted flex items-center justify-center text-muted-foreground group-hover:bg-background shrink-0">{s.icon}</span>
                      <div className="min-w-0">
                        <span className="font-medium text-foreground">{s.label}</span>
                        <span className="text-muted-foreground ml-1.5 text-xs">{s.desc}</span>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Status matches */}
                {['todo', 'in-progress', 'in-review', 'completed', 'cancelled'].filter((s) => s.includes(searchText.toLowerCase())).length > 0 && (
                  <div className="border-t border-border/50 px-3 pt-2 pb-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-1.5">Status</p>
                    {['todo', 'in-progress', 'in-review', 'completed', 'cancelled'].filter((s) => s.includes(searchText.toLowerCase())).map((status) => {
                      const dotColors: Record<string, string> = { todo: 'bg-slate-400', 'in-progress': 'bg-blue-500', 'in-review': 'bg-purple-500', completed: 'bg-green-500', cancelled: 'bg-gray-400' }
                      return (
                        <button
                          key={status}
                          className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm hover:bg-accent transition-colors text-left group"
                          onMouseDown={() => {
                            setScopeFilters((prev) => [...prev, { id: `status-${status}-${Date.now()}`, scope: 'status', value: status, label: `Status: ${status}` }])
                            setSearchText('')
                            setSearchDropdownOpen(false)
                          }}
                        >
                          <span className="w-7 h-7 rounded-md bg-muted flex items-center justify-center group-hover:bg-background shrink-0">
                            <span className={`w-2.5 h-2.5 rounded-full ${dotColors[status] || 'bg-slate-400'}`} />
                          </span>
                          <span className="font-medium text-foreground capitalize">{status.replace('-', ' ')}</span>
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* Assignee matches */}
                {members.filter((m) => m.name.toLowerCase().includes(searchText.toLowerCase())).length > 0 && (
                  <div className="border-t border-border/50 px-3 pt-2 pb-2">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-1.5">Members</p>
                    {members.filter((m) => m.name.toLowerCase().includes(searchText.toLowerCase())).map((m) => (
                      <button
                        key={m.id}
                        className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm hover:bg-accent transition-colors text-left group"
                        onMouseDown={() => {
                          setScopeFilters((prev) => [...prev, { id: `assignee-${m.id}-${Date.now()}`, scope: 'assignee', value: m.id, label: `Assignee: ${m.name}` }])
                          setSearchText('')
                          setSearchDropdownOpen(false)
                        }}
                      >
                        <span className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {m.name.charAt(0).toUpperCase()}
                        </span>
                        <span className="font-medium text-foreground">{m.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Active filter chips */}
          {scopeFilters.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              <span className="text-[11px] text-muted-foreground font-medium mr-0.5">Filters:</span>
              {scopeFilters.map((f) => (
                <span key={f.id} className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-[11px] font-medium bg-primary/8 text-primary border border-primary/15 hover:border-primary/30 transition-colors">
                  {f.label}
                  <button
                    onClick={() => setScopeFilters((prev) => prev.filter((x) => x.id !== f.id))}
                    className="w-3.5 h-3.5 rounded-full hover:bg-primary/20 flex items-center justify-center transition-colors ml-0.5"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
              <button
                onClick={() => setScopeFilters([])}
                className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-full hover:bg-muted transition-colors"
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* ── Task List ────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">
              Loading tasks...
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
                <ClipboardList className="w-7 h-7 text-muted-foreground" />
              </div>
              <p className="font-medium text-foreground mb-1">
                {scopeFilters.length > 0 || searchText.length > 0 ? 'No tasks match your filters' : 'No tasks yet'}
              </p>
              <p className="text-sm text-muted-foreground mb-5">
                {scopeFilters.length > 0 || searchText.length > 0
                  ? 'Try adjusting or clearing your filters.'
                  : 'Click "New Task" to create your first task.'}
              </p>
              {!activeFilterCount && !searchText && (
                <Button onClick={() => openCreate('manual')} className="gap-2">
                  <Plus className="w-4 h-4" /> Add Task
                </Button>
              )}
            </div>
          ) : (
            <div className="px-6 py-4 space-y-3 max-w-12xl mx-auto w-full">
              <p className="text-xs text-muted-foreground font-medium mb-1">
                {filteredTasks.length} {filteredTasks.length === 1 ? 'task' : 'tasks'}
                {(scopeFilters.length > 0 || searchText.length > 0) && ` · filtered from ${totalTasks}`}
              </p>
              {filteredTasks.map((task) => (
                <TaskListCard
                  key={task.id}
                  task={task}
                  selected={selectedTaskId === task.id}
                  onClick={() => setSelectedTaskId(selectedTaskId === task.id ? null : task.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Full-screen Task Detail Overlay ──────────────────────────── */}
      {selectedTaskId && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40 backdrop-blur-[2px]"
            onClick={() => setSelectedTaskId(null)}
          />
          <div className="fixed inset-y-0 right-0 w-full max-w-2xl z-50 shadow-2xl flex flex-col">
            <TaskDetailPane
              taskId={selectedTaskId}
              workspaceId={workspaceId!}
              onClose={() => setSelectedTaskId(null)}
            />
          </div>
        </>
      )}

    </AppLayout>
  )
}

function StatCard({
  icon, label, value, color, bg,
}: {
  icon: React.ReactNode
  label: string
  value: number
  color: string
  bg: string
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border bg-background min-w-[120px]">
      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', bg, color)}>
        {icon}
      </div>
      <div>
        <div className="text-xl font-bold leading-none">{value}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
      </div>
    </div>
  )
}
