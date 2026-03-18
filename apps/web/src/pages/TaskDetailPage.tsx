import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import AppLayout from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import MentionTextarea from '@/components/ui/MentionTextarea'
import { tasksApi, workspacesApi } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { useSocketStore } from '@/store/socketStore'
import { toast } from '@/hooks/use-toast'
import { ArrowLeft, Trash2, Send, X, Plus, UserPlus, Save, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Member {
  id: string
  name: string
  email: string
}

interface Update {
  id: string
  content: string
  createdAt: string
  user: { id: string; name: string; avatar?: string | null }
}

interface TaskAssignee {
  userId: string
  user: { id: string; name: string; avatar?: string | null }
}

interface Task {
  id: string
  title: string
  description?: string | null
  status: string
  priority: string
  tags?: string[]
  category?: string | null
  dueDate?: string | null
  assignees?: TaskAssignee[]
  workspaceId: string
  createdAt: string
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-green-100 text-green-700',
}

const STATUS_COLORS: Record<string, string> = {
  todo: 'bg-slate-100 text-slate-700',
  'in-progress': 'bg-blue-100 text-blue-700',
  'in-review': 'bg-purple-100 text-purple-700',
  completed: 'bg-green-100 text-green-700',
}

export default function TaskDetailPage() {
  const { workspaceId, taskId } = useParams<{ workspaceId: string; taskId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const { socket, connect, joinWorkspace } = useSocketStore()

  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editStatus, setEditStatus] = useState('')
  const [editPriority, setEditPriority] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editDueDate, setEditDueDate] = useState('')
  const [editTags, setEditTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [comment, setComment] = useState('')
  const [showAssigneeList, setShowAssigneeList] = useState(false)

  const { data: taskData, isLoading } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => tasksApi.get(taskId!).then((r) => r.data),
    enabled: !!taskId,
  })
  const task: Task | undefined = taskData?.task || taskData

  const { data: updatesData, refetch: refetchUpdates } = useQuery({
    queryKey: ['task-updates', taskId],
    queryFn: () => tasksApi.getUpdates(taskId!).then((r) => r.data),
    enabled: !!taskId,
  })
  const updates: Update[] = updatesData?.updates || updatesData || []

  const { data: membersData } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => workspacesApi.getMembers(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  })
  const members: Member[] = membersData?.members?.map((m: { user: Member }) => m.user) || []

  // Socket
  useEffect(() => { if (!socket) connect() }, [])
  useEffect(() => {
    if (socket && workspaceId) {
      joinWorkspace(workspaceId)
      socket.on('task:commented', () => refetchUpdates())
      socket.on('task:updated', () => queryClient.invalidateQueries({ queryKey: ['task', taskId] }))
      return () => { socket.off('task:commented'); socket.off('task:updated') }
    }
  }, [socket, workspaceId, taskId])

  // Sync edit state
  useEffect(() => {
    if (task) {
      setEditTitle(task.title)
      setEditDesc(task.description || '')
      setEditStatus(task.status)
      setEditPriority(task.priority)
      setEditCategory(task.category || '')
      setEditDueDate(task.dueDate ? task.dueDate.split('T')[0] : '')
      setEditTags(task.tags || [])
    }
  }, [task?.id])

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof tasksApi.update>[1]) => tasksApi.update(taskId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId] })
      queryClient.invalidateQueries({ queryKey: ['tasks', workspaceId] })
      setIsEditing(false)
      toast({ title: 'Task updated!' })
    },
    onError: () => toast({ title: 'Error', description: 'Failed to update task', variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: () => tasksApi.delete(taskId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', workspaceId] })
      toast({ title: 'Task deleted' })
      navigate(`/workspace/${workspaceId}`)
    },
    onError: () => toast({ title: 'Error', description: 'Failed to delete task', variant: 'destructive' }),
  })

  const assignMutation = useMutation({
    mutationFn: (userId: string) => tasksApi.assign(taskId!, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId] })
      toast({ title: 'Assignee added' })
    },
    onError: () => toast({ title: 'Error', description: 'Failed to assign user', variant: 'destructive' }),
  })

  const removeAssigneeMutation = useMutation({
    mutationFn: (userId: string) => tasksApi.removeAssignee(taskId!, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId] })
      toast({ title: 'Assignee removed' })
    },
    onError: () => toast({ title: 'Error', description: 'Failed to remove assignee', variant: 'destructive' }),
  })

  const commentMutation = useMutation({
    mutationFn: (content: string) => tasksApi.createUpdate(taskId!, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-updates', taskId] })
      setComment('')
    },
    onError: () => toast({ title: 'Error', description: 'Failed to post comment', variant: 'destructive' }),
  })

  const deleteUpdateMutation = useMutation({
    mutationFn: (updateId: string) => tasksApi.deleteUpdate(taskId!, updateId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['task-updates', taskId] }),
  })

  const handleSave = () => {
    updateMutation.mutate({
      title: editTitle.trim(),
      description: editDesc.trim() || null,
      status: editStatus,
      priority: editPriority,
      category: editCategory.trim() || null,
      dueDate: editDueDate ? new Date(editDueDate).toISOString() : null,
      tags: editTags,
    })
  }

  const addTag = () => {
    const t = tagInput.trim()
    if (t && !editTags.includes(t)) setEditTags([...editTags, t])
    setTagInput('')
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full text-muted-foreground">Loading task...</div>
      </AppLayout>
    )
  }

  if (!task) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-full gap-2">
          <p className="text-muted-foreground">Task not found.</p>
          <Link to={`/workspace/${workspaceId}`} className="text-primary hover:underline text-sm">
            Back to workspace
          </Link>
        </div>
      </AppLayout>
    )
  }

  const assignedUserIds = task.assignees?.map((a) => a.userId) || []
  const unassignedMembers = members.filter((m) => !assignedUserIds.includes(m.id))

  return (
    <AppLayout>
      <div className="max-w-12xl mx-auto p-6 space-y-6">
        <Link
          to={`/workspace/${workspaceId}`}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to workspace
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── Main Content ────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardContent className="p-6 space-y-5">
                {/* Title */}
                {isEditing ? (
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="text-xl font-bold"
                    placeholder="Task title"
                  />
                ) : (
                  <h1 className="text-2xl font-bold">{task.title}</h1>
                )}

                {/* Status/Priority badges */}
                <div className="flex flex-wrap gap-2">
                  <Badge className={cn('text-xs border-0', STATUS_COLORS[task.status] || 'bg-muted text-muted-foreground')}>
                    {task.status.replace(/-/g, ' ')}
                  </Badge>
                  <Badge className={cn('text-xs border-0', PRIORITY_COLORS[task.priority] || 'bg-muted text-muted-foreground')}>
                    {task.priority}
                  </Badge>
                  {task.category && <Badge variant="outline" className="text-xs">{task.category}</Badge>}
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Description</Label>
                  {isEditing ? (
                    <Textarea
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      placeholder="Add a description..."
                      rows={4}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                      {task.description || 'No description provided.'}
                    </p>
                  )}
                </div>

                {/* Tags */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Tags</Label>
                  {isEditing ? (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Input
                          placeholder="Add tag..."
                          value={tagInput}
                          onChange={(e) => setTagInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                          className="h-8"
                        />
                        <Button type="button" size="sm" variant="outline" onClick={addTag}>
                          <Plus className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {editTags.map((tag) => (
                          <span key={tag} className="flex items-center gap-1 bg-secondary text-xs px-2 py-0.5 rounded-full">
                            {tag}
                            <button onClick={() => setEditTags(editTags.filter((t) => t !== tag))}>
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {task.tags && task.tags.length > 0 ? task.tags.map((tag) => (
                        <span key={tag} className="bg-secondary text-secondary-foreground text-xs px-2 py-0.5 rounded-full">{tag}</span>
                      )) : (
                        <span className="text-xs text-muted-foreground">No tags</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Edit controls */}
                <div className="flex gap-2 pt-1">
                  {isEditing ? (
                    <>
                      <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending} className="gap-1">
                        <Save className="w-3.5 h-3.5" />
                        {updateMutation.isPending ? 'Saving...' : 'Save'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
                    </>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>Edit Task</Button>
                  )}
                  <Button
                    size="sm" variant="destructive" className="ml-auto gap-1"
                    onClick={() => { if (confirm('Delete this task?')) deleteMutation.mutate() }}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* ── Comments ──────────────────────────────────────── */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Updates {updates.length > 0 && `(${updates.length})`}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Comment input with @mention */}
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-semibold shrink-0 mt-0.5">
                    {user?.name?.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 space-y-2">
                    <MentionTextarea
                      value={comment}
                      onChange={setComment}
                      onSubmit={() => { if (comment.trim()) commentMutation.mutate(comment.trim()) }}
                      placeholder="Write an update... type @ to mention someone"
                      members={members}
                      minRows={2}
                    />
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-muted-foreground">Enter to send · Shift+Enter for new line · @ to mention</p>
                      <Button
                        size="sm"
                        className="gap-1.5 h-8"
                        disabled={!comment.trim() || commentMutation.isPending}
                        onClick={() => { if (comment.trim()) commentMutation.mutate(comment.trim()) }}
                      >
                        <Send className="w-3.5 h-3.5" />
                        Post
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Comments list */}
                <div className="space-y-4">
                  {updates.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No updates yet. Be the first!</p>
                  ) : updates.map((update) => (
                    <div key={update.id} className="flex gap-3 group">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-semibold shrink-0">
                        {update.user.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold">{update.user.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(update.createdAt), 'MMM d, h:mm a')}
                          </span>
                        </div>
                        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                          {renderWithMentions(update.content)}
                        </p>
                      </div>
                      {user?.id === update.user.id && (
                        <button
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-1"
                          onClick={() => deleteUpdateMutation.mutate(update.id)}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Sidebar ───────────────────────────────────────── */}
          <div className="space-y-4">
            {/* Details */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Status */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  {isEditing ? (
                    <Select value={editStatus} onValueChange={setEditStatus}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todo">Todo</SelectItem>
                        <SelectItem value="in-progress">In Progress</SelectItem>
                        <SelectItem value="in-review">In Review</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {['todo', 'in-progress', 'in-review', 'completed'].map((s) => (
                        <button
                          key={s}
                          onClick={() => updateMutation.mutate({ status: s })}
                          className={cn(
                            'text-xs px-2 py-0.5 rounded-full transition-colors',
                            task.status === s
                              ? (STATUS_COLORS[s] || 'bg-muted text-muted-foreground') + ' font-semibold'
                              : 'bg-muted text-muted-foreground hover:bg-secondary'
                          )}
                        >
                          {task.status === s && <Check className="w-3 h-3 inline mr-1" />}
                          {s.replace(/-/g, ' ')}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Priority */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Priority</Label>
                  {isEditing ? (
                    <Select value={editPriority} onValueChange={setEditPriority}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="urgent">Urgent</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge className={cn('text-xs border-0', PRIORITY_COLORS[task.priority])}>{task.priority}</Badge>
                  )}
                </div>

                {/* Category */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Category</Label>
                  {isEditing ? (
                    <Input value={editCategory} onChange={(e) => setEditCategory(e.target.value)} className="h-8 text-xs" placeholder="Category" />
                  ) : (
                    <p className="text-sm">{task.category || <span className="text-muted-foreground">—</span>}</p>
                  )}
                </div>

                {/* Due Date */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Due Date</Label>
                  {isEditing ? (
                    <Input type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} className="h-8 text-xs" />
                  ) : (
                    <p className="text-sm">{task.dueDate ? format(new Date(task.dueDate), 'MMM d, yyyy') : <span className="text-muted-foreground">—</span>}</p>
                  )}
                </div>

                {/* Created */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Created</Label>
                  <p className="text-sm">{format(new Date(task.createdAt), 'MMM d, yyyy')}</p>
                </div>
              </CardContent>
            </Card>

            {/* Assignees */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Assignees</CardTitle>
                  {unassignedMembers.length > 0 && (
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowAssigneeList(!showAssigneeList)}>
                      <UserPlus className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {task.assignees && task.assignees.length > 0 ? (
                  task.assignees.map(({ userId, user: u }) => (
                    <div key={userId} className="flex items-center gap-2 group">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-semibold">
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm flex-1">{u.name}</span>
                      <button
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                        onClick={() => removeAssigneeMutation.mutate(userId)}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">No assignees</p>
                )}

                {showAssigneeList && unassignedMembers.length > 0 && (
                  <div className="mt-2 border rounded-md p-1 space-y-0.5 max-h-36 overflow-y-auto">
                    {unassignedMembers.map((m) => (
                      <button
                        key={m.id}
                        className="flex items-center gap-2 w-full hover:bg-accent p-1.5 rounded text-sm text-left"
                        onClick={() => { assignMutation.mutate(m.id); setShowAssigneeList(false) }}
                      >
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-[10px] font-semibold">
                          {m.name.charAt(0).toUpperCase()}
                        </div>
                        {m.name}
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}

/** Highlights @mentions in comment text */
function renderWithMentions(content: string) {
  const parts = content.split(/(@\w+)/g)
  return parts.map((part, i) =>
    part.startsWith('@') ? (
      <span key={i} className="text-primary font-medium">{part}</span>
    ) : part
  )
}
