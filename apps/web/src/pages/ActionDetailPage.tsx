import { useState, useRef, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format, isBefore, formatDistanceToNow } from 'date-fns'
import AppLayout from '@/components/layout/AppLayout'
import { actionsApi, initiativesApi } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'


const STATUS_CONFIG: Record<string, { label: string; dotColor: string; pillCls: string; activeCls: string }> = {
  'todo':        { label: 'To Do',       dotColor: '#d1d5db', pillCls: 'bg-[#f3f4f6] text-[#6b7280]',   activeCls: 'bg-[#f3f4f6] text-[#6b7280] border-[#e5e7eb]' },
  'in-progress': { label: 'In Progress', dotColor: '#4648d4', pillCls: 'bg-[#ede9fe] text-[#4648d4]',   activeCls: 'bg-[#ede9fe] text-[#4648d4] border-[#c4b5fd]' },
  'in-review':   { label: 'In Review',   dotColor: '#2563eb', pillCls: 'bg-[#eff6ff] text-[#2563eb]',   activeCls: 'bg-[#eff6ff] text-[#2563eb] border-[#bfdbfe]' },
  'completed':   { label: 'Completed',   dotColor: '#22c55e', pillCls: 'bg-[#f0fdf4] text-[#16a34a]',   activeCls: 'bg-[#f0fdf4] text-[#16a34a] border-[#bbf7d0]' },
}

/** Render @[Name](userId) tokens as styled mention pills */
function MentionContent({ content }: { content: string }) {
  const parts = content.split(/(@\[[^\]]+\]\([^)]+\))/g)
  return (
    <span>
      {parts.map((part, i) => {
        const m = part.match(/^@\[([^\]]+)\]\([^)]+\)$/)
        if (m) return <span key={i} className="inline-flex items-center px-1.5 py-0 rounded-md bg-[#ede9fe] text-[#4648d4] text-[13px] font-semibold mx-0.5">@{m[1]}</span>
        return <span key={i}>{part}</span>
      })}
    </span>
  )
}

function Avatar({ name, avatar, size = 'sm' }: { name?: string; avatar?: string | null; size?: 'xs' | 'sm' | 'md' }) {
  const sizeMap = { xs: 'w-5 h-5 text-[10px]', sm: 'w-7 h-7 text-[11px]', md: 'w-9 h-9 text-[13px]' }
  const initials = name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '?'
  if (avatar) return <img src={avatar} alt={name} className={cn('rounded-full object-cover shrink-0', sizeMap[size])} />
  return (
    <div className={cn('rounded-full bg-[#ede9fe] text-[#4648d4] font-bold flex items-center justify-center shrink-0', sizeMap[size])}>
      {initials}
    </div>
  )
}

export default function ActionDetailPage() {
  const { initiativeId, actionId } = useParams<{ initiativeId: string; actionId: string }>()
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const commentRef = useRef<HTMLTextAreaElement>(null)
  const [comment, setComment] = useState('')
  const [posting, setPosting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingUpdateId, setEditingUpdateId] = useState<string | null>(null)
  const [editingUpdateContent, setEditingUpdateContent] = useState('')
  const [savingUpdate, setSavingUpdate] = useState(false)
  // Mention autocomplete
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionHighlight, setMentionHighlight] = useState(0)
  const mentionBoxRef = useRef<HTMLDivElement>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Inline edit state
  const [editTitle, setEditTitle] = useState(false)
  const [editDesc, setEditDesc] = useState(false)
  const [titleVal, setTitleVal] = useState('')
  const [descVal, setDescVal] = useState('')
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false)
  const assigneeRef = useRef<HTMLDivElement>(null)
  const [showInitiativeDropdown, setShowInitiativeDropdown] = useState(false)
  const initiativeDropRef = useRef<HTMLDivElement>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['action', actionId],
    queryFn: () => actionsApi.getDetail(actionId!).then((r) => r.data),
    enabled: !!actionId,
  })
  const action: any = (data as any)?.action || null

  // Fetch initiative members for assignee picker
  const resolvedInitiativeId = initiativeId || action?.initiative?.id
  const { data: initData } = useQuery({
    queryKey: ['initiative', resolvedInitiativeId],
    queryFn: () => initiativesApi.get(resolvedInitiativeId!).then((r) => r.data),
    enabled: !!resolvedInitiativeId,
  })
  const initiative: any = (initData as any)?.initiative || null
  const members: any[] = initiative?.members || []

  // Fetch all user's initiatives for the initiative picker
  const { data: allInitData } = useQuery({
    queryKey: ['initiatives'],
    queryFn: () => initiativesApi.list().then((r) => r.data),
  })
  const allInitiatives: any[] = (allInitData as any)?.initiatives || []

  const now = new Date()
  const isOverdue = action?.dueDate && isBefore(new Date(action.dueDate), now) && action?.status !== 'completed'

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (assigneeRef.current && !assigneeRef.current.contains(e.target as Node)) setShowAssigneeDropdown(false)
      if (initiativeDropRef.current && !initiativeDropRef.current.contains(e.target as Node)) setShowInitiativeDropdown(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const handleDelete = async () => {
    if (!actionId) return
    setDeleting(true)
    try {
      await actionsApi.delete(actionId)
      queryClient.invalidateQueries({ queryKey: ['command-center'] })
      queryClient.invalidateQueries({ queryKey: ['initiative', resolvedInitiativeId] })
      resolvedInitiativeId ? navigate(`/command-center?initiativeId=${resolvedInitiativeId}`) : navigate('/command-center')
    } finally { setDeleting(false) }
  }

  const handleUpdate = async (patch: Record<string, any>) => {
    if (!actionId) return
    setSaving(true)
    try {
      await actionsApi.update(actionId, patch)
      queryClient.invalidateQueries({ queryKey: ['action', actionId] })
      queryClient.invalidateQueries({ queryKey: ['initiative', resolvedInitiativeId] })
      queryClient.invalidateQueries({ queryKey: ['command-center'] })
    } finally { setSaving(false) }
  }

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!comment.trim() || !actionId) return
    setPosting(true)
    try {
      await actionsApi.addUpdate(actionId, comment.trim())
      queryClient.invalidateQueries({ queryKey: ['action', actionId] })
      setComment('')
    } finally { setPosting(false) }
  }

  const handleSaveUpdateEdit = async (updateId: string) => {
    if (!editingUpdateContent.trim() || !actionId) return
    setSavingUpdate(true)
    try {
      await actionsApi.editUpdate(actionId, updateId, editingUpdateContent.trim())
      queryClient.invalidateQueries({ queryKey: ['action', actionId] })
      setEditingUpdateId(null)
    } finally { setSavingUpdate(false) }
  }

  // Mention helpers
  const mentionMembers: any[] = mentionQuery !== null
    ? members.filter((m: any) => m.user?.name?.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 6)
    : []

  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setComment(val)
    const cursor = e.target.selectionStart ?? val.length
    const before = val.slice(0, cursor)
    const m = before.match(/@(\w*)$/)
    if (m) { setMentionQuery(m[1]); setMentionHighlight(0) }
    else setMentionQuery(null)
  }

  const insertMention = (member: any) => {
    const cursor = commentRef.current?.selectionStart ?? comment.length
    const before = comment.slice(0, cursor)
    const after = comment.slice(cursor)
    const atPos = before.lastIndexOf('@')
    const newText = before.slice(0, atPos) + `@[${member.user.name}](${member.user.id}) ` + after
    setComment(newText)
    setMentionQuery(null)
    setTimeout(() => commentRef.current?.focus(), 0)
  }

  const handleCommentKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery !== null && mentionMembers.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionHighlight((h) => Math.min(h + 1, mentionMembers.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setMentionHighlight((h) => Math.max(h - 1, 0)) }
      else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionMembers[mentionHighlight]); return }
      else if (e.key === 'Escape') { setMentionQuery(null); return }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handlePostComment(e as any)
  }

  useEffect(() => {
    if (commentRef.current) {
      commentRef.current.style.height = 'auto'
      commentRef.current.style.height = commentRef.current.scrollHeight + 'px'
    }
  }, [comment])

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen bg-[#f9fafb]">
          <div className="w-6 h-6 border-[3px] border-[#ede9fe] border-t-[#4648d4] rounded-full animate-spin" />
        </div>
      </AppLayout>
    )
  }

  if (!action) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen bg-[#f9fafb]">
          <p className="text-[#6b7280] text-[14px]">Action not found.</p>
        </div>
      </AppLayout>
    )
  }

  const tags: { id: string; name: string; color: string }[] = action.tags?.map((at: any) => at.tag) || []
  const updates: any[] = action.updates || []
  const statusCfg = STATUS_CONFIG[action.status] || STATUS_CONFIG['todo']

  // Can the current user edit this action?
  const userMemberRole = initiative
    ? (initiative.creator?.id === user?.id ? 'owner' : (members.find((m: any) => m.userId === user?.id)?.role ?? 'member'))
    : 'owner'
  const isOwnerOrAdmin = userMemberRole === 'owner' || userMemberRole === 'admin'
  const canEdit = isOwnerOrAdmin || action.createdBy === user?.id || action.assignee?.id === user?.id

  // All assignable people
  const allAssignees = initiative ? [
    { id: initiative.creator.id, name: initiative.creator.name, avatar: initiative.creator.avatar || null, role: 'owner', dept: '' },
    ...members.filter((m: any) => m.userId !== initiative.creator.id).map((m: any) => ({
      id: m.userId, name: m.user?.name, avatar: m.user?.avatar || null, role: m.role, dept: m.department || '',
    })),
  ] : action.assignee ? [{ id: action.assignee.id, name: action.assignee.name, avatar: action.assignee.avatar, role: '', dept: '' }] : []

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#f9fafb] p-3 md:p-3.5">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-[12px] text-[#9ca3af] mb-6 overflow-x-auto whitespace-nowrap">
          <button
            onClick={() => resolvedInitiativeId ? navigate(`/command-center?initiativeId=${resolvedInitiativeId}`) : navigate('/command-center')}
            className="hover:text-[#4648d4] transition-colors"
          >
            Command Center
          </button>
          <span className="text-[#e5e7eb]">/</span>
          <span className="text-[#374151] font-medium truncate max-w-[200px]">{action.title}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 max-w-5xl">
          {/* LEFT */}
          <div className="col-span-12 lg:col-span-8 space-y-4">
            {/* Title + Description card */}
            <div className="bg-white rounded-xl border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] p-3.5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: statusCfg.dotColor }} />
                  {isOverdue && <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#fef2f2] text-[#dc2626]">Overdue</span>}
                  {!canEdit && <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#f3f4f6] text-[#9ca3af] flex items-center gap-1"><span className="material-symbols-outlined text-[12px]">lock</span>View only</span>}
                  {saving && <span className="text-[11px] text-[#9ca3af]">Saving...</span>}
                </div>
                <button
                  onClick={() => resolvedInitiativeId ? navigate(`/command-center?initiativeId=${resolvedInitiativeId}`) : navigate('/command-center')}
                  className="p-1.5 text-[#9ca3af] hover:text-[#4648d4] hover:bg-[#f0f0f0] rounded-lg transition-colors shrink-0"
                >
                  <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                </button>
              </div>

              {/* Editable title */}
              {editTitle ? (
                <input
                  autoFocus
                  value={titleVal}
                  onChange={(e) => setTitleVal(e.target.value)}
                  onBlur={async () => {
                    setEditTitle(false)
                    if (titleVal.trim() && titleVal !== action.title) await handleUpdate({ title: titleVal.trim() })
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  className="w-full text-[18px] font-bold text-[#111827] leading-snug tracking-tight focus:outline-none border-b-2 border-[#4648d4]/30 pb-1 bg-transparent mb-3"
                />
              ) : (
                <h1
                  onClick={() => { if (canEdit) { setTitleVal(action.title); setEditTitle(true) } }}
                  className={cn(
                    'text-[18px] font-bold text-[#111827] leading-snug tracking-tight mb-3 group flex items-center gap-2',
                    canEdit && 'cursor-text hover:opacity-75 transition-opacity',
                    action.status === 'completed' && 'line-through text-[#9ca3af]'
                  )}
                >
                  {action.title}
                  {canEdit && <span className="material-symbols-outlined text-[15px] text-[#d1d5db] opacity-0 group-hover:opacity-100 transition-opacity">edit</span>}
                </h1>
              )}

              {/* Editable description */}
              {editDesc ? (
                <textarea
                  autoFocus
                  value={descVal}
                  rows={4}
                  onChange={(e) => setDescVal(e.target.value)}
                  onBlur={async () => {
                    setEditDesc(false)
                    if (descVal !== (action.description || '')) await handleUpdate({ description: descVal || null })
                  }}
                  className="w-full text-[14px] text-[#374151] leading-relaxed focus:outline-none border border-[#e5e7eb] rounded-lg px-3 py-2 bg-[#fafafa] resize-none mb-3"
                />
              ) : (
                <div
                  onClick={() => { if (canEdit) { setDescVal(action.description || ''); setEditDesc(true) } }}
                  className={cn(
                    'text-[14px] leading-relaxed mb-4 group flex items-start gap-2',
                    canEdit && 'cursor-text hover:opacity-75 transition-opacity',
                    action.description ? 'text-[#6b7280]' : 'text-[#c4c4c4] italic'
                  )}
                >
                  <span className="flex-1">{action.description || (canEdit ? 'Add a description...' : <span className="text-[#e5e7eb]">No description</span>)}</span>
                  {canEdit && <span className="material-symbols-outlined text-[14px] text-[#d1d5db] opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5">edit</span>}
                </div>
              )}

              {/* Tags */}
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {tags.map((tag) => (
                    <span key={tag.id} className="px-2 py-0.5 rounded-full text-[11px] font-semibold text-white" style={{ backgroundColor: tag.color }}>
                      #{tag.name}
                    </span>
                  ))}
                </div>
              )}

              {/* Status selector */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mr-1">Status:</span>
                {Object.entries(STATUS_CONFIG).map(([s, cfg]) => (
                  <button key={s}
                    onClick={() => canEdit && handleUpdate({ status: s })}
                    disabled={!canEdit}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-[12px] font-semibold transition-all border',
                      action.status === s ? cfg.activeCls : 'bg-white text-[#9ca3af] border-[#e5e7eb]',
                      canEdit && action.status !== s && 'hover:border-[#4648d4]/30 hover:text-[#4648d4]',
                      !canEdit && 'cursor-default opacity-70'
                    )}
                  >
                    {cfg.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Updates / Comment Thread */}
            <div className="bg-white rounded-xl border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#f9fafb]">
                <h2 className="text-[14px] font-semibold text-[#111827]">Updates</h2>
                {updates.length > 0 && (
                  <span className="text-[11px] font-semibold text-[#6b7280] bg-[#f3f4f6] px-2 py-0.5 rounded-full">{updates.length}</span>
                )}
              </div>
              <div className="divide-y divide-[#fafafa]">
                {updates.length === 0 && (
                  <div className="px-4 py-6 text-center">
                    <p className="text-[13px] text-[#9ca3af]">No updates yet. Post the first update below.</p>
                  </div>
                )}
                {updates.map((upd) => (
                  <div key={upd.id} className="px-4 py-4 flex gap-3 group/upd">
                    <Avatar name={upd.user?.name} avatar={upd.user?.avatar} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-[14px] font-semibold text-[#111827]">{upd.user?.name}</span>
                        <span className="text-[12px] text-[#9ca3af]">{formatDistanceToNow(new Date(upd.createdAt), { addSuffix: true })}</span>
                        {upd.user?.id === user?.id && editingUpdateId !== upd.id && (
                          <button
                            onClick={() => { setEditingUpdateId(upd.id); setEditingUpdateContent(upd.content) }}
                            className="text-[11px] text-[#9ca3af] hover:text-[#4648d4] opacity-0 group-hover/upd:opacity-100 transition-all ml-1"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                      {editingUpdateId === upd.id ? (
                        <div>
                          <textarea
                            autoFocus
                            value={editingUpdateContent}
                            onChange={(e) => setEditingUpdateContent(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Escape') setEditingUpdateId(null) }}
                            rows={3}
                            className="w-full bg-white border border-[#e5e7eb] rounded-lg px-3 py-2 text-[14px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4648d4]/10 focus:border-[#4648d4] resize-none"
                          />
                          <div className="flex items-center gap-2 mt-1.5">
                            <button
                              onClick={() => handleSaveUpdateEdit(upd.id)}
                              disabled={savingUpdate || !editingUpdateContent.trim()}
                              className="px-3 py-1 bg-[#4648d4] text-white text-[12px] font-semibold rounded-lg hover:bg-[#3730a3] transition-colors disabled:opacity-40"
                            >
                              {savingUpdate ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              onClick={() => setEditingUpdateId(null)}
                              className="px-3 py-1 bg-[#f3f4f6] text-[#6b7280] text-[12px] font-semibold rounded-lg hover:bg-[#e5e7eb] transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[14px] text-[#374151] leading-relaxed whitespace-pre-wrap"><MentionContent content={upd.content} /></p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <form onSubmit={handlePostComment} className="px-4 py-4 border-t border-[#f3f4f6] bg-[#fafafa]">
                <div className="flex gap-3">
                  <Avatar name={user?.name} avatar={user?.avatar} size="sm" />
                  <div className="flex-1 relative">
                    <textarea
                      ref={commentRef}
                      placeholder="Post an update… type @ to mention someone"
                      value={comment}
                      onChange={handleCommentChange}
                      onKeyDown={handleCommentKeyDown}
                      rows={2}
                      className="w-full bg-white border border-[#e5e7eb] rounded-lg px-3 py-2.5 text-[14px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4648d4]/10 focus:border-[#4648d4] resize-none placeholder:text-[#c4c4c4] transition-all"
                    />
                    {/* Mention dropdown */}
                    {mentionQuery !== null && mentionMembers.length > 0 && (
                      <div ref={mentionBoxRef} className="absolute bottom-full left-0 mb-1 w-56 bg-white border border-[#e5e7eb] rounded-xl shadow-lg z-50 overflow-hidden">
                        {mentionMembers.map((m: any, i: number) => (
                          <button key={m.user.id} type="button"
                            onMouseDown={(e) => { e.preventDefault(); insertMention(m) }}
                            className={cn('w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors', i === mentionHighlight ? 'bg-[#ede9fe]' : 'hover:bg-[#fafafa]')}
                          >
                            <Avatar name={m.user.name} avatar={m.user.avatar} size="xs" />
                            <div className="min-w-0">
                              <p className="text-[13px] font-semibold text-[#111827] truncate">{m.user.name}</p>
                              <p className="text-[11px] text-[#9ca3af] truncate">{m.user.email}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-[11px] text-[#9ca3af]">⌘+Enter to submit · @ to mention</span>
                      <button type="submit" disabled={posting || !comment.trim()}
                        className="px-3.5 py-1.5 bg-[#4648d4] text-white text-[12px] font-semibold rounded-lg hover:bg-[#3730a3] transition-colors disabled:opacity-40"
                      >
                        {posting ? 'Posting...' : 'Post Update'}
                      </button>
                    </div>
                  </div>
                </div>
              </form>
            </div>
          </div>

          {/* RIGHT — Metadata (all editable) */}
          <div className="col-span-12 lg:col-span-4 space-y-3">
            {/* Details */}
            <div className="bg-white rounded-xl border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] p-4">
              <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-3.5">Details</p>
              <div className="space-y-1">

                {/* Priority — pill buttons */}
                <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid #f9fafb' }}>
                  <span className="text-[13px] text-[#6b7280]">Priority</span>
                  <div className="flex gap-1">
                    {(['low', 'medium', 'high', 'urgent'] as const).map((p) => (
                      <button key={p}
                        onClick={() => canEdit && handleUpdate({ priority: p })}
                        disabled={!canEdit}
                        className={cn('px-1.5 py-0.5 rounded text-[11px] font-semibold capitalize border transition-all', action.priority === p
                          ? p === 'urgent' ? 'bg-[#fef2f2] text-[#dc2626] border-[#fecaca]'
                            : p === 'high' ? 'bg-[#ede9fe] text-[#4648d4] border-[#c4b5fd]'
                            : p === 'medium' ? 'bg-[#eff6ff] text-[#2563eb] border-[#bfdbfe]'
                            : 'bg-[#f3f4f6] text-[#6b7280] border-[#e5e7eb]'
                          : canEdit ? 'bg-transparent text-[#9ca3af] border-transparent hover:border-[#e5e7eb] hover:text-[#6b7280]'
                          : 'bg-transparent text-[#d1d5db] border-transparent cursor-default'
                        )}
                      >{p}</button>
                    ))}
                  </div>
                </div>

                {/* Due Date */}
                <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid #f9fafb' }}>
                  <span className="text-[13px] text-[#6b7280]">Due Date</span>
                  <div className="flex items-center gap-1.5">
                    <div className="relative">
                      <span className={cn('text-[13px] font-medium', isOverdue ? 'text-[#dc2626]' : 'text-[#111827]', !canEdit && 'cursor-default')}>
                        {action.dueDate ? format(new Date(action.dueDate), 'MMM d, yyyy') : <span className={canEdit ? 'text-[#9ca3af] font-normal' : 'text-[#d1d5db] font-normal'}>No due date</span>}
                      </span>
                      {canEdit && (
                        <input
                          type="date"
                          value={action.dueDate ? action.dueDate.split('T')[0] : ''}
                          onChange={(e) => handleUpdate({ dueDate: e.target.value || null })}
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        />
                      )}
                    </div>
                    {action.dueDate && canEdit && (
                      <button onClick={() => handleUpdate({ dueDate: null })} className="text-[#9ca3af] hover:text-[#dc2626] text-[14px] leading-none">×</button>
                    )}
                  </div>
                </div>

                {/* Initiative — editable dropdown */}
                <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid #f9fafb' }}>
                  <span className="text-[13px] text-[#6b7280]">Initiative</span>
                  <div className="relative" ref={initiativeDropRef}>
                    <button
                      onClick={() => canEdit && setShowInitiativeDropdown((v) => !v)}
                      disabled={!canEdit}
                      className={cn('flex items-center gap-1 text-[13px] font-semibold text-[#4648d4] max-w-[150px] text-right truncate transition-opacity', canEdit && 'hover:opacity-70', !canEdit && 'cursor-default')}
                    >
                      <span className="truncate">{action.initiative?.title || <span className="text-[#9ca3af] font-normal">None</span>}</span>
                      <span className="material-symbols-outlined text-[13px] text-[#d1d5db] shrink-0">expand_more</span>
                    </button>
                    {showInitiativeDropdown && (
                      <div className="absolute top-full right-0 mt-1 bg-white border border-[#e5e7eb] rounded-xl shadow-xl z-50 min-w-[200px] py-1 overflow-hidden max-h-[240px] overflow-y-auto">
                        <button
                          onClick={() => { handleUpdate({ initiativeId: null }); setShowInitiativeDropdown(false) }}
                          className={cn('w-full flex items-center gap-2.5 px-3 py-2 text-[13px] hover:bg-[#f9fafb] transition-colors', !action.initiative ? 'text-[#4648d4] font-semibold' : 'text-[#9ca3af]')}
                        >
                          <div className="w-1.5 h-1.5 rounded-full border border-dashed border-[#d1d5db] shrink-0" />
                          No Initiative
                        </button>
                        {allInitiatives.map((ini: any) => (
                          <button
                            key={ini.id}
                            onClick={() => { handleUpdate({ initiativeId: ini.id }); setShowInitiativeDropdown(false) }}
                            className={cn('w-full flex items-center gap-2.5 px-3 py-2 text-[13px] hover:bg-[#f9fafb] transition-colors text-left', action.initiative?.id === ini.id ? 'bg-[#f5f3ff]' : '')}
                          >
                            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: ini.status === 'at-risk' ? '#dc2626' : '#4648d4' }} />
                            <span className={cn('flex-1 truncate', action.initiative?.id === ini.id ? 'text-[#4648d4] font-semibold' : 'text-[#374151]')}>{ini.title}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Created */}
                <div className="flex items-center justify-between py-2">
                  <span className="text-[13px] text-[#6b7280]">Created</span>
                  <span className="text-[13px] text-[#6b7280]">{format(new Date(action.createdAt), 'MMM d, yyyy')}</span>
                </div>
              </div>
            </div>

            {/* People */}
            <div className="bg-white rounded-xl border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] p-4">
              <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-3.5">People</p>
              <div className="space-y-1">
                {/* Assignee — clickable picker */}
                <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid #f9fafb' }}>
                  <span className="text-[13px] text-[#6b7280]">Assignee</span>
                  <div className="relative" ref={assigneeRef}>
                    <button
                      onClick={() => canEdit && setShowAssigneeDropdown((v) => !v)}
                      disabled={!canEdit}
                      className={cn('flex items-center gap-1.5 text-[13px] font-medium text-[#111827] transition-colors', canEdit && 'hover:text-[#4648d4]', !canEdit && 'cursor-default')}
                    >
                      {action.assignee ? (
                        <>
                          <Avatar name={action.assignee.name} avatar={action.assignee.avatar} size="xs" />
                          {action.assignee.name}
                        </>
                      ) : (
                        <span className="text-[#9ca3af]">Unassigned</span>
                      )}
                      <span className="material-symbols-outlined text-[14px] text-[#d1d5db]">expand_more</span>
                    </button>
                    {showAssigneeDropdown && (
                      <div className="absolute top-full right-0 mt-1 bg-white border border-[#e5e7eb] rounded-xl shadow-xl z-50 min-w-[180px] py-1 overflow-hidden">
                        <button onClick={() => { handleUpdate({ assigneeId: null }); setShowAssigneeDropdown(false) }}
                          className={cn('w-full flex items-center gap-2.5 px-3 py-2 text-[13px] hover:bg-[#f9fafb] transition-colors', !action.assignee ? 'text-[#4648d4] font-semibold' : 'text-[#9ca3af]')}
                        >
                          <div className="w-5 h-5 rounded-full border-2 border-dashed border-[#d1d5db] shrink-0" />
                          Unassigned
                        </button>
                        {allAssignees.map((a: any) => (
                          <button key={a.id} onClick={() => { handleUpdate({ assigneeId: a.id }); setShowAssigneeDropdown(false) }}
                            className={cn('w-full flex items-center gap-2.5 px-3 py-2 text-[13px] hover:bg-[#f9fafb] transition-colors', action.assignee?.id === a.id ? 'bg-[#f5f3ff]' : '')}
                          >
                            <Avatar name={a.name} avatar={a.avatar} size="xs" />
                            <span className={cn('flex-1 text-left', action.assignee?.id === a.id ? 'text-[#4648d4] font-semibold' : 'text-[#374151]')}>{a.name}</span>
                            {a.dept && <span className="text-[11px] text-[#9ca3af] shrink-0">{a.dept}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Owner (defaults to creator) */}
                <div className="flex items-center justify-between py-2">
                  <span className="text-[13px] text-[#6b7280]">Owner</span>
                  <div className="flex items-center gap-2">
                    <Avatar name={action.creator?.name} avatar={action.creator?.avatar} size="xs" />
                    <span className="text-[13px] font-medium text-[#111827]">{action.creator?.name}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick actions */}
            {canEdit && action.status !== 'completed' && (
              <div className="bg-white rounded-xl border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] p-4">
                <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-3">Quick Actions</p>
                <div className="space-y-1.5">
                  {action.status !== 'in-progress' && (
                    <button onClick={() => handleUpdate({ status: 'in-progress' })}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[#f9fafb] text-[13px] font-medium text-[#374151] transition-colors text-left border border-[#f0f0f0]"
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-[#4648d4]" />
                      Mark In Progress
                    </button>
                  )}
                  <button onClick={() => handleUpdate({ status: 'completed' })}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[#f0fdf4] text-[13px] font-semibold text-[#16a34a] transition-colors text-left"
                  >
                    <span className="material-symbols-outlined text-[15px]">check_circle</span>
                    Mark as Done
                  </button>
                </div>
              </div>
            )}

            {/* Delete — owner/admin or action creator */}
            {(isOwnerOrAdmin || action.createdBy === user?.id) && (
              <div className="bg-white rounded-xl border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] p-4">
                {confirmDelete ? (
                  <div className="space-y-2">
                    <p className="text-[12px] text-[#374151] font-medium">Delete this action? This cannot be undone.</p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="flex-1 py-2 bg-[#dc2626] text-white text-[12px] font-semibold rounded-lg hover:bg-[#b91c1c] transition-colors disabled:opacity-50"
                      >
                        {deleting ? 'Deleting...' : 'Yes, Delete'}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="flex-1 py-2 bg-[#f3f4f6] text-[#6b7280] text-[12px] font-semibold rounded-lg hover:bg-[#e5e7eb] transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[#fef2f2] text-[13px] font-medium text-[#9ca3af] hover:text-[#dc2626] transition-colors text-left"
                  >
                    <span className="material-symbols-outlined text-[15px]">delete</span>
                    Delete Action
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
