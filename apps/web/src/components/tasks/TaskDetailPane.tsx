import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tasksApi, workspacesApi } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import MentionTextarea from '@/components/ui/MentionTextarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'
import {
  X, Calendar, Tag, User, Flag, Folder, MessageSquare,
  Trash2, Pencil, Check, ExternalLink, Loader2, Plus,
} from 'lucide-react'
import { format, isValid } from 'date-fns'
import { Link } from 'react-router-dom'

interface TaskDetailPaneProps {
  taskId: string | null
  workspaceId: string
  onClose: () => void
}

interface Update {
  id: string
  content: string
  createdAt: string
  user: { id: string; name: string; avatar?: string | null }
}

interface Task {
  id: string
  title: string
  description?: string | null
  status: string
  priority: string
  category?: string | null
  tags: string[]
  dueDate?: string | null
  workspaceId: string
  assignees: { userId: string; user: { id: string; name: string; avatar?: string | null } }[]
  creator?: { id: string; name: string }
  createdAt: string
  updatedAt: string
}

interface Member {
  id: string
  name: string
  email: string
}

const STATUS_OPTIONS = [
  { value: 'todo', label: 'Todo', color: 'bg-slate-100 text-slate-700' },
  { value: 'in-progress', label: 'In Progress', color: 'bg-blue-100 text-blue-700' },
  { value: 'in-review', label: 'In Review', color: 'bg-purple-100 text-purple-700' },
  { value: 'completed', label: 'Completed', color: 'bg-green-100 text-green-700' },
]

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low', color: 'text-slate-500' },
  { value: 'medium', label: 'Medium', color: 'text-yellow-600' },
  { value: 'high', label: 'High', color: 'text-orange-500' },
  { value: 'urgent', label: 'Urgent', color: 'text-red-600' },
]

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
}

function renderWithMentions(content: string) {
  const parts = content.split(/(@\w+)/g)
  return parts.map((part, i) =>
    part.startsWith('@') ? (
      <span key={i} className="text-primary font-medium">{part}</span>
    ) : part
  )
}

export default function TaskDetailPane({ taskId, workspaceId, onClose }: TaskDetailPaneProps) {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()

  // ── Edit states ──────────────────────────────────────────────────────────
  const [comment, setComment] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState('')
  const [editingDesc, setEditingDesc] = useState(false)
  const [descValue, setDescValue] = useState('')
  const [editingCategory, setEditingCategory] = useState(false)
  const [categoryValue, setCategoryValue] = useState('')
  const [editingDueDate, setEditingDueDate] = useState(false)
  const [dueDateValue, setDueDateValue] = useState('')
  const [editingTags, setEditingTags] = useState(false)
  const [tagsValue, setTagsValue] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [assigneeDropdownOpen, setAssigneeDropdownOpen] = useState(false)
  const commentsEndRef = useRef<HTMLDivElement>(null)

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: taskData, isLoading: taskLoading } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => tasksApi.get(taskId!).then((r) => r.data.task as Task),
    enabled: !!taskId,
  })

  const { data: updatesData, isLoading: updatesLoading } = useQuery({
    queryKey: ['task-updates', taskId],
    queryFn: () => tasksApi.getUpdates(taskId!).then((r) => r.data),
    enabled: !!taskId,
    refetchInterval: 10000,
  })

  const { data: membersData } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => workspacesApi.getMembers(workspaceId).then((r) => r.data),
    enabled: !!workspaceId,
  })

  const updates: Update[] = updatesData?.updates || []
  const rawMembers: { userId: string; role: string; user: Member }[] = membersData?.members || []
  const members: Member[] = rawMembers.map((m) => m.user)

  // Sync local edit state when task loads / task ID changes
  useEffect(() => {
    if (taskData) {
      setTitleValue(taskData.title)
      setDescValue(taskData.description || '')
      setCategoryValue(taskData.category || '')
      setTagsValue(taskData.tags || [])
      setDueDateValue(taskData.dueDate ? taskData.dueDate.slice(0, 10) : '')
    }
  }, [taskData?.id])

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [updates.length])

  // ── Mutations ────────────────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => tasksApi.update(taskId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId] })
      queryClient.invalidateQueries({ queryKey: ['tasks', workspaceId] })
    },
    onError: () => toast({ title: 'Failed to update task', variant: 'destructive' }),
  })

  const commentMutation = useMutation({
    mutationFn: (content: string) => tasksApi.createUpdate(taskId!, content),
    onSuccess: () => {
      setComment('')
      queryClient.invalidateQueries({ queryKey: ['task-updates', taskId] })
    },
    onError: () => toast({ title: 'Failed to post comment', variant: 'destructive' }),
  })

  const deleteCommentMutation = useMutation({
    mutationFn: (updateId: string) => tasksApi.deleteUpdate(taskId!, updateId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['task-updates', taskId] }),
    onError: () => toast({ title: 'Failed to delete comment', variant: 'destructive' }),
  })

  // ── Handlers ─────────────────────────────────────────────────────────────
  const save = (data: Record<string, unknown>) => updateMutation.mutate(data)

  const handleTitleSave = () => {
    if (titleValue.trim() && titleValue !== taskData?.title)
      save({ title: titleValue.trim() })
    setEditingTitle(false)
  }

  const handleDescSave = () => {
    if (descValue !== taskData?.description)
      save({ description: descValue || null })
    setEditingDesc(false)
  }

  const handleCategorySave = () => {
    if (categoryValue !== (taskData?.category || ''))
      save({ category: categoryValue.trim() || null })
    setEditingCategory(false)
  }

  const handleDueDateSave = () => {
    const iso = dueDateValue ? new Date(dueDateValue).toISOString() : null
    if (iso !== taskData?.dueDate) save({ dueDate: iso })
    setEditingDueDate(false)
  }

  const handleTagsSave = () => {
    save({ tags: tagsValue })
    setEditingTags(false)
  }

  const addTag = () => {
    const t = tagInput.trim()
    if (t && !tagsValue.includes(t)) setTagsValue((prev) => [...prev, t])
    setTagInput('')
  }

  const removeTag = (tag: string) => setTagsValue((prev) => prev.filter((t) => t !== tag))

  const toggleAssignee = (memberId: string) => {
    if (!task) return
    const currentIds = task.assignees.map((a) => a.userId)
    const newIds = currentIds.includes(memberId)
      ? currentIds.filter((id) => id !== memberId)
      : [...currentIds, memberId]
    save({ assigneeIds: newIds })
  }

  const task = taskData
  const statusInfo = STATUS_OPTIONS.find((s) => s.value === task?.status)
  const isOverdue = task?.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'completed'
  const myMember = rawMembers.find((m) => m.userId === user?.id)
  const isAssignee = task?.assignees.some((a) => a.userId === user?.id) ?? false
  const canEdit = !myMember || myMember.role !== 'member' || isAssignee || task?.creator?.id === user?.id

  return (
    <div className="flex flex-col h-full bg-background border-l shadow-xl">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b bg-card shrink-0">
        <div className="flex items-center gap-2">
          {task && (
            <Link
              to={`/workspace/${workspaceId}/tasks/${task.id}`}
              className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Open full page
            </Link>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {taskLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : !task ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Task not found
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-5">

            {/* ── Title ─────────────────────────────────────────────── */}
            <div>
              {editingTitle ? (
                <div className="flex items-start gap-2">
                  <Input
                    value={titleValue}
                    onChange={(e) => setTitleValue(e.target.value)}
                    className="text-base font-semibold"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleTitleSave()
                      if (e.key === 'Escape') { setEditingTitle(false); setTitleValue(task.title) }
                    }}
                  />
                  <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={handleTitleSave}>
                    <Check className="w-4 h-4 text-green-600" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-start gap-2 group">
                  <h2 className="text-lg font-semibold leading-snug flex-1">{task.title}</h2>
                  {canEdit && (
                    <button
                      onClick={() => setEditingTitle(true)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-accent transition-all shrink-0"
                    >
                      <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* ── Status + Priority ─────────────────────────────────── */}
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={task.status} onValueChange={canEdit ? (v) => save({ status: v }) : undefined} disabled={!canEdit}>
                <SelectTrigger className="h-8 w-auto text-xs border rounded-full px-3 font-medium">
                  <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', statusInfo?.color)}>
                    {statusInfo?.label}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', s.color)}>{s.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={task.priority} onValueChange={canEdit ? (v) => save({ priority: v }) : undefined} disabled={!canEdit}>
                <SelectTrigger className="h-8 w-auto text-xs border rounded-full px-3">
                  <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1', PRIORITY_COLORS[task.priority])}>
                    <Flag className="w-3 h-3" />
                    {PRIORITY_OPTIONS.find((p) => p.value === task.priority)?.label}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      <span className={cn('flex items-center gap-1.5 text-xs', p.color)}>
                        <Flag className="w-3 h-3" />{p.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* ── Meta fields ───────────────────────────────────────── */}
            <div className="space-y-3 border rounded-xl p-4 bg-muted/30">

              {/* Category */}
              <div className="flex items-center gap-3 group">
                <Folder className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground w-20 shrink-0">Category</span>
                {editingCategory ? (
                  <div className="flex items-center gap-1.5 flex-1">
                    <Input
                      value={categoryValue}
                      onChange={(e) => setCategoryValue(e.target.value)}
                      className="h-7 text-xs flex-1"
                      placeholder="e.g. Engineering"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCategorySave()
                        if (e.key === 'Escape') { setEditingCategory(false); setCategoryValue(task.category || '') }
                      }}
                    />
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleCategorySave}>
                      <Check className="w-3.5 h-3.5 text-green-600" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingCategory(false); setCategoryValue(task.category || '') }}>
                      <X className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                ) : (
                  <div
                    className={cn("flex-1 flex items-center gap-1.5", canEdit && "cursor-pointer group/val")}
                    onClick={canEdit ? () => setEditingCategory(true) : undefined}
                  >
                    {task.category ? (
                      <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-md font-medium">{task.category}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground/50 italic">{canEdit ? 'Click to set' : '—'}</span>
                    )}
                    {canEdit && <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover/val:opacity-100 transition-opacity" />}
                  </div>
                )}
              </div>

              {/* Due Date */}
              <div className="flex items-center gap-3 group">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground w-20 shrink-0">Due Date</span>
                {editingDueDate ? (
                  <div className="flex items-center gap-1.5 flex-1">
                    <input
                      type="date"
                      value={dueDateValue}
                      onChange={(e) => setDueDateValue(e.target.value)}
                      className="h-7 text-xs border rounded-md px-2 flex-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleDueDateSave()
                        if (e.key === 'Escape') { setEditingDueDate(false); setDueDateValue(task.dueDate ? task.dueDate.slice(0, 10) : '') }
                      }}
                    />
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleDueDateSave}>
                      <Check className="w-3.5 h-3.5 text-green-600" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                      save({ dueDate: null })
                      setDueDateValue('')
                      setEditingDueDate(false)
                    }}>
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingDueDate(false); setDueDateValue(task.dueDate ? task.dueDate.slice(0, 10) : '') }}>
                      <X className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                ) : (
                  <div
                    className={cn("flex-1 flex items-center gap-1.5", canEdit && "cursor-pointer group/val")}
                    onClick={canEdit ? () => setEditingDueDate(true) : undefined}
                  >
                    {task.dueDate && isValid(new Date(task.dueDate)) ? (
                      <span className={cn('text-xs font-medium', isOverdue ? 'text-red-600' : 'text-foreground')}>
                        {isOverdue && 'Overdue · '}{format(new Date(task.dueDate), 'MMM d, yyyy')}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/50 italic">{canEdit ? 'Click to set' : '—'}</span>
                    )}
                    {canEdit && <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover/val:opacity-100 transition-opacity" />}
                  </div>
                )}
              </div>

              {/* Tags */}
              <div className="flex items-start gap-3">
                <Tag className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-1" />
                <span className="text-xs text-muted-foreground w-20 shrink-0 mt-1">Tags</span>
                <div className="flex-1">
                  {editingTags ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-1.5">
                        {tagsValue.map((tag) => (
                          <span key={tag} className="inline-flex items-center gap-1 text-xs bg-secondary px-2 py-0.5 rounded-full">
                            {tag}
                            <button onClick={() => removeTag(tag)} className="hover:text-destructive transition-colors">
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-1.5">
                        <Input
                          value={tagInput}
                          onChange={(e) => setTagInput(e.target.value)}
                          className="h-7 text-xs"
                          placeholder="Add tag..."
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); addTag() }
                            if (e.key === 'Escape') { setEditingTags(false); setTagsValue(task.tags || []) }
                          }}
                        />
                        <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={addTag}>
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                      <div className="flex gap-1.5">
                        <Button size="sm" className="h-7 text-xs" onClick={handleTagsSave}>Save</Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEditingTags(false); setTagsValue(task.tags || []) }}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={cn("flex flex-wrap gap-1.5 min-h-[24px]", canEdit && "cursor-pointer group/val")}
                      onClick={canEdit ? () => setEditingTags(true) : undefined}
                    >
                      {task.tags?.length > 0 ? (
                        <>
                          {task.tags.map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-xs px-1.5 py-0 h-5">{tag}</Badge>
                          ))}
                          {canEdit && <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover/val:opacity-100 transition-opacity self-center" />}
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground/50 italic">{canEdit ? 'Click to add tags' : 'No tags'}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Assignees */}
              <div className="flex items-start gap-3">
                <User className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-1" />
                <span className="text-xs text-muted-foreground w-20 shrink-0 mt-1">Assignees</span>
                <div className="flex-1 relative">
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {task.assignees.map(({ userId, user: u }) => (
                      <div key={userId} className="flex items-center gap-1 text-xs bg-secondary px-2 py-0.5 rounded-full">
                        <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-[10px] font-semibold">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        {u.name}
                        {canEdit && (
                          <button
                            onClick={() => toggleAssignee(userId)}
                            className="hover:text-destructive transition-colors ml-0.5"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="relative">
                    {canEdit && (
                    <button
                      onClick={() => setAssigneeDropdownOpen((v) => !v)}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors border border-dashed rounded-full px-2 py-0.5 hover:border-primary"
                    >
                      <Plus className="w-3 h-3" /> Add assignee
                    </button>
                    )}
                    {assigneeDropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setAssigneeDropdownOpen(false)} />
                        <div className="absolute left-0 top-full mt-1 w-52 rounded-lg border bg-popover shadow-lg z-20 py-1 max-h-48 overflow-y-auto">
                          {members.length === 0 ? (
                            <p className="px-3 py-2 text-xs text-muted-foreground">No members found</p>
                          ) : members.map((m) => {
                            const assigned = task.assignees.some((a) => a.userId === m.id)
                            return (
                              <button
                                key={m.id}
                                onClick={() => { toggleAssignee(m.id); setAssigneeDropdownOpen(false) }}
                                className={cn(
                                  'w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent transition-colors text-left',
                                  assigned && 'bg-primary/5'
                                )}
                              >
                                <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-[10px] font-semibold shrink-0">
                                  {m.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium truncate">{m.name}</div>
                                  <div className="text-xs text-muted-foreground truncate">{m.email}</div>
                                </div>
                                {assigned && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                              </button>
                            )
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

            </div>

            {/* ── Description ───────────────────────────────────────── */}
            <div className="border-t pt-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Description</p>
              {editingDesc ? (
                <div className="space-y-2">
                  <Textarea
                    value={descValue}
                    onChange={(e) => setDescValue(e.target.value)}
                    className="text-sm min-h-[100px] resize-none"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') { setEditingDesc(false); setDescValue(task.description || '') }
                    }}
                  />
                  <div className="flex gap-1.5">
                    <Button size="sm" className="h-7 text-xs" onClick={handleDescSave}>Save</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEditingDesc(false); setDescValue(task.description || '') }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  className={cn("text-sm text-muted-foreground rounded-lg p-3 -mx-1 min-h-[48px] leading-relaxed", canEdit && "cursor-pointer hover:bg-accent transition-colors")}
                  onClick={canEdit ? () => setEditingDesc(true) : undefined}
                >
                  {task.description || <span className="italic text-xs">{canEdit ? 'Click to add description...' : 'No description'}</span>}
                </div>
              )}
            </div>

            {/* ── Updates / Comments ────────────────────────────────── */}
            <div className="border-t pt-4">
              <div className="flex items-center gap-2 mb-4">
                <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Updates {updates.length > 0 && `(${updates.length})`}
                </p>
              </div>

              {updatesLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-4 mb-4">
                  {updates.length === 0 && (
                    <p className="text-xs text-muted-foreground italic text-center py-3">No updates yet</p>
                  )}
                  {updates.map((u) => (
                    <div key={u.id} className="flex gap-3 group">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-[11px] font-semibold shrink-0 mt-0.5">
                        {u.user.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs font-semibold">{u.user.name}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {isValid(new Date(u.createdAt)) ? format(new Date(u.createdAt), 'MMM d, h:mm a') : ''}
                          </span>
                        </div>
                        <p className="text-sm text-foreground mt-0.5 leading-relaxed whitespace-pre-wrap break-words">{renderWithMentions(u.content)}</p>
                      </div>
                      {u.user.id === user?.id && (
                        <button
                          onClick={() => deleteCommentMutation.mutate(u.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-all shrink-0"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                  <div ref={commentsEndRef} />
                </div>
              )}

              <div className="space-y-2">
                <MentionTextarea
                  value={comment}
                  onChange={setComment}
                  onSubmit={() => { if (comment.trim()) commentMutation.mutate(comment.trim()) }}
                  placeholder="Write an update... type @ to mention someone"
                  members={members}
                  minRows={2}
                />
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-muted-foreground">Enter to send · Shift+Enter for newline · @ to mention</p>
                  <Button
                    size="sm"
                    className="h-8 shrink-0"
                    disabled={!comment.trim() || commentMutation.isPending}
                    onClick={() => { if (comment.trim()) commentMutation.mutate(comment.trim()) }}
                  >
                    {commentMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Post'}
                  </Button>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}
