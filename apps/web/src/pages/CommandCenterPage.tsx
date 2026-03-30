import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { format, isBefore } from 'date-fns'
import AppLayout from '@/components/layout/AppLayout'
import { actionsApi } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'

type Filter = 'all' | 'overdue' | 'week' | 'mine'

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

const STATUS_BAR: Record<string, string> = {
  'todo': '#e5e7eb',
  'in-progress': '#4648d4',
  'in-review': '#2563eb',
  'completed': '#e5e7eb',
}
const PRIORITY_DOT: Record<string, string> = {
  urgent: '#dc2626', high: '#4648d4', medium: '#6b7280', low: '#d1d5db',
}
const STATUS_LABEL: Record<string, string> = {
  'todo': 'To Do', 'in-progress': 'In Progress', 'in-review': 'In Review', 'completed': 'Done',
}

const PRIORITY_CONFIG: Record<string, { label: string; cls: string }> = {
  low:    { label: 'Low',    cls: 'bg-[#f3f4f6] text-[#6b7280] border-[#e5e7eb]' },
  medium: { label: 'Medium', cls: 'bg-[#eff6ff] text-[#2563eb] border-[#bfdbfe]' },
  high:   { label: 'High',   cls: 'bg-[#ede9fe] text-[#4648d4] border-[#c4b5fd]' },
  urgent: { label: 'Urgent', cls: 'bg-[#fef2f2] text-[#dc2626] border-[#fecaca]' },
}

export default function CommandCenterPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const now = new Date()
  const [filter, setFilter] = useState<Filter>('all')
  const [ccCursor, setCcCursor] = useState<string | undefined>(undefined)
  const [extraActions, setExtraActions] = useState<any[]>([])
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [totalActions, setTotalActions] = useState(0)

  // Create Action pane state
  const [showCreate, setShowCreate] = useState(false)
  const [showAi, setShowAi] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)

  const dropdownRef = useRef<HTMLDivElement>(null)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newPriority, setNewPriority] = useState('medium')
  const [newDueDate, setNewDueDate] = useState('')
  const [creating, setCreating] = useState(false)
  const newDateRef = useRef<HTMLInputElement>(null)
  // AI pane state
  const [transcript, setTranscript] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generatedActions, setGeneratedActions] = useState<any[]>([])
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [bulkSaving, setBulkSaving] = useState(false)

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowDropdown(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const { data: ccData, isLoading } = useQuery({
    queryKey: ['command-center'],
    queryFn: () => actionsApi.getCommandCenter().then((r) => r.data),
    onSuccess: (data: any) => {
      setHasMore(data.meta?.hasMore ?? false)
      setCcCursor(data.meta?.nextCursor ?? undefined)
      setTotalActions(data.meta?.total ?? 0)
      setExtraActions([])
    },
  } as any)

  const allActions: any[] = [...((ccData as any)?.actions || []), ...extraActions]
  const overdueActions = allActions.filter((a) => a.dueDate && isBefore(new Date(a.dueDate), now) && a.status !== 'completed')
  const openActions = allActions.filter((a) => a.status !== 'completed')
  const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7)
  const weekActions = allActions.filter((a) => a.dueDate && new Date(a.dueDate) <= weekEnd && a.status !== 'completed')
  const mineActions = allActions.filter((a) => a.assigneeId === user?.id && a.status !== 'completed')

  const filtered = (() => {
    switch (filter) {
      case 'overdue': return overdueActions
      case 'week': return weekActions
      case 'mine': return mineActions
      default: return openActions
    }
  })()

  // Group by initiative (null initiative → "Standalone")
  const grouped: Record<string, { initiative: any; actions: any[] }> = {}
  filtered.forEach((action) => {
    const iid = action.initiative?.id || '__standalone__'
    if (!grouped[iid]) {
      grouped[iid] = {
        initiative: action.initiative || { id: '__standalone__', title: 'Standalone Actions', status: 'active' },
        actions: [],
      }
    }
    grouped[iid].actions.push(action)
  })
  const groups = Object.values(grouped)

  const handleLoadMore = async () => {
    if (!ccCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const res = await actionsApi.getCommandCenter(ccCursor)
      const { actions: more, meta } = (res.data as any)
      setExtraActions((prev) => [...prev, ...more])
      setHasMore(meta.hasMore)
      setCcCursor(meta.nextCursor)
    } catch {}
    finally { setLoadingMore(false) }
  }

  const updateAction = async (actionId: string, status: string) => {
    try {
      await actionsApi.update(actionId, { status })
      queryClient.invalidateQueries({ queryKey: ['command-center'] })
    } catch {}
  }

  const getActionPath = (action: any) =>
    action.initiativeId
      ? `/initiatives/${action.initiativeId}/actions/${action.id}`
      : `/actions/${action.id}`

  const resetPane = () => {
    setNewTitle(''); setNewDesc(''); setNewPriority('medium'); setNewDueDate('')
    setTranscript(''); setGeneratedActions([]); setEditingIdx(null)
    setShowCreate(false)
  }

  const handleCreateAction = async () => {
    if (!newTitle.trim()) return
    setCreating(true)
    try {
      await actionsApi.createStandalone({
        title: newTitle.trim(),
        description: newDesc.trim() || undefined,
        priority: newPriority,
        dueDate: newDueDate || null,
      })
      queryClient.invalidateQueries({ queryKey: ['command-center'] })
      resetPane()
    } finally { setCreating(false) }
  }

  const handleGenerate = async () => {
    if (!transcript.trim()) return
    setGenerating(true)
    try {
      const res = await actionsApi.generateStandalone(transcript)
      setGeneratedActions((res.data as any)?.actions || [])
    } finally { setGenerating(false) }
  }

  const handleBulkSave = async () => {
    if (!generatedActions.length) return
    setBulkSaving(true)
    try {
      await Promise.all(
        generatedActions.map((a) =>
          actionsApi.createStandalone({
            title: a.title,
            description: a.description || undefined,
            priority: a.priority || 'medium',
            dueDate: a.dueDate || null,
          })
        )
      )
      queryClient.invalidateQueries({ queryKey: ['command-center'] })
      resetPane()
    } finally { setBulkSaving(false) }
  }

  const filterConfig: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: 'All Open', count: openActions.length },
    { key: 'overdue', label: 'Overdue', count: overdueActions.length },
    { key: 'week', label: 'Due This Week', count: weekActions.length },
    { key: 'mine', label: 'Assigned to Me', count: mineActions.length },
  ]

  return (
    <AppLayout>
      <div className="min-h-screen p-3 md:p-3.5 max-w-[900px]">
        {/* Header */}
        <div className="mb-7">
          <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-1">
            {format(now, 'EEEE, MMMM d')}
          </p>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-[22px] font-bold text-[#111827] tracking-tight">
                {getGreeting()}, {user?.name?.split(' ')[0] || 'there'}.
              </h1>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-[14px] text-[#6b7280]">
                  {openActions.length} open action{openActions.length !== 1 ? 's' : ''}
                </span>
                {overdueActions.length > 0 && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-[#e5e7eb]" />
                    <span className="text-[14px] font-semibold text-[#dc2626]">
                      {overdueActions.length} overdue
                    </span>
                  </>
                )}
              </div>
            </div>
            <div ref={dropdownRef} className="relative flex shrink-0">
              <button
                onClick={() => setShowCreate(true)}
                className="px-3 py-2 bg-[#4648d4] text-white text-[13px] font-bold rounded-l-lg flex items-center gap-1.5 hover:bg-[#3730a3] transition-colors border-r border-[#3730a3]"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                Create Action
              </button>
              <button
                onClick={() => setShowDropdown((v) => !v)}
                className="px-1.5 py-2 bg-[#4648d4] text-white rounded-r-lg hover:bg-[#3730a3] transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">arrow_drop_down</span>
              </button>
              {showDropdown && (
                <div className="absolute top-full right-0 mt-1 w-52 bg-white rounded-xl shadow-xl border border-[#f0f0f0] z-50 overflow-hidden">
                  {[
                    { label: 'Generate with AI', icon: 'auto_awesome', action: () => { setShowDropdown(false); setShowAi(true) } },
                    { label: 'Upload from Sheets', icon: 'table_chart', action: () => { setShowDropdown(false); navigate('/upload?mode=sheets') } },
                    { label: 'Upload Transcript', icon: 'description', action: () => { setShowDropdown(false); navigate('/upload?mode=transcript') } },
                    { label: 'Live Transcript', icon: 'mic', action: () => { setShowDropdown(false); navigate('/upload?mode=live') } },
                  ].map(({ label, icon, action }) => (
                    <button key={label} onClick={action}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-medium text-[#374151] hover:bg-[#f7f9fb] hover:text-[#4648d4] text-left transition-colors"
                    >
                      <span className="material-symbols-outlined text-[18px] text-[#9ca3af]">{icon}</span>{label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 mb-6 overflow-x-auto pb-1">
          {filterConfig.map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all duration-150 shrink-0',
                filter === key
                  ? key === 'overdue'
                    ? 'bg-[#fef2f2] text-[#dc2626]'
                    : 'bg-[#ede9fe] text-[#4648d4]'
                  : 'bg-white border border-[#e5e7eb] text-[#6b7280] hover:border-[#4648d4]/30 hover:text-[#4648d4]'
              )}
            >
              {label}
              <span className="ml-1.5 opacity-60 tabular-nums">{count}</span>
            </button>
          ))}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-24">
            <div className="w-6 h-6 border-[3px] border-[#ede9fe] border-t-[#4648d4] rounded-full animate-spin" />
          </div>
        )}

        {/* Empty */}
        {!isLoading && groups.length === 0 && (
          <div className="bg-white rounded-xl border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] py-16 text-center">
            <span
              className="material-symbols-outlined text-[36px] text-[#e5e7eb] block mb-3"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              task_alt
            </span>
            <p className="text-[14px] font-medium text-[#9ca3af]">
              {filter === 'all' ? 'All caught up — no open actions.' : 'No actions match this filter.'}
            </p>
          </div>
        )}

        {/* Grouped Actions */}
        <div className="space-y-7">
          {groups.map(({ initiative, actions }) => {
            const isStandalone = initiative.id === '__standalone__'
            return (
              <section key={initiative.id}>
                {/* Initiative header */}
                <div
                  onClick={() => !isStandalone && navigate(`/initiatives/${initiative.id}`)}
                  className={cn('flex items-center gap-2 mb-2.5', !isStandalone && 'cursor-pointer group')}
                >
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: isStandalone ? '#9ca3af' : initiative.status === 'at-risk' ? '#dc2626' : initiative.status === 'completed' ? '#2563eb' : '#4648d4' }}
                  />
                  <span className={cn('text-[13px] font-semibold', isStandalone ? 'text-[#6b7280]' : 'text-[#4648d4] group-hover:underline')}>
                    {initiative.title}
                  </span>
                  {!isStandalone && initiative.status === 'at-risk' && (
                    <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-[#fef2f2] text-[#dc2626]">At Risk</span>
                  )}
                  <span className="text-[12px] text-[#d1d5db] ml-0.5">· {actions.length}</span>
                </div>

                {/* Action rows */}
                <div className="bg-white rounded-xl border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden divide-y divide-[#fafafa]">
                  {actions.map((action) => {
                    const isOD = action.dueDate && isBefore(new Date(action.dueDate), now) && action.status !== 'completed'
                    const isDueSoon = !isOD && action.dueDate && new Date(action.dueDate) <= weekEnd
                    const barColor = isOD ? '#dc2626' : isDueSoon ? '#2563eb' : STATUS_BAR[action.status] || '#e5e7eb'
                    const dotColor = PRIORITY_DOT[action.priority] || '#d1d5db'
                    const assigneeInitials = action.assignee?.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
                    const assigneeAvatar = action.assignee?.avatar
                    const actionTags: any[] = action.tags?.map((at: any) => at.tag) || []
                    const actionPath = getActionPath(action)

                    return (
                      <div
                        key={action.id}
                        className="group relative flex items-start gap-0 hover:bg-[#fafafa] transition-colors duration-100"
                      >
                        {/* Left status bar */}
                        <div
                          className="w-[3px] shrink-0 self-stretch rounded-l-xl"
                          style={{ backgroundColor: barColor }}
                        />

                        <div className="flex-1 flex items-start gap-3 px-4 py-2.5 min-w-0">
                          {/* Priority dot */}
                          <div
                            className="w-1.5 h-1.5 rounded-full shrink-0 mt-[5px]"
                            style={{ backgroundColor: dotColor }}
                          />

                          <div className="flex-1 min-w-0">
                            {/* Title row */}
                            <h4
                              onClick={() => navigate(actionPath)}
                              className="text-[14px] font-medium text-[#111827] truncate cursor-pointer group-hover:text-[#4648d4] transition-colors"
                            >
                              {action.title}
                            </h4>
                            {action.description && (
                              <p className="text-[12px] text-[#9ca3af] mt-0.5 line-clamp-1">{action.description}</p>
                            )}

                            {/* Tags */}
                            {actionTags.length > 0 && (
                              <div className="flex gap-1 mt-1.5 flex-wrap">
                                {actionTags.map((tag: any) => (
                                  <span
                                    key={tag.id}
                                    className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-[#f3f4f6] text-[#6b7280]"
                                  >
                                    #{tag.name}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Meta row: assignee + due date + status */}
                            <div className="flex items-center gap-3 mt-2 flex-wrap">
                              {/* Assignee */}
                              {action.assignee ? (
                                <div className="flex items-center gap-1.5">
                                  {assigneeAvatar ? (
                                    <img src={assigneeAvatar} alt={action.assignee.name} className="w-4 h-4 rounded-full object-cover shrink-0" />
                                  ) : (
                                    <div className="w-4 h-4 rounded-full bg-[#ede9fe] text-[#4648d4] text-[10px] font-bold flex items-center justify-center shrink-0">
                                      {assigneeInitials}
                                    </div>
                                  )}
                                  <span className="text-[12px] text-[#6b7280]">{action.assignee.name}</span>
                                </div>
                              ) : (
                                <span className="text-[12px] text-[#d1d5db]">Unassigned</span>
                              )}

                              {/* Due date */}
                              {isOD ? (
                                <span className="text-[12px] font-semibold text-[#dc2626]">
                                  {format(new Date(action.dueDate), 'MMM d')}
                                </span>
                              ) : action.dueDate ? (
                                <span className="text-[12px] text-[#9ca3af]">
                                  {format(new Date(action.dueDate), 'MMM d')}
                                </span>
                              ) : null}

                              {/* Status pill */}
                              <span className={cn(
                                'px-1.5 py-0.5 rounded-md text-[11px] font-semibold',
                                action.status === 'completed'  ? 'bg-[#f0fdf4] text-[#16a34a]'
                                : action.status === 'in-progress' ? 'bg-[#ede9fe] text-[#4648d4]'
                                : action.status === 'in-review'   ? 'bg-[#eff6ff] text-[#2563eb]'
                                : 'bg-[#f3f4f6] text-[#6b7280]'
                              )}>
                                {STATUS_LABEL[action.status] || action.status}
                              </span>
                            </div>

                            {/* Quick action buttons */}
                            <div className="flex items-center gap-1.5 mt-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); updateAction(action.id, 'in-progress') }}
                                className="px-2 py-1 text-[11px] font-semibold text-[#6b7280] hover:bg-[#f3f4f6] rounded-md transition-colors border border-[#e5e7eb] hover:border-[#d1d5db]"
                              >
                                In Progress
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); updateAction(action.id, 'completed') }}
                                className="px-2 py-1 text-[11px] font-semibold text-[#4648d4] hover:bg-[#ede9fe] rounded-md transition-colors"
                              >
                                ✓ Done
                              </button>
                              <button
                                onClick={() => navigate(actionPath)}
                                className="ml-auto text-[11px] font-medium text-[#9ca3af] hover:text-[#4648d4] transition-colors"
                              >
                                View →
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>

        {/* Load more */}
        {hasMore && filter === 'all' && (
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="w-full h-11 border border-[#e5e7eb] rounded-xl text-[#6b7280] text-[13px] font-semibold hover:border-[#4648d4]/40 hover:text-[#4648d4] hover:bg-[#f5f3ff]/30 transition-all flex items-center justify-center gap-2 bg-white disabled:opacity-50"
          >
            {loadingMore ? (
              <><div className="w-3.5 h-3.5 border-2 border-[#e5e7eb] border-t-[#4648d4] rounded-full animate-spin" /> Loading...</>
            ) : (
              <><span className="material-symbols-outlined text-[18px]">expand_more</span>
              Show more ({totalActions - allActions.length} remaining)</>
            )}
          </button>
        )}
      </div>

      {/* AI Generate pane */}
      {showAi && (
        <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(0,0,0,0.18)', backdropFilter: 'blur(2px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) { setShowAi(false); setTranscript(''); setGeneratedActions([]) } }}
        >
          <div className="bg-white w-full md:w-[440px] h-full shadow-2xl flex flex-col pt-14 md:pt-0" style={{ borderLeft: '1px solid #f0f0f0' }}>
            <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: '1px solid #f3f4f6' }}>
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-[#ede9fe] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#4648d4] text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold text-[#111827] leading-none">AI Generate Actions</h2>
                  <p className="text-[12px] text-[#9ca3af] mt-0.5">Command Center · Standalone</p>
                </div>
              </div>
              <button onClick={() => { setShowAi(false); setTranscript(''); setGeneratedActions([]) }}
                className="w-7 h-7 flex items-center justify-center text-[#9ca3af] hover:text-[#111827] hover:bg-[#f3f4f6] rounded-lg transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto flex flex-col">
              {generatedActions.length === 0 ? (
                <div className="p-4 flex flex-col gap-4 flex-1">
                  <textarea rows={14} placeholder="Paste your meeting transcript, notes, or voice recording text here…&#10;&#10;AI will extract action items, detect priorities and deadlines."
                    value={transcript} onChange={(e) => setTranscript(e.target.value)}
                    className="w-full flex-1 bg-[#f9fafb] border border-[#e5e7eb] rounded-xl px-4 py-3 text-[14px] text-[#111827] focus:ring-2 focus:ring-[#4648d4]/10 focus:border-[#4648d4] focus:outline-none resize-none placeholder:text-[#9ca3af] leading-relaxed"
                  />
                  <button onClick={handleGenerate} disabled={generating || !transcript.trim()}
                    className="w-full h-10 bg-[#4648d4] text-white font-semibold rounded-xl hover:bg-[#3730a3] transition-colors disabled:opacity-40 flex items-center justify-center gap-2 text-[14px]"
                  >
                    {generating
                      ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>Extracting actions…</span></>
                      : <><span className="material-symbols-outlined text-[18px]">auto_awesome</span><span>Generate Actions</span></>
                    }
                  </button>
                </div>
              ) : (
                <>
                  <div className="px-4 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <p className="text-[13px] font-semibold text-[#374151]">
                      <span className="text-[#4648d4]">{generatedActions.length}</span> actions extracted — review &amp; edit before saving
                    </p>
                    <button onClick={() => { setGeneratedActions([]); setEditingIdx(null) }} className="text-[12px] font-semibold text-[#9ca3af] hover:text-[#4648d4] transition-colors">Re-generate</button>
                  </div>
                  <div className="flex-1 overflow-y-auto divide-y divide-[#f9fafb]">
                    {generatedActions.map((action: any, i: number) => {
                      const isEditing = editingIdx === i
                      return (
                        <div key={i} className="px-4 py-4">
                          {isEditing ? (
                            <div className="space-y-3">
                              <input autoFocus value={action.title}
                                onChange={(e) => setGeneratedActions((acts) => acts.map((a, idx) => idx === i ? { ...a, title: e.target.value } : a))}
                                className="w-full text-[14px] font-semibold text-[#111827] focus:outline-none border-b border-[#4648d4]/30 pb-1 bg-transparent"
                              />
                              <textarea rows={2} value={action.description || ''}
                                onChange={(e) => setGeneratedActions((acts) => acts.map((a, idx) => idx === i ? { ...a, description: e.target.value } : a))}
                                placeholder="Description…"
                                className="w-full text-[13px] text-[#374151] focus:outline-none bg-[#f9fafb] border border-[#e5e7eb] rounded-lg px-3 py-2 resize-none placeholder:text-[#9ca3af]"
                              />
                              <div className="flex gap-1.5">
                                {(['low', 'medium', 'high', 'urgent'] as const).map((p) => (
                                  <button key={p} type="button"
                                    onClick={() => setGeneratedActions((acts) => acts.map((a, idx) => idx === i ? { ...a, priority: p } : a))}
                                    className={cn('px-2 py-0.5 rounded-md text-[12px] font-semibold capitalize border transition-all',
                                      action.priority === p ? PRIORITY_CONFIG[p].cls : 'bg-transparent text-[#9ca3af] border-[#f0f0f0] hover:border-[#e5e7eb]'
                                    )}
                                  >{p}</button>
                                ))}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[15px] text-[#9ca3af]">event</span>
                                <input type="date" value={action.dueDate ? action.dueDate.split('T')[0] : ''}
                                  onChange={(e) => setGeneratedActions((acts) => acts.map((a, idx) => idx === i ? { ...a, dueDate: e.target.value || null } : a))}
                                  className="h-8 px-2 bg-white border border-[#e5e7eb] rounded-lg text-[13px] text-[#374151] focus:outline-none focus:border-[#4648d4]"
                                />
                              </div>
                              <button type="button" onClick={() => setEditingIdx(null)} className="text-[12px] font-semibold text-[#4648d4] hover:text-[#3730a3]">Done editing</button>
                            </div>
                          ) : (
                            <div className="flex items-start gap-3 group cursor-pointer" onClick={() => setEditingIdx(i)}>
                              <div className={cn('w-1.5 h-1.5 rounded-full mt-1.5 shrink-0',
                                action.priority === 'urgent' ? 'bg-[#dc2626]' : action.priority === 'high' ? 'bg-[#4648d4]' : action.priority === 'medium' ? 'bg-[#2563eb]' : 'bg-[#d1d5db]'
                              )} />
                              <div className="flex-1 min-w-0">
                                <p className="text-[14px] font-semibold text-[#111827] leading-snug">{action.title}</p>
                                {action.description && <p className="text-[12px] text-[#9ca3af] mt-0.5 line-clamp-2">{action.description}</p>}
                                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                  {action.dueDate && <span className="text-[12px] text-[#9ca3af]">{format(new Date(action.dueDate), 'MMM d')}</span>}
                                  {action.tags?.length > 0 && action.tags.map((tag: string, ti: number) => (
                                    <span key={ti} className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-[#f3f4f6] text-[#6b7280]">#{tag}</span>
                                  ))}
                                </div>
                              </div>
                              <span className="material-symbols-outlined text-[15px] text-[#d1d5db] group-hover:text-[#9ca3af] transition-colors shrink-0">edit</span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <div className="px-4 py-4 flex gap-2.5" style={{ borderTop: '1px solid #f3f4f6' }}>
                    <button onClick={handleBulkSave} disabled={bulkSaving}
                      className="flex-1 h-9 bg-[#4648d4] text-white text-[13px] font-semibold rounded-lg hover:bg-[#3730a3] transition-colors disabled:opacity-40"
                    >
                      {bulkSaving ? 'Saving…' : `Save All ${generatedActions.length} Actions`}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Action slide-in pane */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(0,0,0,0.18)', backdropFilter: 'blur(2px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) resetPane() }}
        >
          <div className="bg-white w-full md:w-[440px] h-full shadow-2xl flex flex-col pt-14 md:pt-0" style={{ borderLeft: '1px solid #f0f0f0' }}>
            <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: '1px solid #f3f4f6' }}>
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-[#ede9fe] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#4648d4] text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>add_task</span>
                </div>
                <h2 className="text-[15px] font-semibold text-[#111827]">New Action</h2>
              </div>
              <button onClick={resetPane} className="w-7 h-7 flex items-center justify-center text-[#9ca3af] hover:text-[#111827] hover:bg-[#f3f4f6] rounded-lg transition-colors">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3.5 space-y-5">
              <input autoFocus placeholder="Action title"
                value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateAction() }}
                className="w-full text-[17px] font-bold text-[#111827] placeholder:text-[#d1d5db] placeholder:font-normal focus:outline-none border-none bg-transparent"
              />
              <textarea placeholder="Add a description (optional)..."
                value={newDesc} onChange={(e) => setNewDesc(e.target.value)} rows={3}
                className="w-full text-[14px] text-[#374151] placeholder:text-[#c4c4c4] focus:outline-none bg-transparent resize-none"
              />
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[18px] text-[#9ca3af]">flag</span>
                <span className="text-[13px] text-[#6b7280] w-20 shrink-0">Priority</span>
                <div className="flex gap-1.5 flex-wrap">
                  {(['low', 'medium', 'high', 'urgent'] as const).map((p) => (
                    <button key={p} onClick={() => setNewPriority(p)}
                      className={cn('px-2.5 py-1 rounded-lg text-[12px] font-semibold capitalize border transition-all',
                        newPriority === p ? PRIORITY_CONFIG[p].cls : 'bg-transparent text-[#9ca3af] border-[#e5e7eb] hover:text-[#6b7280]'
                      )}
                    >{p}</button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[18px] text-[#9ca3af]">calendar_today</span>
                <span className="text-[13px] text-[#6b7280] w-20 shrink-0">Due Date</span>
                <button onClick={() => newDateRef.current?.showPicker?.()}
                  className="text-[13px] font-medium text-[#111827] hover:text-[#4648d4] transition-colors"
                >
                  {newDueDate ? format(new Date(newDueDate), 'MMM d, yyyy') : <span className="text-[#9ca3af] font-normal">Pick a date</span>}
                </button>
                {newDueDate && <button onClick={() => setNewDueDate('')} className="text-[#9ca3af] hover:text-[#dc2626] text-[15px] leading-none">×</button>}
                <input ref={newDateRef} type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} className="sr-only" />
              </div>
              <p className="text-[12px] text-[#9ca3af] bg-[#f9fafb] rounded-lg px-3 py-2">
                This action will appear in your Command Center. You can link it to an initiative later from the action detail page.
              </p>
            </div>
            <div className="px-4 py-4 flex gap-3" style={{ borderTop: '1px solid #f0f0f0' }}>
              <button onClick={resetPane} className="flex-1 px-4 py-2.5 border border-[#e5e7eb] text-[14px] font-semibold text-[#6b7280] rounded-xl hover:bg-[#f9fafb] transition-colors">Cancel</button>
              <button onClick={handleCreateAction} disabled={!newTitle.trim() || creating}
                className="flex-1 px-4 py-2.5 bg-[#4648d4] text-white text-[14px] font-semibold rounded-xl hover:bg-[#3730a3] transition-colors disabled:opacity-40"
              >
                {creating ? 'Creating…' : 'Create Action'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
