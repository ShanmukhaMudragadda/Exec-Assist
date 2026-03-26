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

function Avatar({ name, avatar, size = 'sm' }: { name?: string; avatar?: string | null; size?: 'xs' | 'sm' | 'md' }) {
  const sizeMap = { xs: 'w-5 h-5 text-[8px]', sm: 'w-7 h-7 text-[10px]', md: 'w-9 h-9 text-[12px]' }
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
  const dueDateRef = useRef<HTMLInputElement>(null)
  const [comment, setComment] = useState('')
  const [posting, setPosting] = useState(false)
  const [saving, setSaving] = useState(false)
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
      resolvedInitiativeId ? navigate(`/initiatives/${resolvedInitiativeId}`) : navigate('/command-center')
    } finally { setDeleting(false) }
  }

  const handleUpdate = async (patch: Record<string, any>) => {
    if (!actionId) return
    setSaving(true)
    try {
      await actionsApi.update(actionId, patch)
      queryClient.invalidateQueries({ queryKey: ['action', actionId] })
      queryClient.invalidateQueries({ queryKey: ['initiative', resolvedInitiativeId] })
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
          <p className="text-[#6b7280] text-[13px]">Action not found.</p>
        </div>
      </AppLayout>
    )
  }

  const tags: { id: string; name: string; color: string }[] = action.tags?.map((at: any) => at.tag) || []
  const updates: any[] = action.updates || []
  const statusCfg = STATUS_CONFIG[action.status] || STATUS_CONFIG['todo']

  // All assignable people
  const allAssignees = initiative ? [
    { id: initiative.creator.id, name: initiative.creator.name, avatar: initiative.creator.avatar || null, role: 'owner', dept: '' },
    ...members.filter((m: any) => m.userId !== initiative.creator.id).map((m: any) => ({
      id: m.userId, name: m.user?.name, avatar: m.user?.avatar || null, role: m.role, dept: m.department || '',
    })),
  ] : action.assignee ? [{ id: action.assignee.id, name: action.assignee.name, avatar: action.assignee.avatar, role: '', dept: '' }] : []

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#f9fafb] p-4 md:p-7">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-[11px] text-[#9ca3af] mb-6 overflow-x-auto whitespace-nowrap">
          {resolvedInitiativeId ? (
            <>
              <button onClick={() => navigate('/initiatives')} className="hover:text-[#4648d4] transition-colors">
                Initiatives
              </button>
              <span className="text-[#e5e7eb]">/</span>
              <Link to={`/initiatives/${resolvedInitiativeId}`} className="hover:text-[#4648d4] transition-colors truncate max-w-[180px]">
                {action.initiative?.title || 'Initiative'}
              </Link>
            </>
          ) : (
            <button onClick={() => navigate('/command-center')} className="hover:text-[#4648d4] transition-colors">
              Command Center
            </button>
          )}
          <span className="text-[#e5e7eb]">/</span>
          <span className="text-[#374151] font-medium truncate max-w-[200px]">{action.title}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-5xl">
          {/* LEFT */}
          <div className="col-span-12 lg:col-span-8 space-y-4">
            {/* Title + Description card */}
            <div className="bg-white rounded-xl border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: statusCfg.dotColor }} />
                  {isOverdue && <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#fef2f2] text-[#dc2626]">Overdue</span>}
                  {saving && <span className="text-[10px] text-[#9ca3af]">Saving...</span>}
                </div>
                <button
                  onClick={() => resolvedInitiativeId ? navigate(`/initiatives/${resolvedInitiativeId}`) : navigate('/command-center')}
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
                  onClick={() => { setTitleVal(action.title); setEditTitle(true) }}
                  className={cn(
                    'text-[18px] font-bold text-[#111827] leading-snug tracking-tight cursor-text hover:opacity-75 transition-opacity mb-3 group flex items-center gap-2',
                    action.status === 'completed' && 'line-through text-[#9ca3af]'
                  )}
                >
                  {action.title}
                  <span className="material-symbols-outlined text-[14px] text-[#d1d5db] opacity-0 group-hover:opacity-100 transition-opacity">edit</span>
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
                  className="w-full text-[13px] text-[#374151] leading-relaxed focus:outline-none border border-[#e5e7eb] rounded-lg px-3 py-2 bg-[#fafafa] resize-none mb-3"
                />
              ) : (
                <div
                  onClick={() => { setDescVal(action.description || ''); setEditDesc(true) }}
                  className={cn(
                    'text-[13px] leading-relaxed mb-4 cursor-text hover:opacity-75 transition-opacity group flex items-start gap-2',
                    action.description ? 'text-[#6b7280]' : 'text-[#c4c4c4] italic'
                  )}
                >
                  <span className="flex-1">{action.description || 'Add a description...'}</span>
                  <span className="material-symbols-outlined text-[13px] text-[#d1d5db] opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5">edit</span>
                </div>
              )}

              {/* Tags */}
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {tags.map((tag) => (
                    <span key={tag.id} className="px-2 py-0.5 rounded-full text-[10px] font-semibold text-white" style={{ backgroundColor: tag.color }}>
                      #{tag.name}
                    </span>
                  ))}
                </div>
              )}

              {/* Status selector */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-widest mr-1">Status:</span>
                {Object.entries(STATUS_CONFIG).map(([s, cfg]) => (
                  <button key={s} onClick={() => handleUpdate({ status: s })}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all border',
                      action.status === s ? cfg.activeCls : 'bg-white text-[#9ca3af] border-[#e5e7eb] hover:border-[#4648d4]/30 hover:text-[#4648d4]'
                    )}
                  >
                    {cfg.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Updates / Comment Thread */}
            <div className="bg-white rounded-xl border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3.5 border-b border-[#f9fafb]">
                <h2 className="text-[13px] font-semibold text-[#111827]">Updates</h2>
                {updates.length > 0 && (
                  <span className="text-[10px] font-semibold text-[#6b7280] bg-[#f3f4f6] px-2 py-0.5 rounded-full">{updates.length}</span>
                )}
              </div>
              <div className="divide-y divide-[#fafafa]">
                {updates.length === 0 && (
                  <div className="px-5 py-10 text-center">
                    <p className="text-[12px] text-[#9ca3af]">No updates yet. Post the first update below.</p>
                  </div>
                )}
                {updates.map((upd) => (
                  <div key={upd.id} className="px-5 py-4 flex gap-3">
                    <Avatar name={upd.user?.name} avatar={upd.user?.avatar} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-[13px] font-semibold text-[#111827]">{upd.user?.name}</span>
                        <span className="text-[11px] text-[#9ca3af]">{formatDistanceToNow(new Date(upd.createdAt), { addSuffix: true })}</span>
                      </div>
                      <p className="text-[13px] text-[#374151] leading-relaxed whitespace-pre-wrap">{upd.content}</p>
                    </div>
                  </div>
                ))}
              </div>
              <form onSubmit={handlePostComment} className="px-5 py-4 border-t border-[#f3f4f6] bg-[#fafafa]">
                <div className="flex gap-3">
                  <Avatar name={user?.name} avatar={user?.avatar} size="sm" />
                  <div className="flex-1">
                    <textarea
                      ref={commentRef}
                      placeholder="Post an update or share progress..."
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handlePostComment(e as any) }}
                      rows={2}
                      className="w-full bg-white border border-[#e5e7eb] rounded-lg px-3 py-2.5 text-[13px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4648d4]/10 focus:border-[#4648d4] resize-none placeholder:text-[#c4c4c4] transition-all"
                    />
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-[10px] text-[#9ca3af]">⌘+Enter to submit</span>
                      <button type="submit" disabled={posting || !comment.trim()}
                        className="px-3.5 py-1.5 bg-[#4648d4] text-white text-[11px] font-semibold rounded-lg hover:bg-[#3730a3] transition-colors disabled:opacity-40"
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
              <p className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-3.5">Details</p>
              <div className="space-y-1">

                {/* Priority — pill buttons */}
                <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid #f9fafb' }}>
                  <span className="text-[12px] text-[#6b7280]">Priority</span>
                  <div className="flex gap-1">
                    {(['low', 'medium', 'high', 'urgent'] as const).map((p) => (
                      <button key={p} onClick={() => handleUpdate({ priority: p })}
                        className={cn('px-1.5 py-0.5 rounded text-[10px] font-semibold capitalize border transition-all', action.priority === p
                          ? p === 'urgent' ? 'bg-[#fef2f2] text-[#dc2626] border-[#fecaca]'
                            : p === 'high' ? 'bg-[#ede9fe] text-[#4648d4] border-[#c4b5fd]'
                            : p === 'medium' ? 'bg-[#eff6ff] text-[#2563eb] border-[#bfdbfe]'
                            : 'bg-[#f3f4f6] text-[#6b7280] border-[#e5e7eb]'
                          : 'bg-transparent text-[#9ca3af] border-transparent hover:border-[#e5e7eb] hover:text-[#6b7280]'
                        )}
                      >{p}</button>
                    ))}
                  </div>
                </div>

                {/* Due Date */}
                <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid #f9fafb' }}>
                  <span className="text-[12px] text-[#6b7280]">Due Date</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => dueDateRef.current?.showPicker?.()}
                      className={cn('text-[12px] font-medium hover:text-[#4648d4] transition-colors', isOverdue ? 'text-[#dc2626]' : 'text-[#111827]')}
                    >
                      {action.dueDate ? format(new Date(action.dueDate), 'MMM d, yyyy') : <span className="text-[#9ca3af] font-normal">Set date</span>}
                    </button>
                    {action.dueDate && (
                      <button onClick={() => handleUpdate({ dueDate: null })} className="text-[#9ca3af] hover:text-[#dc2626] text-[13px] leading-none">×</button>
                    )}
                    <input ref={dueDateRef} type="date"
                      value={action.dueDate ? action.dueDate.split('T')[0] : ''}
                      onChange={(e) => handleUpdate({ dueDate: e.target.value || null })}
                      className="sr-only"
                    />
                  </div>
                </div>

                {/* Initiative — editable dropdown */}
                <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid #f9fafb' }}>
                  <span className="text-[12px] text-[#6b7280]">Initiative</span>
                  <div className="relative" ref={initiativeDropRef}>
                    <button
                      onClick={() => setShowInitiativeDropdown((v) => !v)}
                      className="flex items-center gap-1 text-[12px] font-semibold text-[#4648d4] hover:opacity-70 max-w-[150px] text-right truncate transition-opacity"
                    >
                      <span className="truncate">{action.initiative?.title || <span className="text-[#9ca3af] font-normal">None</span>}</span>
                      <span className="material-symbols-outlined text-[12px] text-[#d1d5db] shrink-0">expand_more</span>
                    </button>
                    {showInitiativeDropdown && (
                      <div className="absolute top-full right-0 mt-1 bg-white border border-[#e5e7eb] rounded-xl shadow-xl z-50 min-w-[200px] py-1 overflow-hidden max-h-[240px] overflow-y-auto">
                        <button
                          onClick={() => { handleUpdate({ initiativeId: null }); setShowInitiativeDropdown(false) }}
                          className={cn('w-full flex items-center gap-2.5 px-3 py-2 text-[12px] hover:bg-[#f9fafb] transition-colors', !action.initiative ? 'text-[#4648d4] font-semibold' : 'text-[#9ca3af]')}
                        >
                          <div className="w-1.5 h-1.5 rounded-full border border-dashed border-[#d1d5db] shrink-0" />
                          No Initiative
                        </button>
                        {allInitiatives.map((ini: any) => (
                          <button
                            key={ini.id}
                            onClick={() => { handleUpdate({ initiativeId: ini.id }); setShowInitiativeDropdown(false) }}
                            className={cn('w-full flex items-center gap-2.5 px-3 py-2 text-[12px] hover:bg-[#f9fafb] transition-colors text-left', action.initiative?.id === ini.id ? 'bg-[#f5f3ff]' : '')}
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
                  <span className="text-[12px] text-[#6b7280]">Created</span>
                  <span className="text-[12px] text-[#6b7280]">{format(new Date(action.createdAt), 'MMM d, yyyy')}</span>
                </div>
              </div>
            </div>

            {/* People */}
            <div className="bg-white rounded-xl border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] p-4">
              <p className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-3.5">People</p>
              <div className="space-y-1">
                {/* Assignee — clickable picker */}
                <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid #f9fafb' }}>
                  <span className="text-[12px] text-[#6b7280]">Assignee</span>
                  <div className="relative" ref={assigneeRef}>
                    <button onClick={() => setShowAssigneeDropdown((v) => !v)}
                      className="flex items-center gap-1.5 text-[12px] font-medium text-[#111827] hover:text-[#4648d4] transition-colors"
                    >
                      {action.assignee ? (
                        <>
                          <Avatar name={action.assignee.name} avatar={action.assignee.avatar} size="xs" />
                          {action.assignee.name}
                        </>
                      ) : (
                        <span className="text-[#9ca3af]">Unassigned</span>
                      )}
                      <span className="material-symbols-outlined text-[13px] text-[#d1d5db]">expand_more</span>
                    </button>
                    {showAssigneeDropdown && (
                      <div className="absolute top-full right-0 mt-1 bg-white border border-[#e5e7eb] rounded-xl shadow-xl z-50 min-w-[180px] py-1 overflow-hidden">
                        <button onClick={() => { handleUpdate({ assigneeId: null }); setShowAssigneeDropdown(false) }}
                          className={cn('w-full flex items-center gap-2.5 px-3 py-2 text-[12px] hover:bg-[#f9fafb] transition-colors', !action.assignee ? 'text-[#4648d4] font-semibold' : 'text-[#9ca3af]')}
                        >
                          <div className="w-5 h-5 rounded-full border-2 border-dashed border-[#d1d5db] shrink-0" />
                          Unassigned
                        </button>
                        {allAssignees.map((a: any) => (
                          <button key={a.id} onClick={() => { handleUpdate({ assigneeId: a.id }); setShowAssigneeDropdown(false) }}
                            className={cn('w-full flex items-center gap-2.5 px-3 py-2 text-[12px] hover:bg-[#f9fafb] transition-colors', action.assignee?.id === a.id ? 'bg-[#f5f3ff]' : '')}
                          >
                            <Avatar name={a.name} avatar={a.avatar} size="xs" />
                            <span className={cn('flex-1 text-left', action.assignee?.id === a.id ? 'text-[#4648d4] font-semibold' : 'text-[#374151]')}>{a.name}</span>
                            {a.dept && <span className="text-[10px] text-[#9ca3af] shrink-0">{a.dept}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Creator */}
                <div className="flex items-center justify-between py-2">
                  <span className="text-[12px] text-[#6b7280]">Created by</span>
                  <div className="flex items-center gap-2">
                    <Avatar name={action.creator?.name} avatar={action.creator?.avatar} size="xs" />
                    <span className="text-[12px] font-medium text-[#111827]">{action.creator?.name}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick actions */}
            {action.status !== 'completed' && (
              <div className="bg-white rounded-xl border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] p-4">
                <p className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-3">Quick Actions</p>
                <div className="space-y-1.5">
                  {action.status !== 'in-progress' && (
                    <button onClick={() => handleUpdate({ status: 'in-progress' })}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[#f9fafb] text-[12px] font-medium text-[#374151] transition-colors text-left border border-[#f0f0f0]"
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-[#4648d4]" />
                      Mark In Progress
                    </button>
                  )}
                  <button onClick={() => handleUpdate({ status: 'completed' })}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[#f0fdf4] text-[12px] font-semibold text-[#16a34a] transition-colors text-left"
                  >
                    <span className="material-symbols-outlined text-[14px]">check_circle</span>
                    Mark as Done
                  </button>
                </div>
              </div>
            )}

            {/* Delete — owner only */}
            {(initiative ? user?.id === initiative.creator?.id : user?.id === action.createdBy) && (
              <div className="bg-white rounded-xl border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] p-4">
                {confirmDelete ? (
                  <div className="space-y-2">
                    <p className="text-[11px] text-[#374151] font-medium">Delete this action? This cannot be undone.</p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="flex-1 py-2 bg-[#dc2626] text-white text-[11px] font-semibold rounded-lg hover:bg-[#b91c1c] transition-colors disabled:opacity-50"
                      >
                        {deleting ? 'Deleting...' : 'Yes, Delete'}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="flex-1 py-2 bg-[#f3f4f6] text-[#6b7280] text-[11px] font-semibold rounded-lg hover:bg-[#e5e7eb] transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[#fef2f2] text-[12px] font-medium text-[#9ca3af] hover:text-[#dc2626] transition-colors text-left"
                  >
                    <span className="material-symbols-outlined text-[14px]">delete</span>
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
