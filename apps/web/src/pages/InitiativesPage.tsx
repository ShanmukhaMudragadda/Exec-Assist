import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { format, isBefore, differenceInDays } from 'date-fns'
import AppLayout from '@/components/layout/AppLayout'
import { initiativesApi } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'

interface Initiative {
  id: string; title: string; description?: string | null; status: string; priority: string
  progress: number; dueDate?: string | null; actionCount?: number
  actions?: { id: string; title: string; status: string; priority: string; dueDate?: string | null; assignee?: { id: string; name: string; avatar?: string | null } | null; creator?: { id: string; name: string; avatar?: string | null } | null }[]
  creator: { id: string; name: string }
  members?: { userId: string; user: { id: string; name: string } }[]
}

const STATUS_DOT: Record<string, string> = {
  active: '#4648d4', completed: '#2563eb', paused: '#d1d5db', 'at-risk': '#dc2626',
}
const STATUS_LABEL: Record<string, string> = {
  active: 'Active', completed: 'Completed', paused: 'Paused', 'at-risk': 'At Risk',
}
const STATUS_PILL: Record<string, string> = {
  active: 'bg-[#ede9fe] text-[#4648d4]',
  completed: 'bg-[#eff6ff] text-[#2563eb]',
  paused: 'bg-[#f3f4f6] text-[#6b7280]',
  'at-risk': 'bg-[#fef2f2] text-[#dc2626]',
}
const PRIORITY_LABEL: Record<string, string> = {
  urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low',
}

function ProgressBar({ pct, color = '#4648d4' }: { pct: number; color?: string }) {
  return (
    <div className="h-[3px] bg-[#f3f4f6] rounded-full overflow-hidden flex-1">
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }} />
    </div>
  )
}

export default function InitiativesPage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', dueDate: '', status: 'active' })
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const { data, isLoading } = useQuery({
    queryKey: ['initiatives'],
    queryFn: () => initiativesApi.list().then((r) => r.data),
  })
  const initiatives: Initiative[] = (data as any)?.initiatives || []
  const now = new Date()
  const atRiskCount = initiatives.filter((i) => i.status === 'at-risk').length

  const filtered = initiatives.filter((i) => {
    const matchSearch = !search || i.title.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || i.status === statusFilter
    return matchSearch && matchStatus
  })

  const handleDeleteInitiative = async (id: string) => {
    setDeleting(true)
    try {
      await initiativesApi.delete(id)
      queryClient.invalidateQueries({ queryKey: ['initiatives'] })
      setConfirmDeleteId(null)
    } finally { setDeleting(false) }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    try {
      await initiativesApi.create({ ...form, dueDate: form.dueDate || null })
      queryClient.invalidateQueries({ queryKey: ['initiatives'] })
      setShowCreate(false)
      setForm({ title: '', description: '', priority: 'medium', dueDate: '', status: 'active' })
    } finally { setSaving(false) }
  }

  const tabs = [
    { key: 'all', label: 'All', count: initiatives.length },
    { key: 'active', label: 'Active', count: initiatives.filter((i) => i.status === 'active').length },
    { key: 'at-risk', label: 'At Risk', count: atRiskCount },
    { key: 'paused', label: 'Paused', count: initiatives.filter((i) => i.status === 'paused').length },
    { key: 'completed', label: 'Completed', count: initiatives.filter((i) => i.status === 'completed').length },
  ]

  return (
    <AppLayout>
      <div className="min-h-screen p-3 md:p-3.5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-[22px] font-bold text-[#111827] tracking-tight">Initiatives</h1>
            <span className="text-[14px] font-medium text-[#9ca3af] tabular-nums">{initiatives.length}</span>
            {atRiskCount > 0 && (
              <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-[#fef2f2] text-[#dc2626]">
                {atRiskCount} at risk
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:flex-none">
              <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af] text-[16px]">search</span>
              <input
                className="pl-8 pr-3 py-2 bg-white border border-[#e5e7eb] rounded-lg text-[13px] w-full sm:w-44 focus:outline-none focus:ring-2 focus:ring-[#4648d4]/10 focus:border-[#4648d4] transition-all placeholder:text-[#c4c4c4]"
                placeholder="Search initiatives..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="bg-[#4648d4] hover:bg-[#3730a3] active:bg-[#312e81] text-white px-3.5 py-2.5 rounded-lg font-semibold text-[13px] flex items-center gap-1.5 transition-colors duration-150 shrink-0 min-h-[44px]"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              New Initiative
            </button>
          </div>
        </div>

        {/* Status Tabs */}
        <div className="flex items-center gap-1 mb-5 border-b border-[#f3f4f6] pb-0">
          {tabs.map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={cn(
                'px-3.5 py-2 text-[13px] font-medium transition-all duration-150 relative',
                statusFilter === key
                  ? key === 'at-risk'
                    ? 'text-[#dc2626]'
                    : 'text-[#4648d4]'
                  : 'text-[#6b7280] hover:text-[#111827]'
              )}
            >
              {label}
              {count > 0 && (
                <span className="ml-1.5 text-[12px] opacity-60 tabular-nums">{count}</span>
              )}
              {statusFilter === key && (
                <div
                  className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t"
                  style={{ backgroundColor: key === 'at-risk' ? '#dc2626' : '#4648d4' }}
                />
              )}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
          {/* Initiative List */}
          <div className="col-span-12 lg:col-span-8">
            {isLoading ? (
              <div className="flex items-center justify-center py-24">
                <div className="w-6 h-6 border-[3px] border-[#ede9fe] border-t-[#4648d4] rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="bg-white rounded-xl border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] py-16 text-center">
                <span
                  className="material-symbols-outlined text-[40px] text-[#e5e7eb] block mb-3"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  rocket_launch
                </span>
                <p className="text-[14px] font-medium text-[#9ca3af]">
                  {search ? 'No results found' : 'No initiatives yet'}
                </p>
                {!search && (
                  <button
                    onClick={() => setShowCreate(true)}
                    className="mt-4 text-[13px] font-semibold text-[#4648d4] hover:opacity-70 transition-opacity"
                  >
                    Create your first initiative →
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((init) => {
                  const isRisk = init.status === 'at-risk'
                  const isOverdue = init.dueDate && isBefore(new Date(init.dueDate), now) && init.status !== 'completed'
                  const daysLeft = init.dueDate ? differenceInDays(new Date(init.dueDate), now) : null
                  const totalA = init.actions?.length || init.actionCount || 0
                  const doneA = init.actions?.filter((a) => a.status === 'completed').length || 0
                  const openCount = totalA - doneA
                  const openA = (init.actions || []).filter((a) => a.status !== 'completed').slice(0, 3)
                  const barColor = isRisk ? '#dc2626' : init.status === 'completed' ? '#2563eb' : '#4648d4'
                  const dotColor = STATUS_DOT[init.status] || '#4648d4'

                  return (
                    <div
                      key={init.id}
                      onClick={() => navigate(`/initiatives/${init.id}`)}
                      className="bg-white rounded-xl border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] p-4 hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] cursor-pointer group transition-all duration-150"
                    >
                      {/* Row 1: Status dot + Title + Pills + Progress */}
                      <div className="flex items-start gap-3">
                        <div className="mt-[3px] shrink-0">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: dotColor }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                              <h3 className="text-[14px] font-semibold text-[#111827] group-hover:text-[#4648d4] transition-colors truncate">
                                {init.title}
                              </h3>
                              <span className={cn('px-2 py-0.5 text-[11px] font-semibold rounded-full shrink-0', STATUS_PILL[init.status] || STATUS_PILL.active)}>
                                {STATUS_LABEL[init.status] || init.status}
                              </span>
                              {isOverdue && (
                                <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-[#fef2f2] text-[#dc2626] shrink-0">Overdue</span>
                              )}
                            </div>
                            <div className="flex items-start gap-2 shrink-0">
                              {user?.id === init.creator.id && (
                                confirmDeleteId === init.id ? (
                                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                    <button
                                      onClick={() => handleDeleteInitiative(init.id)}
                                      disabled={deleting}
                                      className="px-3 py-2 min-h-[36px] text-[12px] font-semibold bg-[#dc2626] text-white rounded-md hover:bg-[#b91c1c] transition-colors disabled:opacity-50"
                                    >
                                      {deleting ? '...' : 'Delete'}
                                    </button>
                                    <button
                                      onClick={() => setConfirmDeleteId(null)}
                                      className="px-3 py-2 min-h-[36px] text-[12px] font-semibold bg-[#f3f4f6] text-[#6b7280] rounded-md hover:bg-[#e5e7eb] transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(init.id) }}
                                    className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-[#d1d5db] hover:text-[#dc2626] transition-all rounded-md hover:bg-[#fef2f2]"
                                    title="Delete initiative"
                                  >
                                    <span className="material-symbols-outlined text-[16px]">delete</span>
                                  </button>
                                )
                              )}
                              <div className="text-right">
                                <span className="text-[18px] font-bold tabular-nums text-[#111827]">{init.progress || 0}%</span>
                                <p className="text-[11px] text-[#9ca3af] tabular-nums">{totalA} action{totalA !== 1 ? 's' : ''}</p>
                              </div>
                            </div>
                          </div>

                          {/* Progress bar */}
                          <div className="mb-2">
                            <ProgressBar pct={init.progress || 0} color={barColor} />
                          </div>

                          {/* Action counts */}
                          {totalA > 0 && (
                            <div className="flex items-center gap-2 mb-2.5">
                              <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#f0fdf4] text-[#16a34a] text-[12px] font-semibold">
                                <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                                {doneA} done
                              </span>
                              {openCount > 0 && (
                                <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#f3f4f6] text-[#6b7280] text-[12px] font-semibold">
                                  <span className="material-symbols-outlined text-[12px]">radio_button_unchecked</span>
                                  {openCount} open
                                </span>
                              )}
                            </div>
                          )}
                          {totalA === 0 && (
                            <p className="text-[12px] text-[#d1d5db] mb-2.5">No actions yet</p>
                          )}

                          {/* Meta row */}
                          <div className="flex items-center gap-4 text-[12px] text-[#9ca3af] flex-wrap">
                            <span className="font-medium text-[#6b7280]">{init.creator?.name}</span>
                            {(init.members?.length || 0) > 0 && (
                              <span>{init.members!.length} member{init.members!.length !== 1 ? 's' : ''}</span>
                            )}
                            <span className="text-[11px] font-medium text-[#9ca3af]">{PRIORITY_LABEL[init.priority] || 'Medium'} priority</span>
                            {init.dueDate && (
                              <span className={cn(isOverdue ? 'text-[#dc2626] font-semibold' : '')}>
                                {daysLeft !== null && daysLeft < 0
                                  ? `${Math.abs(daysLeft)}d overdue`
                                  : daysLeft !== null
                                  ? `${daysLeft}d left`
                                  : format(new Date(init.dueDate), 'MMM d')}
                              </span>
                            )}
                          </div>

                          {/* Open action chips */}
                          {openA.length > 0 && (
                            <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
                              {openA.map((a) => {
                                const aOD = a.dueDate && isBefore(new Date(a.dueDate), now)
                                return (
                                  <span
                                    key={a.id}
                                    className={cn(
                                      'text-[12px] px-2 py-0.5 rounded-md truncate max-w-[180px]',
                                      aOD
                                        ? 'bg-[#fef2f2] text-[#dc2626]'
                                        : 'bg-[#f9fafb] text-[#6b7280]'
                                    )}
                                  >
                                    {a.title}
                                  </span>
                                )
                              })}
                              {totalA - doneA > 3 && (
                                <span className="text-[12px] text-[#9ca3af]">+{totalA - doneA - 3} more</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* RIGHT panel */}
          <div className="col-span-12 lg:col-span-4 space-y-4">
            {/* Needs Attention */}
            {atRiskCount > 0 && (
              <div className="bg-white rounded-xl border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
                <div className="px-4 py-3 border-b border-[#fef2f2] bg-[#fef9f9]">
                  <p className="text-[11px] font-semibold text-[#dc2626] uppercase tracking-widest">Needs Attention</p>
                </div>
                <div className="divide-y divide-[#fafafa]">
                  {initiatives.filter((i) => i.status === 'at-risk').map((init) => (
                    <div
                      key={init.id}
                      onClick={() => navigate(`/initiatives/${init.id}`)}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#fef9f9] cursor-pointer transition-colors"
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-[#dc2626] shrink-0" />
                      <p className="text-[13px] font-medium text-[#111827] flex-1 truncate">{init.title}</p>
                      <span className="material-symbols-outlined text-[#dc2626] text-[15px]">chevron_right</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Activity */}
            <div className="bg-white rounded-xl border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="px-4 py-3 border-b border-[#f9fafb] flex items-center justify-between">
                <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest">Recent Activity</p>
                <span className="text-[11px] text-[#c4c4c4]">{initiatives.flatMap((i) => i.actions || []).length} actions</span>
              </div>
              {(() => {
                const items = initiatives
                  .flatMap((i) => (i.actions || []).map((a) => ({ ...a, initiativeTitle: i.title, initiativeId: i.id })))
                  .slice(0, 6)
                const iconMap: Record<string, string> = { 'completed': 'check_circle', 'in-progress': 'play_circle', 'in-review': 'rate_review', 'todo': 'radio_button_unchecked' }
                const iconColorMap: Record<string, string> = { 'completed': '#16a34a', 'in-progress': '#4648d4', 'in-review': '#2563eb', 'todo': '#d1d5db' }
                if (items.length === 0) return (
                  <div className="px-4 py-8 flex flex-col items-center gap-2">
                    <span className="material-symbols-outlined text-[28px] text-[#e5e7eb]" style={{ fontVariationSettings: "'FILL' 1" }}>pending_actions</span>
                    <p className="text-[12px] text-[#9ca3af]">No activity yet</p>
                  </div>
                )
                return (
                  <div className="relative px-4 py-2">
                    <div className="absolute left-[27px] top-4 bottom-4 w-px bg-[#f0f0f0]" />
                    <div className="space-y-0">
                      {items.map((a: any) => {
                        const person = a.assignee || a.creator
                        const initials = person?.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '?'
                        const isDone = a.status === 'completed'
                        return (
                          <div key={a.id}
                            onClick={() => navigate(`/initiatives/${a.initiativeId}/actions/${a.id}`)}
                            className="relative flex items-start gap-3 py-2.5 cursor-pointer group"
                          >
                            <div className="relative shrink-0 z-10">
                              {person?.avatar
                                ? <img src={person.avatar} alt={person.name} className="w-7 h-7 rounded-full object-cover ring-2 ring-white" />
                                : <div className="w-7 h-7 rounded-full bg-[#ede9fe] text-[#4648d4] text-[10px] font-bold flex items-center justify-center ring-2 ring-white">{initials}</div>
                              }
                              <span className="material-symbols-outlined absolute -bottom-0.5 -right-0.5 text-[12px] bg-white rounded-full"
                                style={{ color: iconColorMap[a.status] || '#d1d5db', fontVariationSettings: "'FILL' 1" }}
                              >{iconMap[a.status] || 'radio_button_unchecked'}</span>
                            </div>
                            <div className="flex-1 min-w-0 pt-0.5">
                              <p className="text-[12px] text-[#111827] leading-snug">
                                <span className="font-semibold">{person?.name?.split(' ')[0] || 'Someone'}</span>
                                {' '}<span className="text-[#6b7280]">{isDone ? 'completed' : a.status === 'in-progress' ? 'is working on' : a.status === 'in-review' ? 'put in review' : 'added'}</span>
                              </p>
                              <p className="text-[12px] font-medium text-[#374151] line-clamp-1 mt-0.5 group-hover:text-[#4648d4] transition-colors">{a.title}</p>
                              <p className="text-[11px] text-[#c4c4c4] mt-0.5">{a.initiativeTitle}</p>
                            </div>
                            <div className={cn('w-1.5 h-1.5 rounded-full mt-2 shrink-0',
                              a.priority === 'urgent' ? 'bg-[#dc2626]' : a.priority === 'high' ? 'bg-[#4648d4]' : a.priority === 'medium' ? 'bg-[#2563eb]' : 'bg-[#e5e7eb]'
                            )} />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Summary */}
            <div className="bg-white rounded-xl border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] p-4">
              <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-3.5">Summary</p>
              <div className="space-y-3">
                {[
                  { label: 'Total', val: initiatives.length, color: '#111827' },
                  { label: 'Active', val: initiatives.filter((i) => i.status === 'active').length, color: '#4648d4' },
                  { label: 'At Risk', val: atRiskCount, color: atRiskCount > 0 ? '#dc2626' : '#111827' },
                  { label: 'Completed', val: initiatives.filter((i) => i.status === 'completed').length, color: '#2563eb' },
                ].map(({ label, val, color }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-[13px] text-[#6b7280]">{label}</span>
                    <span className="text-[13px] font-semibold tabular-nums" style={{ color }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Create Pane */}
      {showCreate && (
        <div
          className="fixed inset-0 z-[60] flex justify-end"
          style={{ background: 'rgba(0,0,0,0.18)', backdropFilter: 'blur(2px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false) }}
        >
          <div className="bg-white w-full sm:w-[440px] h-full shadow-2xl flex flex-col pt-14 sm:pt-0 pb-[110px] sm:pb-0" style={{ borderLeft: '1px solid #f0f0f0' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: '1px solid #f3f4f6' }}>
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-[#ede9fe] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#4648d4] text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>rocket_launch</span>
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold text-[#111827] leading-none">New Initiative</h2>
                  <p className="text-[12px] text-[#9ca3af] mt-0.5">Define a strategic goal</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreate(false)}
                className="w-7 h-7 flex items-center justify-center text-[#9ca3af] hover:text-[#111827] hover:bg-[#f3f4f6] rounded-lg transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <form onSubmit={handleCreate} className="flex-1 flex flex-col overflow-hidden">
              <div className="p-4 space-y-5 flex-1 overflow-y-auto">
                {/* Bare title input */}
                <input
                  autoFocus
                  type="text"
                  placeholder="Initiative title..."
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full text-[16px] font-semibold text-[#111827] placeholder:text-[#d1d5db] placeholder:font-normal focus:outline-none bg-transparent border-none"
                />

                {/* Description */}
                <textarea
                  rows={3}
                  placeholder="What does success look like?"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full text-[14px] text-[#374151] placeholder:text-[#d1d5db] focus:outline-none bg-transparent border-none resize-none leading-relaxed"
                />

                <div className="h-px bg-[#f3f4f6]" />

                {/* Inline field rows */}
                <div className="space-y-1">
                  {/* Priority — pill buttons */}
                  <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-[#f9fafb]">
                    <span className="material-symbols-outlined text-[16px] text-[#9ca3af]">flag</span>
                    <span className="text-[12px] font-medium text-[#9ca3af] w-20 shrink-0">Priority</span>
                    <div className="flex gap-1 flex-1">
                      {(['low', 'medium', 'high', 'urgent'] as const).map((p) => (
                        <button key={p} type="button"
                          onClick={() => setForm((f) => ({ ...f, priority: p }))}
                          className={cn('px-2 py-0.5 rounded-md text-[12px] font-semibold capitalize transition-all border', form.priority === p
                            ? p === 'urgent' ? 'bg-[#fef2f2] text-[#dc2626] border-[#fecaca]'
                              : p === 'high' ? 'bg-[#ede9fe] text-[#4648d4] border-[#c4b5fd]'
                              : p === 'medium' ? 'bg-[#eff6ff] text-[#2563eb] border-[#bfdbfe]'
                              : 'bg-[#f3f4f6] text-[#6b7280] border-[#e5e7eb]'
                            : 'bg-transparent text-[#9ca3af] border-[#f0f0f0] hover:border-[#e5e7eb] hover:text-[#6b7280]'
                          )}
                        >{p}</button>
                      ))}
                    </div>
                  </div>

                  {/* Status — pill buttons */}
                  <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-[#f9fafb]">
                    <span className="material-symbols-outlined text-[16px] text-[#9ca3af]">radio_button_checked</span>
                    <span className="text-[12px] font-medium text-[#9ca3af] w-20 shrink-0">Status</span>
                    <div className="flex gap-1 flex-1">
                      {[
                        { value: 'active', label: 'Active', cls: 'bg-[#ede9fe] text-[#4648d4] border-[#c4b5fd]' },
                        { value: 'at-risk', label: 'At Risk', cls: 'bg-[#fef2f2] text-[#dc2626] border-[#fecaca]' },
                        { value: 'paused', label: 'Paused', cls: 'bg-[#f3f4f6] text-[#6b7280] border-[#e5e7eb]' },
                      ].map(({ value, label, cls }) => (
                        <button key={value} type="button"
                          onClick={() => setForm((f) => ({ ...f, status: value }))}
                          className={cn('px-2 py-0.5 rounded-md text-[12px] font-semibold transition-all border', form.status === value ? cls : 'bg-transparent text-[#9ca3af] border-[#f0f0f0] hover:border-[#e5e7eb] hover:text-[#6b7280]')}
                        >{label}</button>
                      ))}
                    </div>
                  </div>

                  {/* Due Date — custom styled trigger */}
                  <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-[#f9fafb]">
                    <span className="material-symbols-outlined text-[16px] text-[#9ca3af]">event</span>
                    <span className="text-[12px] font-medium text-[#9ca3af] w-20 shrink-0">Due Date</span>
                    <div className="flex items-center gap-2 flex-1">
                      <div className="relative">
                        <span className="text-[13px] font-medium text-[#374151]">
                          {form.dueDate ? format(new Date(form.dueDate + 'T00:00:00'), 'MMM d, yyyy') : <span className="text-[#9ca3af]">Pick a date</span>}
                        </span>
                        <input
                          type="date"
                          value={form.dueDate}
                          onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        />
                      </div>
                      {form.dueDate && (
                        <button type="button" onClick={() => setForm((f) => ({ ...f, dueDate: '' }))}
                          className="text-[#9ca3af] hover:text-[#dc2626] text-[14px] leading-none"
                        >×</button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-4 py-4 flex gap-2.5" style={{ borderTop: '1px solid #f3f4f6' }}>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="flex-1 h-9 text-[13px] font-semibold text-[#6b7280] border border-[#e5e7eb] rounded-lg hover:bg-[#f9fafb] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !form.title.trim()}
                  className="flex-1 h-9 text-[13px] font-semibold bg-[#4648d4] hover:bg-[#3730a3] text-white rounded-lg transition-colors disabled:opacity-40"
                >
                  {saving ? 'Creating...' : 'Create Initiative'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
