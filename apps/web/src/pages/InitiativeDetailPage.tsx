import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { format, isBefore, differenceInDays } from 'date-fns'
import AppLayout from '@/components/layout/AppLayout'
import { initiativesApi, actionsApi, membersApi, initiativeSettingsApi, tagsApi } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Tag { id: string; name: string; color: string }
interface ActionTag { tag: Tag }
interface Action {
  id: string; title: string; description?: string | null; status: string; priority: string
  dueDate?: string | null
  assignee?: { id: string; name: string; avatar?: string | null } | null
  creator: { id: string; name: string; avatar?: string | null }
  tags?: ActionTag[]
}
interface Member { userId: string; role: string; department?: string | null; user: { id: string; name: string; email: string; avatar?: string | null } }
interface PendingMember { id: string; email: string; role: string; department?: string | null; createdAt: string }
interface Initiative {
  id: string; title: string; description?: string | null; status: string; priority: string
  progress: number; dueDate?: string | null
  actions: Action[]; members: Member[]
  creator: { id: string; name: string; avatar?: string | null }
  tags?: Tag[]
  pending?: PendingMember[]
  settings?: { emailNotifications: boolean; dailyReportEnabled: boolean; dailyReportTime: string; dailyReportEmails: string[] } | null
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const STATUS_BORDER: Record<string, string> = {
  'todo': 'border-l-[#e5e7eb]', 'in-progress': 'border-l-[#4648d4]',
  'in-review': 'border-l-[#2563eb]', 'completed': 'border-l-[#e5e7eb]',
}
const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  'todo':        { label: 'TO DO',       cls: 'bg-[#f2f4f6] text-[#6b7280]' },
  'in-progress': { label: 'IN PROGRESS', cls: 'bg-[#ede9fe] text-[#4648d4]' },
  'in-review':   { label: 'IN REVIEW',   cls: 'bg-[#eff6ff] text-[#2563eb]' },
  'completed':   { label: 'DONE',        cls: 'bg-[#eff6ff] text-[#2563eb]' },
}
const INIT_STATUS: Record<string, { cls: string; text: string }> = {
  active: { cls: 'bg-[#ede9fe] text-[#4648d4]', text: 'Active' },
  'at-risk': { cls: 'bg-[#fef2f2] text-[#dc2626]', text: 'At Risk' },
  completed: { cls: 'bg-[#eff6ff] text-[#2563eb]', text: 'Done' },
  paused: { cls: 'bg-[#f2f4f6] text-[#6b7280]', text: 'Paused' },
}
const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-[#dc2626]', high: 'bg-[#4648d4]', medium: 'bg-[#2563eb]', low: 'bg-[#e5e7eb]',
}

type ActionFilter = 'all' | 'open' | 'overdue' | 'completed'
type SettingsTab = 'members' | 'notifications'

function HorizBar({ pct }: { pct: number }) {
  return (
    <div className="h-[3px] bg-[#f3f4f6] rounded-full overflow-hidden">
      <div className="h-full bg-[#4648d4] rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  )
}

function Avatar({ name, avatar, size = 'sm' }: { name?: string; avatar?: string | null; size?: 'xs' | 'sm' | 'md' }) {
  const s = { xs: 'w-6 h-6 text-[10px]', sm: 'w-7 h-7 text-[11px]', md: 'w-8 h-8 text-[12px]' }[size]
  const initials = name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '?'
  if (avatar) return <img src={avatar} alt={name} className={cn('rounded-full object-cover', s)} />
  return <div className={cn('rounded-full bg-[#ede9fe] text-[#4648d4] font-bold flex items-center justify-center', s)}>{initials}</div>
}

// ── Inline tag creator (used in Add Action pane) ──────────────────────────────
function InlineTagInput({ value, onChange, existingTags, initiativeId, onTagCreated }: {
  value: string[]; onChange: (ids: string[]) => void
  existingTags: Tag[]; initiativeId: string; onTagCreated: () => void
}) {
  const [input, setInput] = useState('')
  const [creating, setCreating] = useState(false)
  const TAG_COLORS = ['#4648d4', '#2563eb', '#7c3aed', '#0891b2', '#64748b', '#6b21a8']
  const [tagColor] = useState(() => TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)])

  const filtered = existingTags.filter((t) => t.name.toLowerCase().includes(input.toLowerCase()))
  const exact = existingTags.find((t) => t.name.toLowerCase() === input.trim().toLowerCase())

  const createAndAdd = async () => {
    if (!input.trim() || exact) return
    setCreating(true)
    try {
      const res = await tagsApi.create(initiativeId, { name: input.trim(), color: tagColor })
      const newTag: Tag = (res.data as any)?.tag
      if (newTag) {
        onChange([...value, newTag.id])
        onTagCreated()
      }
      setInput('')
    } finally { setCreating(false) }
  }

  return (
    <div>
      <input
        type="text" placeholder="Search or create tag..."
        value={input} onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (exact) { onChange(value.includes(exact.id) ? value.filter((id) => id !== exact.id) : [...value, exact.id]) } else { createAndAdd() } } }}
        className="w-full h-9 px-3 bg-[#f2f4f6] rounded-lg text-xs text-[#111827] focus:ring-2 focus:ring-[#4648d4]/20 focus:outline-none placeholder:text-[#9ca3af]"
      />
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {(input ? filtered : existingTags).map((tag) => {
          const sel = value.includes(tag.id)
          return (
            <button key={tag.id} type="button"
              onClick={() => onChange(sel ? value.filter((id) => id !== tag.id) : [...value, tag.id])}
              className={cn('px-2 py-0.5 rounded-full text-[12px] font-bold transition-all border', sel ? 'text-white border-transparent' : 'bg-white text-[#6b7280] border-[#e5e7eb] hover:border-[#4648d4]/40')}
              style={sel ? { backgroundColor: tag.color, borderColor: tag.color } : {}}
            >
              #{tag.name}
            </button>
          )
        })}
        {input && !exact && (
          <button type="button" onClick={createAndAdd} disabled={creating}
            className="px-2 py-0.5 rounded-full text-[12px] font-bold bg-[#ede9fe] text-[#4648d4] border border-[#4648d4]/20 hover:bg-[#4648d4] hover:text-white transition-all disabled:opacity-50"
          >
            {creating ? '...' : `+ Create "#${input.trim()}"`}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function InitiativeDetailPage() {
  const { initiativeId } = useParams<{ initiativeId: string }>()
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const dropdownRef = useRef<HTMLDivElement>(null)

  const [actionFilter, setActionFilter] = useState<ActionFilter>('all')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const [showAddAction, setShowAddAction] = useState(false)
  const [showUploadDropdown, setShowUploadDropdown] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('members')
  const [aiMode, setAiMode] = useState(false)
  const [actionForm, setActionForm] = useState({ title: '', description: '', priority: 'medium', dueDate: '', assigneeId: '', tagIds: [] as string[] })
  const [saving, setSaving] = useState(false)
  const [confirmDeleteActionId, setConfirmDeleteActionId] = useState<string | null>(null)
  const [transcript, setTranscript] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generatedActions, setGeneratedActions] = useState<any[]>([])
  const [bulkSaving, setBulkSaving] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member')
  const [inviteDepartment, setInviteDepartment] = useState('')
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null)
  const [editMemberRole, setEditMemberRole] = useState<'member' | 'admin'>('member')
  const [editMemberDepartment, setEditMemberDepartment] = useState('')
  const [savingMember, setSavingMember] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [notifSettings, setNotifSettings] = useState({ emailNotifications: true, dailyReportEnabled: false, dailyReportTime: '09:00' })
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false)
  const assigneeDropdownRef = useRef<HTMLDivElement>(null)
  const assigneeBtnRef = useRef<HTMLButtonElement>(null)
  const assigneePortalRef = useRef<HTMLDivElement>(null)
  const [assigneeBtnRect, setAssigneeBtnRect] = useState<DOMRect | null>(null)
  const [editingAiIndex, setEditingAiIndex] = useState<number | null>(null)
  const [savingNotif, setSavingNotif] = useState(false)
  const [extraActions, setExtraActions] = useState<any[]>([])
  const [loadingMore, setLoadingMore] = useState(false)
  const [actionsCursor, setActionsCursor] = useState<string | null>(null)
  const [hasMoreActions, setHasMoreActions] = useState(false)

  void user

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowUploadDropdown(false)
      if (
        assigneeDropdownRef.current && !assigneeDropdownRef.current.contains(e.target as Node) &&
        assigneePortalRef.current && !assigneePortalRef.current.contains(e.target as Node) &&
        assigneeBtnRef.current && !assigneeBtnRef.current.contains(e.target as Node)
      ) setShowAssigneeDropdown(false)
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchFocused(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const { data, isLoading } = useQuery({
    queryKey: ['initiative', initiativeId],
    queryFn: () => initiativesApi.get(initiativeId!).then((r) => r.data),
    enabled: !!initiativeId,
  })
  const initiative: Initiative | null = (data as any)?.initiative || null

  useEffect(() => {
    if (initiative?.settings) {
      setNotifSettings({
        emailNotifications: initiative.settings.emailNotifications,
        dailyReportEnabled: initiative.settings.dailyReportEnabled,
        dailyReportTime: initiative.settings.dailyReportTime,
      })
    }
  }, [initiative?.settings])

  // Sync pagination state when initiative loads/refreshes
  useEffect(() => {
    if (!initiative) return
    const meta = (initiative as any).actionsMeta
    setHasMoreActions(meta?.hasMore ?? false)
    setActionsCursor(meta?.nextCursor ?? null)
    setExtraActions([]) // reset on fresh load
  }, [initiative?.id, (initiative as any)?.actionsMeta?.nextCursor])

  const now = new Date()
  const allActions = [...(initiative?.actions || []), ...extraActions]
  const members = initiative?.members || []
  const allTags = initiative?.tags || []

  // Determine current user's role in this initiative
  const userRole = initiative?.creator?.id === user?.id
    ? 'owner'
    : members.find((m) => m.user.id === user?.id)?.role ?? 'member'
  const isOwnerOrAdmin = userRole === 'owner' || userRole === 'admin'
  const overdueActions = allActions.filter((a) => a.dueDate && isBefore(new Date(a.dueDate), now) && a.status !== 'completed')

  // Build autocomplete suggestions from all actions
  const searchSuggestions = (() => {
    if (!searchQuery.trim()) return null
    const q = searchQuery.toLowerCase()
    type Suggestion = { type: 'action' | 'assignee' | 'status' | 'priority'; label: string; sublabel?: string; value: string }
    const seen = new Set<string>()
    const suggestions: Suggestion[] = []

    // Matching action titles
    allActions.filter((a) => a.title.toLowerCase().includes(q)).slice(0, 4).forEach((a) => {
      if (!seen.has('a:' + a.id)) { seen.add('a:' + a.id); suggestions.push({ type: 'action', label: a.title, sublabel: a.assignee?.name, value: a.title }) }
    })

    // Matching assignee names (unique)
    const assigneeNames = new Map<string, string>()
    allActions.forEach((a) => { if (a.assignee && a.assignee.name.toLowerCase().includes(q)) assigneeNames.set(a.assignee.id, a.assignee.name) })
    assigneeNames.forEach((name) => {
      if (!seen.has('as:' + name)) { seen.add('as:' + name); suggestions.push({ type: 'assignee', label: name, sublabel: 'Assignee', value: name }) }
    })

    // Status matches
    const STATUS_DISPLAY: Record<string, string> = { 'todo': 'To Do', 'in-progress': 'In Progress', 'in-review': 'In Review', 'completed': 'Completed' }
    Object.entries(STATUS_DISPLAY).forEach(([key, label]) => {
      if (label.toLowerCase().includes(q) || key.includes(q)) {
        const count = allActions.filter((a) => a.status === key).length
        if (!seen.has('st:' + key)) { seen.add('st:' + key); suggestions.push({ type: 'status', label, sublabel: `${count} action${count !== 1 ? 's' : ''}`, value: label }) }
      }
    })

    // Priority matches
    const PRIORITY_DISPLAY: Record<string, string> = { 'urgent': 'Urgent', 'high': 'High', 'medium': 'Medium', 'low': 'Low' }
    Object.entries(PRIORITY_DISPLAY).forEach(([key, label]) => {
      if (label.toLowerCase().includes(q) || key.includes(q)) {
        const count = allActions.filter((a) => a.priority === key).length
        if (!seen.has('pr:' + key)) { seen.add('pr:' + key); suggestions.push({ type: 'priority', label, sublabel: `${count} action${count !== 1 ? 's' : ''} · Priority`, value: label }) }
      }
    })

    // Tag matches
    allTags.filter((t) => t.name.toLowerCase().includes(q)).forEach((tag) => {
      const count = allActions.filter((a) => a.tags?.some((at: any) => at.tag.id === tag.id)).length
      if (!seen.has('tg:' + tag.id)) { seen.add('tg:' + tag.id); suggestions.push({ type: 'tag' as any, label: `#${tag.name}`, sublabel: `${count} action${count !== 1 ? 's' : ''}`, value: tag.name }) }
    })

    return suggestions.length ? suggestions : null
  })()

  const filteredActions = (() => {
    let base: Action[]
    switch (actionFilter) {
      case 'open': base = allActions.filter((a) => a.status !== 'completed'); break
      case 'overdue': base = overdueActions; break
      case 'completed': base = allActions.filter((a) => a.status === 'completed'); break
      default: base = allActions
    }
    if (tagFilter) base = base.filter((a) => a.tags?.some((at) => at.tag.id === tagFilter))
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const STATUS_ALIASES: Record<string, string[]> = {
        'todo': ['todo', 'to do'], 'in-progress': ['in progress', 'in-progress', 'inprogress', 'progress'],
        'in-review': ['in review', 'in-review', 'review'], 'completed': ['completed', 'done', 'complete'],
      }
      const PRIORITY_ALIASES: Record<string, string[]> = {
        'urgent': ['urgent'], 'high': ['high'], 'medium': ['medium'], 'low': ['low'],
      }
      base = base.filter((a) => {
        if (a.title.toLowerCase().includes(q)) return true
        if (a.description?.toLowerCase().includes(q)) return true
        if (a.assignee?.name.toLowerCase().includes(q)) return true
        const statusMatch = Object.entries(STATUS_ALIASES).find(([k]) => k === a.status)?.[1].some((alias) => alias.includes(q) || q.includes(alias))
        if (statusMatch) return true
        const priorityMatch = Object.entries(PRIORITY_ALIASES).find(([k]) => k === a.priority)?.[1].some((alias) => alias.includes(q) || q.includes(alias))
        if (priorityMatch) return true
        if (a.tags?.some((at) => at.tag.name.toLowerCase().includes(q))) return true
        return false
      })
    }
    return base
  })()

  const handleAddAction = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!actionForm.title.trim() || !initiativeId) return
    setSaving(true)
    try {
      await actionsApi.create(initiativeId, { ...actionForm, dueDate: actionForm.dueDate || null, assigneeId: actionForm.assigneeId || null, tagIds: actionForm.tagIds })
      queryClient.invalidateQueries({ queryKey: ['initiative', initiativeId] })
      queryClient.invalidateQueries({ queryKey: ['command-center'] })
      setShowAddAction(false)
      setActionForm({ title: '', description: '', priority: 'medium', dueDate: '', assigneeId: '', tagIds: [] })
    } finally { setSaving(false) }
  }

  const handleGenerateActions = async () => {
    if (!transcript.trim() || !initiativeId) return
    setGenerating(true)
    try {
      const res = await actionsApi.generateFromTranscript(initiativeId, { content: transcript })
      setGeneratedActions((res.data as any)?.actions || [])
    } finally { setGenerating(false) }
  }

  const handleBulkSave = async () => {
    if (!generatedActions.length || !initiativeId) return
    setBulkSaving(true)
    try {
      await actionsApi.bulkCreate(initiativeId, generatedActions)
      queryClient.invalidateQueries({ queryKey: ['initiative', initiativeId] })
      queryClient.invalidateQueries({ queryKey: ['command-center'] })
      setAiMode(false); setTranscript(''); setGeneratedActions([])
    } finally { setBulkSaving(false) }
  }

  const handleUpdateAction = async (actionId: string, status: string) => {
    try {
      await actionsApi.update(actionId, { status })
      queryClient.invalidateQueries({ queryKey: ['initiative', initiativeId] })
      queryClient.invalidateQueries({ queryKey: ['command-center'] })
    } catch {}
  }

  const handleDeleteAction = async (actionId: string) => {
    try {
      await actionsApi.delete(actionId)
      queryClient.invalidateQueries({ queryKey: ['initiative', initiativeId] })
      queryClient.invalidateQueries({ queryKey: ['command-center'] })
      setConfirmDeleteActionId(null)
    } catch {}
  }

  const handleLoadMore = async () => {
    if (!initiativeId || !actionsCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const res = await actionsApi.listForInitiative(initiativeId, actionsCursor)
      const { actions: more, meta } = (res.data as any)
      setExtraActions((prev) => [...prev, ...more])
      setHasMoreActions(meta.hasMore)
      setActionsCursor(meta.nextCursor)
    } catch {}
    finally { setLoadingMore(false) }
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail.trim() || !initiativeId) return
    setInviting(true)
    try {
      await membersApi.addMember(initiativeId, {
        email: inviteEmail.trim(),
        role: inviteRole,
        department: inviteDepartment.trim() || undefined,
      })
      setInviteEmail('')
      setInviteDepartment('')
      setInviteRole('member')
      queryClient.invalidateQueries({ queryKey: ['initiative', initiativeId] })
    } catch {}
    finally { setInviting(false) }
  }

  const handleUpdateMember = async (memberId: string) => {
    if (!initiativeId) return
    setSavingMember(true)
    try {
      await membersApi.updateMember(initiativeId, memberId, {
        role: editMemberRole,
        department: editMemberDepartment.trim() || null,
      })
      setEditingMemberId(null)
      queryClient.invalidateQueries({ queryKey: ['initiative', initiativeId] })
    } catch {}
    finally { setSavingMember(false) }
  }

  const handleSaveNotifications = async () => {
    if (!initiativeId) return
    setSavingNotif(true)
    try {
      await initiativeSettingsApi.update(initiativeId, {
        emailNotifications: notifSettings.emailNotifications,
        dailyReportEnabled: notifSettings.dailyReportEnabled,
        dailyReportTime: notifSettings.dailyReportTime,
      })
      queryClient.invalidateQueries({ queryKey: ['initiative', initiativeId] })
    } finally { setSavingNotif(false) }
  }

  const daysRemaining = initiative?.dueDate ? differenceInDays(new Date(initiative.dueDate), now) : null
  const progressColor = initiative?.status === 'at-risk' ? 'bg-[#dc2626]' : 'bg-[#4648d4]'

  if (isLoading) {
    return <AppLayout><div className="flex items-center justify-center min-h-screen bg-[#f9fafb]"><div className="w-6 h-6 border-[3px] border-[#ede9fe] border-t-[#4648d4] rounded-full animate-spin" /></div></AppLayout>
  }
  if (!initiative) {
    return <AppLayout><div className="flex items-center justify-center min-h-screen bg-[#f9fafb]"><p className="text-[#6b7280] text-[14px]">Initiative not found.</p></div></AppLayout>
  }

  return (
    <AppLayout>
      <div className="bg-[#f9fafb] min-h-screen">
        {/* Compact page header */}
        <div className="bg-white border-b border-[#f0f0f0] px-4 md:px-4 py-4">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-[12px] text-[#9ca3af] mb-2">
            <Link to="/initiatives" className="hover:text-[#4648d4] transition-colors flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">arrow_back</span>
              Initiatives
            </Link>
            <span className="text-[#e5e7eb]">/</span>
            <span className="text-[#374151] font-medium truncate max-w-[240px]">{initiative.title}</span>
          </nav>

          {/* Title row */}
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-[18px] font-bold text-[#111827] tracking-tight truncate">{initiative.title}</h1>
                <span className={cn('px-2 py-0.5 text-[11px] font-bold rounded-full', INIT_STATUS[initiative.status]?.cls || INIT_STATUS.active.cls)}>
                  {INIT_STATUS[initiative.status]?.text || initiative.status}
                </span>
                {daysRemaining !== null && (
                  <span className={cn('px-2 py-0.5 text-[11px] font-bold rounded-full', daysRemaining < 0 ? 'bg-[#fef2f2] text-[#dc2626]' : 'bg-[#f2f4f6] text-[#6b7280]')}>
                    {daysRemaining < 0 ? `${Math.abs(daysRemaining)}d overdue` : `${daysRemaining}d left`}
                  </span>
                )}
              </div>
              {/* Progress bar inline */}
              <div className="flex items-center gap-3 mt-2.5">
                <div className="h-[3px] bg-[#f3f4f6] rounded-full w-[180px] overflow-hidden">
                  <div className={cn('h-full rounded-full transition-all', progressColor)} style={{ width: `${initiative.progress || 0}%` }} />
                </div>
                <span className="text-[12px] font-semibold text-[#6b7280] tabular-nums">{initiative.progress || 0}%</span>
              </div>
              {/* Owner */}
              <div className="flex items-center gap-1.5 mt-2">
                <Avatar name={initiative.creator.name} avatar={initiative.creator.avatar || null} size="xs" />
                <span className="text-[12px] text-[#9ca3af]">Owner:</span>
                <span className="text-[12px] font-semibold text-[#374151]">{initiative.creator.name}</span>
              </div>
            </div>

            {/* Right actions: collaborators + settings + Add Action */}
            <div className="flex items-center gap-3 shrink-0 pb-1 md:pb-0">
              {/* Collaborator avatars — always includes owner */}
              {(() => {
                const creatorInMembers = members.some((m) => m.userId === initiative.creator.id)
                const allCollaborators: { id: string; name: string; avatar?: string | null; role: string }[] = [
                  ...(creatorInMembers ? [] : [{ id: initiative.creator.id, name: initiative.creator.name, avatar: initiative.creator.avatar || null, role: 'owner' }]),
                  ...members.map((m) => ({ id: m.userId, name: m.user?.name, avatar: m.user?.avatar, role: m.role })),
                ]
                const visible = allCollaborators.slice(0, 5)
                const overflow = allCollaborators.length - 5
                return (
                  <button
                    onClick={() => { setShowSettings(true); setSettingsTab('members') }}
                    className="flex items-center hover:opacity-90 transition-opacity"
                    title="Manage team"
                  >
                    <div className="flex -space-x-2">
                      {visible.map((c) => (
                        <div key={c.id} title={`${c.name} (${c.role})`} className="ring-2 ring-white rounded-full">
                          <Avatar name={c.name} avatar={c.avatar} size="sm" />
                        </div>
                      ))}
                      {overflow > 0 && (
                        <div className="w-7 h-7 rounded-full bg-[#f2f4f6] text-[#6b7280] text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
                          +{overflow}
                        </div>
                      )}
                    </div>
                  </button>
                )
              })()}

              {/* Settings — owners/admins only */}
              {isOwnerOrAdmin && (
                <button
                  onClick={() => setShowSettings(true)}
                  className="p-1.5 text-[#9ca3af] hover:text-[#4648d4] hover:bg-[#ede9fe] rounded-lg transition-colors shrink-0"
                  title="Settings"
                >
                  <span className="material-symbols-outlined text-[22px]">settings</span>
                </button>
              )}

              {/* Split Add Action button */}
              <div ref={dropdownRef} className="relative flex">
                <button
                  onClick={() => setShowAddAction(true)}
                  className="px-3 py-2 bg-[#4648d4] text-white text-xs font-bold rounded-l-lg flex items-center gap-1.5 hover:bg-[#3730a3] transition-colors border-r border-[#3730a3]"
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                  Add Action
                </button>
                <button
                  onClick={() => setShowUploadDropdown((v) => !v)}
                  className="px-1.5 py-2 bg-[#4648d4] text-white rounded-r-lg hover:bg-[#3730a3] transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">arrow_drop_down</span>
                </button>
                {showUploadDropdown && (
                  <div className="absolute top-full right-0 mt-1 w-48 bg-white rounded-xl shadow-xl border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] z-50 overflow-hidden">
                    {[
                      { label: 'Upload from Sheets', icon: 'table_chart', mode: 'sheets' },
                      { label: 'Upload Transcript', icon: 'description', mode: 'transcript' },
                      { label: 'Live Transcript', icon: 'mic', mode: 'live' },
                    ].map(({ label, icon, mode }) => (
                      <button key={mode} onClick={() => { setShowUploadDropdown(false); navigate(`/upload?mode=${mode}&initiativeId=${initiativeId}`) }}
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
        </div>

        {/* Content */}
        <div className="p-4 md:p-4 grid grid-cols-12 gap-3.5">
          {/* LEFT — Actions */}
          <section className="col-span-12 lg:col-span-8 space-y-3">
            {/* Search + Filters */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
              {/* Search */}
              <div ref={searchRef} className="relative flex-1 min-w-[180px]">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af] text-[16px]">search</span>
                <input
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-[#e5e7eb] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#4648d4]/10 focus:border-[#4648d4] transition-all placeholder:text-[#c4c4c4]"
                  placeholder="Search by name, assignee, status, priority…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onKeyDown={(e) => { if (e.key === 'Escape') { setSearchFocused(false); setSearchQuery('') } }}
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#374151]">
                    <span className="material-symbols-outlined text-[15px]">close</span>
                  </button>
                )}
                {/* Autocomplete popup */}
                {searchFocused && searchSuggestions && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-[#e5e7eb] rounded-xl shadow-lg z-30 overflow-hidden">
                    <div className="py-1">
                      {searchSuggestions.map((s, i) => {
                        const iconMap: Record<string, string> = { action: 'task_alt', assignee: 'person', status: 'pending', priority: 'flag', tag: 'sell' }
                        const colorMap: Record<string, string> = { action: '#4648d4', assignee: '#2563eb', status: '#7c3aed', priority: '#0891b2', tag: '#0f766e' }
                        return (
                          <button
                            key={i}
                            onMouseDown={(e) => { e.preventDefault(); setSearchQuery(s.value); setSearchFocused(false) }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#f5f3ff] transition-colors text-left"
                          >
                            <span
                              className="material-symbols-outlined text-[15px] shrink-0"
                              style={{ color: colorMap[s.type], fontVariationSettings: "'FILL' 1" }}
                            >{iconMap[s.type]}</span>
                            <span className="text-[13px] font-medium text-[#111827] truncate flex-1">{s.label}</span>
                            {s.sublabel && <span className="text-[12px] text-[#9ca3af] shrink-0">{s.sublabel}</span>}
                            <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-md bg-[#f3f4f6] text-[#6b7280] shrink-0 capitalize">{s.type}</span>
                          </button>
                        )
                      })}
                    </div>
                    <div className="border-t border-[#f3f4f6] px-3 py-1.5">
                      <p className="text-[11px] text-[#c4c4c4]">Press Enter to search · Esc to clear</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Status filters */}
              <div className="flex bg-[#f3f4f6] rounded-lg p-0.5 gap-0.5 overflow-x-auto shrink-0">
                {(['all', 'open', 'overdue', 'completed'] as ActionFilter[]).map((f) => (
                  <button key={f} onClick={() => setActionFilter(f)}
                    className={cn('px-2.5 py-1 text-[12px] font-semibold rounded-md transition-all capitalize shrink-0', actionFilter === f
                      ? f === 'overdue' ? 'bg-[#fef2f2] text-[#dc2626] shadow-sm' : 'bg-white text-[#4648d4] shadow-sm'
                      : 'text-[#9ca3af] hover:text-[#374151]'
                    )}
                  >
                    {f === 'all' ? `All (${allActions.length})` : f === 'open' ? `Open (${allActions.filter((a) => a.status !== 'completed').length})` : f === 'overdue' ? `Overdue (${overdueActions.length})` : `Done (${allActions.filter((a) => a.status === 'completed').length})`}
                  </button>
                ))}
              </div>
            </div>


            {/* Action list */}
            {filteredActions.length === 0 ? (
              <div className="bg-white rounded-xl border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] py-8 text-center">
                <span
                  className="material-symbols-outlined text-[32px] text-[#e5e7eb] block mb-2"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  task_alt
                </span>
                <p className="text-[13px] text-[#9ca3af] font-medium">No actions in this view</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden divide-y divide-[#fafafa]">
                {filteredActions.map((action) => {
                  const isOD = action.dueDate && isBefore(new Date(action.dueDate), now) && action.status !== 'completed'
                  const isDueSoon = action.dueDate && !isOD && differenceInDays(new Date(action.dueDate), now) <= 3 && action.status !== 'completed'
                  const barColor = isOD ? '#dc2626' : isDueSoon ? '#2563eb' : STATUS_BORDER[action.status] ? STATUS_BORDER[action.status].replace('border-l-', '').replace('[', '').replace(']', '') : '#e5e7eb'
                  const dotColor = PRIORITY_DOT[action.priority]?.replace('bg-', '').replace('[', '').replace(']', '') || '#e5e7eb'
                  const actionTags = action.tags?.map((at) => at.tag) || []

                  return (
                    <div
                      key={action.id}
                      onClick={() => navigate(`/initiatives/${initiativeId}/actions/${action.id}`)}
                      className={cn('group relative flex items-start gap-0 hover:bg-[#fafafa] transition-colors duration-100 cursor-pointer', action.status === 'completed' && 'opacity-50')}
                    >
                      {/* Status bar */}
                      <div
                        className="w-[3px] shrink-0 self-stretch"
                        style={{ backgroundColor: isOD ? '#dc2626' : isDueSoon ? '#2563eb' : action.status === 'in-progress' ? '#4648d4' : '#e5e7eb' }}
                      />
                      <div className="flex-1 flex items-start gap-3 px-4 py-2.5 min-w-0">
                        <div
                          className={cn('w-1.5 h-1.5 rounded-full mt-[5px] shrink-0', PRIORITY_DOT[action.priority] || 'bg-[#e5e7eb]')}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-0.5">
                            <h4
                              className={cn(
                                'text-[14px] font-medium text-[#111827] truncate transition-colors',
                                action.status === 'completed' && 'line-through text-[#9ca3af]'
                              )}
                            >
                              {action.title}
                            </h4>
                            <div className="flex items-center gap-2 shrink-0">
                              {isOD ? (
                                <span className="text-[12px] font-semibold text-[#dc2626]">{format(new Date(action.dueDate!), 'MMM d')}</span>
                              ) : action.dueDate ? (
                                <span className="text-[12px] text-[#9ca3af]">{format(new Date(action.dueDate), 'MMM d')}</span>
                              ) : null}
                            </div>
                          </div>

                          {action.description && (
                            <p className="text-[12px] text-[#9ca3af] line-clamp-1 mb-1.5">{action.description}</p>
                          )}

                          {actionTags.length > 0 && (
                            <div className="flex gap-1 mt-1.5 flex-wrap">
                              {actionTags.map((tag) => (
                                <span key={tag.id} className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-[#f3f4f6] text-[#6b7280]">
                                  #{tag.name}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="flex items-center justify-between mt-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              {action.assignee ? (
                                <div className="flex items-center gap-1.5">
                                  <Avatar name={action.assignee.name} avatar={action.assignee.avatar} size="xs" />
                                  <span className="text-[12px] text-[#6b7280]">{action.assignee.name}</span>
                                </div>
                              ) : (
                                <span className="text-[12px] text-[#d1d5db]">Unassigned</span>
                              )}
                              <span className={cn(
                                'px-1.5 py-0.5 rounded-md text-[11px] font-semibold',
                                action.status === 'completed'  ? 'bg-[#f0fdf4] text-[#16a34a]'
                                : action.status === 'in-progress' ? 'bg-[#ede9fe] text-[#4648d4]'
                                : action.status === 'in-review'   ? 'bg-[#eff6ff] text-[#2563eb]'
                                : 'bg-[#f3f4f6] text-[#6b7280]'
                              )}>
                                {action.status === 'in-progress' ? 'In Progress'
                                  : action.status === 'in-review' ? 'In Review'
                                  : action.status === 'completed' ? 'Done'
                                  : 'To Do'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {action.status !== 'completed' && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleUpdateAction(action.id, 'completed') }}
                                  className="text-[12px] font-semibold text-[#4648d4] opacity-0 group-hover:opacity-100 transition-opacity hover:underline"
                                >
                                  ✓ Done
                                </button>
                              )}
                              {isOwnerOrAdmin && (
                                confirmDeleteActionId === action.id ? (
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleDeleteAction(action.id) }}
                                      className="px-2 py-0.5 text-[11px] font-semibold bg-[#dc2626] text-white rounded-md hover:bg-[#b91c1c] transition-colors"
                                    >
                                      Delete
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteActionId(null) }}
                                      className="px-2 py-0.5 text-[11px] font-semibold bg-[#f3f4f6] text-[#6b7280] rounded-md hover:bg-[#e5e7eb] transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteActionId(action.id) }}
                                    className="text-[#d1d5db] hover:text-[#dc2626] opacity-0 group-hover:opacity-100 transition-all"
                                    title="Delete action"
                                  >
                                    <span className="material-symbols-outlined text-[15px]">delete</span>
                                  </button>
                                )
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Load more */}
            {hasMoreActions && (
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="w-full h-10 border border-[#e5e7eb] rounded-xl text-[#6b7280] text-[13px] font-semibold hover:border-[#4648d4]/40 hover:text-[#4648d4] hover:bg-[#f5f3ff]/30 transition-all flex items-center justify-center gap-2 bg-white disabled:opacity-50"
              >
                {loadingMore ? (
                  <><div className="w-3.5 h-3.5 border-2 border-[#e5e7eb] border-t-[#4648d4] rounded-full animate-spin" /> Loading...</>
                ) : (
                  <><span className="material-symbols-outlined text-[18px]">expand_more</span>
                  Show more actions ({(initiative as any)?.actionsMeta?.total - allActions.length} remaining)</>
                )}
              </button>
            )}

            {/* Add via AI */}
            <button onClick={() => setAiMode(true)}
              className="w-full h-10 border border-dashed border-[#e5e7eb] rounded-xl text-[#9ca3af] text-[13px] font-semibold hover:border-[#4648d4]/40 hover:text-[#4648d4] hover:bg-[#f5f3ff]/50 transition-all flex items-center justify-center gap-2 bg-white"
            >
              <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
              Generate actions with AI
            </button>
          </section>

          {/* RIGHT — Initiative info */}
          <section className="col-span-12 lg:col-span-4 space-y-4">
            {/* Stats */}
            <div className="bg-white rounded-xl border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] p-4">
              {(searchQuery || actionFilter !== 'all' || tagFilter) && (
                <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-3">Filtered view</p>
              )}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-[22px] font-bold text-[#111827] tabular-nums leading-none">{filteredActions.length}</p>
                  <p className="text-[11px] text-[#9ca3af] uppercase tracking-widest font-semibold mt-1.5">Total</p>
                </div>
                <div>
                  <p className="text-[22px] font-bold text-[#4648d4] tabular-nums leading-none">{filteredActions.filter((a) => a.status !== 'completed').length}</p>
                  <p className="text-[11px] text-[#9ca3af] uppercase tracking-widest font-semibold mt-1.5">Open</p>
                </div>
                <div>
                  {(() => { const od = filteredActions.filter((a) => a.dueDate && isBefore(new Date(a.dueDate), now) && a.status !== 'completed').length; return (
                    <p className={cn('text-[22px] font-bold tabular-nums leading-none', od > 0 ? 'text-[#dc2626]' : 'text-[#111827]')}>{od}</p>
                  )})()}
                  <p className="text-[11px] text-[#9ca3af] uppercase tracking-widest font-semibold mt-1.5">Overdue</p>
                </div>
              </div>
              <div className="mt-4">
                <div className="h-[3px] bg-[#f3f4f6] rounded-full overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all', progressColor)}
                    style={{ width: `${Math.min(initiative.progress || 0, 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Description */}
            {initiative.description && (
              <div className="bg-white rounded-xl border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] p-4">
                <h3 className="text-[12px] font-bold text-[#9ca3af] uppercase tracking-widest mb-2">About</h3>
                <p className="text-xs text-[#374151] leading-relaxed">{initiative.description}</p>
              </div>
            )}

            {/* Activity timeline */}
            <div className="bg-white rounded-xl border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="px-4 py-3 border-b border-[#f2f4f6] flex items-center justify-between">
                <h3 className="text-[12px] font-bold text-[#9ca3af] uppercase tracking-widest">Recent Activity</h3>
                <span className="text-[11px] text-[#c4c4c4]">{allActions.length} action{allActions.length !== 1 ? 's' : ''}</span>
              </div>
              {allActions.length === 0 ? (
                <div className="px-4 py-8 flex flex-col items-center gap-2">
                  <span className="material-symbols-outlined text-[28px] text-[#e5e7eb]" style={{ fontVariationSettings: "'FILL' 1" }}>pending_actions</span>
                  <p className="text-[12px] text-[#9ca3af]">No activity yet</p>
                </div>
              ) : (
                <div className="relative px-4 py-2">
                  {/* vertical line */}
                  <div className="absolute left-[27px] top-4 bottom-4 w-px bg-[#f0f0f0]" />
                  <div className="space-y-0">
                    {allActions.slice(0, 6).map((action) => {
                      const person = action.assignee || action.creator
                      const initials = person?.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '?'
                      const isDone = action.status === 'completed'
                      const isOverdue = action.dueDate && isBefore(new Date(action.dueDate), now) && !isDone
                      const iconMap: Record<string, string> = { 'completed': 'check_circle', 'in-progress': 'play_circle', 'in-review': 'rate_review', 'todo': 'radio_button_unchecked' }
                      const iconColorMap: Record<string, string> = { 'completed': '#16a34a', 'in-progress': '#4648d4', 'in-review': '#2563eb', 'todo': '#d1d5db' }
                      return (
                        <div key={action.id}
                          onClick={() => navigate(`/initiatives/${initiativeId}/actions/${action.id}`)}
                          className="relative flex items-start gap-3 py-2.5 cursor-pointer group"
                        >
                          {/* Avatar */}
                          <div className="relative shrink-0 z-10">
                            {person?.avatar
                              ? <img src={person.avatar} alt={person.name} className="w-7 h-7 rounded-full object-cover ring-2 ring-white" />
                              : <div className="w-7 h-7 rounded-full bg-[#ede9fe] text-[#4648d4] text-[10px] font-bold flex items-center justify-center ring-2 ring-white">{initials}</div>
                            }
                            {/* Status icon badge */}
                            <span className="material-symbols-outlined absolute -bottom-0.5 -right-0.5 text-[12px] bg-white rounded-full"
                              style={{ color: iconColorMap[action.status] || '#d1d5db', fontVariationSettings: "'FILL' 1" }}
                            >{iconMap[action.status] || 'radio_button_unchecked'}</span>
                          </div>
                          {/* Content */}
                          <div className="flex-1 min-w-0 pt-0.5">
                            <p className="text-[12px] text-[#111827] leading-snug group-hover:text-[#4648d4] transition-colors">
                              <span className="font-semibold">{person?.name?.split(' ')[0] || 'Someone'}</span>
                              {' '}
                              <span className="text-[#6b7280]">
                                {isDone ? 'completed' : action.status === 'in-progress' ? 'is working on' : action.status === 'in-review' ? 'put in review' : 'added'}
                              </span>
                            </p>
                            <p className="text-[12px] font-medium text-[#374151] line-clamp-1 mt-0.5 group-hover:text-[#4648d4] transition-colors">{action.title}</p>
                            {isOverdue && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-[#dc2626] mt-0.5">
                                <span className="material-symbols-outlined text-[11px]">schedule</span>
                                Overdue · {format(new Date(action.dueDate!), 'MMM d')}
                              </span>
                            )}
                          </div>
                          {/* Priority dot */}
                          <div className={cn('w-1.5 h-1.5 rounded-full mt-2 shrink-0',
                            action.priority === 'urgent' ? 'bg-[#dc2626]' : action.priority === 'high' ? 'bg-[#4648d4]' : action.priority === 'medium' ? 'bg-[#2563eb]' : 'bg-[#e5e7eb]'
                          )} />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* ── Add Action Pane ─────────────────────────────────────────────────── */}
      {showAddAction && (
        <div
          className="fixed inset-0 z-[60] flex justify-end"
          style={{ background: 'rgba(0,0,0,0.18)', backdropFilter: 'blur(2px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowAddAction(false) }}
        >
          <div className="bg-white w-full md:w-[440px] h-full shadow-2xl flex flex-col pt-14 md:pt-0 pb-[110px] md:pb-0" style={{ borderLeft: '1px solid #f0f0f0' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: '1px solid #f3f4f6' }}>
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-[#ede9fe] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#4648d4] text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>add_task</span>
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold text-[#111827] leading-none">New Action</h2>
                  <p className="text-[12px] text-[#9ca3af] mt-0.5">{initiative.title}</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddAction(false)}
                className="w-7 h-7 flex items-center justify-center text-[#9ca3af] hover:text-[#111827] hover:bg-[#f3f4f6] rounded-lg transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <form onSubmit={handleAddAction} className="flex-1 flex flex-col overflow-hidden">
              <div className="p-4 space-y-5 flex-1 overflow-y-auto">
                {/* Title */}
                <div>
                  <input
                    autoFocus
                    type="text"
                    placeholder="Action title..."
                    value={actionForm.title}
                    onChange={(e) => setActionForm((f) => ({ ...f, title: e.target.value }))}
                    className="w-full text-[16px] font-semibold text-[#111827] placeholder:text-[#d1d5db] placeholder:font-normal focus:outline-none bg-transparent border-none"
                  />
                </div>

                {/* Description */}
                <div>
                  <textarea
                    rows={3}
                    placeholder="Add a description..."
                    value={actionForm.description}
                    onChange={(e) => setActionForm((f) => ({ ...f, description: e.target.value }))}
                    className="w-full text-[14px] text-[#374151] placeholder:text-[#d1d5db] focus:outline-none bg-transparent border-none resize-none leading-relaxed"
                  />
                </div>

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
                          onClick={() => setActionForm((f) => ({ ...f, priority: p }))}
                          className={cn('px-2 py-0.5 rounded-md text-[12px] font-semibold capitalize transition-all border', actionForm.priority === p
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

                  {/* Due Date — custom styled trigger */}
                  <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-[#f9fafb]">
                    <span className="material-symbols-outlined text-[16px] text-[#9ca3af]">event</span>
                    <span className="text-[12px] font-medium text-[#9ca3af] w-20 shrink-0">Due Date</span>
                    <div className="flex items-center gap-2 flex-1">
                      <div className="relative">
                        <span className="text-[13px] font-medium text-[#374151]">
                          {actionForm.dueDate ? format(new Date(actionForm.dueDate + 'T00:00:00'), 'MMM d, yyyy') : <span className="text-[#9ca3af]">Pick a date</span>}
                        </span>
                        <input
                          type="date"
                          value={actionForm.dueDate}
                          onChange={(e) => setActionForm((f) => ({ ...f, dueDate: e.target.value }))}
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        />
                      </div>
                      {actionForm.dueDate && (
                        <button type="button" onClick={() => setActionForm((f) => ({ ...f, dueDate: '' }))}
                          className="text-[#9ca3af] hover:text-[#dc2626] text-[14px] leading-none"
                        >×</button>
                      )}
                    </div>
                  </div>

                  {/* Assignee — custom popover */}
                  <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-[#f9fafb]">
                    <span className="material-symbols-outlined text-[16px] text-[#9ca3af]">person</span>
                    <span className="text-[12px] font-medium text-[#9ca3af] w-20 shrink-0">Assignee</span>
                    <div className="flex-1" ref={assigneeDropdownRef}>
                      {(() => {
                        const allAssignees = [
                          { id: initiative.creator.id, name: initiative.creator.name, avatar: initiative.creator.avatar || null, role: 'owner', dept: '' },
                          ...members.filter((m) => m.userId !== initiative.creator.id).map((m) => ({ id: m.userId, name: m.user?.name, avatar: m.user?.avatar || null, role: m.role, dept: m.department || '' })),
                        ]
                        const selected = allAssignees.find((a) => a.id === actionForm.assigneeId)
                        return (
                          <>
                            <button
                              ref={assigneeBtnRef}
                              type="button"
                              onClick={() => {
                                if (!showAssigneeDropdown && assigneeBtnRef.current) {
                                  setAssigneeBtnRect(assigneeBtnRef.current.getBoundingClientRect())
                                }
                                setShowAssigneeDropdown((v) => !v)
                              }}
                              className="flex items-center gap-2 text-[13px] font-medium text-[#374151] hover:text-[#4648d4] transition-colors w-full"
                            >
                              {selected ? (
                                <>
                                  <Avatar name={selected.name} avatar={selected.avatar} size="xs" />
                                  <span>{selected.name}</span>
                                  {selected.dept && <span className="ml-1 text-[11px] text-[#9ca3af]">· {selected.dept}</span>}
                                </>
                              ) : <span className="text-[#9ca3af]">Unassigned</span>}
                            </button>
                            {showAssigneeDropdown && assigneeBtnRect && createPortal(
                              <div
                                ref={assigneePortalRef}
                                style={{ position: 'fixed', top: assigneeBtnRect.bottom + 4, left: assigneeBtnRect.left, zIndex: 9999, minWidth: 220 }}
                                className="bg-white border border-[#e5e7eb] rounded-xl shadow-xl py-1 overflow-hidden"
                              >
                                <button onMouseDown={(e) => { e.preventDefault(); setActionForm((f) => ({ ...f, assigneeId: '' })); setShowAssigneeDropdown(false) }}
                                  className={cn('w-full flex items-center gap-2.5 px-3 py-2 text-[13px] hover:bg-[#f9fafb] transition-colors', !actionForm.assigneeId ? 'text-[#4648d4] font-semibold' : 'text-[#9ca3af]')}
                                >
                                  <div className="w-5 h-5 rounded-full border-2 border-dashed border-[#d1d5db] flex items-center justify-center shrink-0" />
                                  Unassigned
                                </button>
                                {allAssignees.map((a) => (
                                  <button key={a.id} onMouseDown={(e) => { e.preventDefault(); setActionForm((f) => ({ ...f, assigneeId: a.id })); setShowAssigneeDropdown(false) }}
                                    className={cn('w-full flex items-center gap-2.5 px-3 py-2 text-[13px] hover:bg-[#f9fafb] transition-colors', actionForm.assigneeId === a.id ? 'bg-[#f5f3ff]' : '')}
                                  >
                                    <Avatar name={a.name} avatar={a.avatar} size="xs" />
                                    <span className={cn('flex-1 text-left', actionForm.assigneeId === a.id ? 'text-[#4648d4] font-semibold' : 'text-[#374151]')}>{a.name}</span>
                                    {a.dept && <span className="text-[11px] text-[#9ca3af] shrink-0">{a.dept}</span>}
                                    {a.role === 'owner' && <span className="text-[10px] font-bold text-[#9ca3af] uppercase shrink-0">owner</span>}
                                  </button>
                                ))}
                              </div>,
                              document.body
                            )}
                          </>
                        )
                      })()}
                    </div>
                  </div>
                </div>

                <div className="h-px bg-[#f3f4f6]" />

                {/* Tags */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="material-symbols-outlined text-[16px] text-[#9ca3af]">label</span>
                    <span className="text-[12px] font-medium text-[#9ca3af]">Tags</span>
                  </div>
                  <InlineTagInput
                    value={actionForm.tagIds}
                    onChange={(ids) => setActionForm((f) => ({ ...f, tagIds: ids }))}
                    existingTags={allTags}
                    initiativeId={initiativeId!}
                    onTagCreated={() => queryClient.invalidateQueries({ queryKey: ['initiative', initiativeId] })}
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="px-4 py-4 flex gap-2.5" style={{ borderTop: '1px solid #f3f4f6' }}>
                <button
                  type="button"
                  onClick={() => setShowAddAction(false)}
                  className="flex-1 h-9 text-[13px] font-semibold text-[#6b7280] border border-[#e5e7eb] rounded-lg hover:bg-[#f9fafb] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !actionForm.title.trim()}
                  className="flex-1 h-9 text-[13px] font-semibold bg-[#4648d4] hover:bg-[#3730a3] text-white rounded-lg transition-colors disabled:opacity-40"
                >
                  {saving ? 'Creating...' : 'Create Action'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Settings Pane ───────────────────────────────────────────────────── */}
      {showSettings && (
        <div
          className="fixed inset-0 z-[60] flex justify-end"
          style={{ background: 'rgba(0,0,0,0.18)', backdropFilter: 'blur(2px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowSettings(false) }}
        >
          <div className="bg-white w-full md:w-[400px] h-full shadow-2xl flex flex-col pt-14 md:pt-0 pb-[110px] md:pb-0" style={{ borderLeft: '1px solid #f0f0f0' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: '1px solid #f3f4f6' }}>
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#6b7280] text-[16px]">settings</span>
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold text-[#111827] leading-none">Settings</h2>
                  <p className="text-[12px] text-[#9ca3af] mt-0.5 truncate max-w-[220px]">{initiative.title}</p>
                </div>
              </div>
              <button onClick={() => setShowSettings(false)} className="w-7 h-7 flex items-center justify-center text-[#9ca3af] hover:text-[#111827] hover:bg-[#f3f4f6] rounded-lg transition-colors">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex px-4" style={{ borderBottom: '1px solid #f3f4f6' }}>
              {(['members', 'notifications'] as SettingsTab[]).map((tab) => (
                <button key={tab} onClick={() => setSettingsTab(tab)}
                  className={cn('py-3 px-1 mr-5 text-[12px] font-semibold border-b-2 -mb-px transition-all capitalize', settingsTab === tab ? 'border-[#4648d4] text-[#4648d4]' : 'border-transparent text-[#9ca3af] hover:text-[#6b7280]')}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto">
              {settingsTab === 'members' && (
                <div>
                  {/* Members list — divide-y rows */}
                  <div className="divide-y divide-[#f9fafb]">
                    {/* Always show creator first */}
                    {(() => {
                      const creatorIsMember = members.some((m) => m.userId === initiative.creator.id)
                      const rows = creatorIsMember
                        ? members
                        : [{ userId: initiative.creator.id, role: 'owner', user: { id: initiative.creator.id, name: initiative.creator.name, email: '', avatar: initiative.creator.avatar || null } } as Member, ...members]
                      return rows.map((m) => {
                        const isEditing = editingMemberId === m.userId
                        const canEditThisMember = isOwnerOrAdmin && m.role !== 'owner'
                        return (
                          <div key={m.userId} className="px-4 py-2.5 hover:bg-[#fafafa] transition-colors">
                            <div className="flex items-center gap-3 group/member">
                              <Avatar name={m.user?.name} avatar={m.user?.avatar} size="sm" />
                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-semibold text-[#111827] truncate">{m.user?.name}</p>
                                {m.user?.email && <p className="text-[12px] text-[#9ca3af] truncate">{m.user.email}</p>}
                                {(m as any).department && !isEditing && <p className="text-[11px] text-[#9ca3af] mt-0.5">{(m as any).department}</p>}
                              </div>
                              <span className={cn('text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full', m.role === 'owner' ? 'bg-[#ede9fe] text-[#4648d4]' : m.role === 'admin' ? 'bg-[#eff6ff] text-[#2563eb]' : 'bg-[#f3f4f6] text-[#6b7280]')}>{m.role}</span>
                              {canEditThisMember && !isEditing && (
                                <button
                                  onClick={() => { setEditingMemberId(m.userId); setEditMemberRole(m.role as 'member' | 'admin'); setEditMemberDepartment((m as any).department || '') }}
                                  className="opacity-0 group-hover/member:opacity-100 text-[#9ca3af] hover:text-[#4648d4] transition-all p-1 rounded"
                                  title="Edit member"
                                >
                                  <span className="material-symbols-outlined text-[15px]">edit</span>
                                </button>
                              )}
                            </div>
                            {isEditing && (
                              <div className="mt-3 space-y-2 pl-10">
                                <div>
                                  <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-1">Role</p>
                                  <div className="flex gap-2">
                                    {(['member', 'admin'] as const).map((r) => (
                                      <button key={r} type="button" onClick={() => setEditMemberRole(r)}
                                        className={cn('flex-1 h-7 text-[12px] font-semibold rounded-lg capitalize border transition-all', editMemberRole === r ? 'bg-[#4648d4] text-white border-[#4648d4]' : 'bg-white text-[#6b7280] border-[#e5e7eb] hover:border-[#4648d4]/30')}
                                      >{r}</button>
                                    ))}
                                  </div>
                                </div>
                                <div>
                                  <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-1">Department</p>
                                  <div className="flex flex-wrap gap-1 mb-1.5">
                                    {['Engineering', 'Sales', 'Presales', 'Consultant', 'Solution', 'Marketing', 'Finance'].map((d) => (
                                      <button key={d} type="button" onClick={() => setEditMemberDepartment(editMemberDepartment === d ? '' : d)}
                                        className={cn('px-2 py-0.5 rounded-full text-[11px] font-medium border transition-all', editMemberDepartment === d ? 'bg-[#ede9fe] text-[#4648d4] border-[#c4b5fd]' : 'bg-white text-[#6b7280] border-[#e5e7eb] hover:border-[#4648d4]/30')}
                                      >{d}</button>
                                    ))}
                                  </div>
                                  <input type="text" placeholder="Custom department..."
                                    value={editMemberDepartment}
                                    onChange={(e) => setEditMemberDepartment(e.target.value)}
                                    className="w-full h-8 px-2.5 bg-white border border-[#e5e7eb] rounded-lg text-[12px] focus:ring-2 focus:ring-[#4648d4]/10 focus:border-[#4648d4] focus:outline-none"
                                  />
                                </div>
                                <div className="flex gap-2 pt-1">
                                  <button onClick={() => handleUpdateMember(m.userId)} disabled={savingMember}
                                    className="px-3 py-1.5 bg-[#4648d4] text-white text-[12px] font-semibold rounded-lg hover:bg-[#3730a3] transition-colors disabled:opacity-40"
                                  >{savingMember ? 'Saving...' : 'Save'}</button>
                                  <button onClick={() => setEditingMemberId(null)}
                                    className="px-3 py-1.5 bg-[#f3f4f6] text-[#6b7280] text-[12px] font-semibold rounded-lg hover:bg-[#e5e7eb] transition-colors"
                                  >Cancel</button>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })
                    })()}
                    {/* Pending members (invited but not yet signed in) */}
                    {(initiative.pending ?? []).map((p) => (
                      <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#fafafa] transition-colors opacity-60">
                        <div className="w-7 h-7 rounded-full border-2 border-dashed border-[#d1d5db] flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined text-[15px] text-[#9ca3af]">person</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-[#111827] truncate">{p.email}</p>
                          <p className="text-[11px] text-[#9ca3af]">Hasn't signed in yet</p>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[#fef9c3] text-[#a16207]">Invited</span>
                      </div>
                    ))}
                  </div>

                  {/* Add member section — owners/admins only */}
                  {isOwnerOrAdmin && <div className="px-4 py-3.5" style={{ borderTop: '1px solid #f3f4f6' }}>
                    <p className="text-[12px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-3">Add Member</p>
                    <form onSubmit={handleInvite} className="space-y-3">
                      <input
                        type="email"
                        placeholder="colleague@company.com"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        className="w-full h-9 px-3 bg-white border border-[#e5e7eb] rounded-lg text-[13px] text-[#111827] focus:ring-2 focus:ring-[#4648d4]/10 focus:border-[#4648d4] focus:outline-none transition-all placeholder:text-[#c4c4c4]"
                      />
                      {/* Role pills */}
                      <div>
                        <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-1.5">Role</p>
                        <div className="flex gap-2">
                          {(['member', 'admin'] as const).map((r) => (
                            <button key={r} type="button" onClick={() => setInviteRole(r)}
                              className={cn('flex-1 h-8 text-[12px] font-semibold rounded-lg capitalize border transition-all', inviteRole === r ? 'bg-[#4648d4] text-white border-[#4648d4]' : 'bg-white text-[#6b7280] border-[#e5e7eb] hover:border-[#4648d4]/30')}
                            >{r}</button>
                          ))}
                        </div>
                      </div>
                      {/* Department */}
                      <div>
                        <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-1.5">Department / Function</p>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {['Engineering', 'Sales', 'Presales', 'Consultant', 'Solution', 'Marketing', 'Finance'].map((d) => (
                            <button key={d} type="button" onClick={() => setInviteDepartment(inviteDepartment === d ? '' : d)}
                              className={cn('px-2.5 py-1 rounded-full text-[12px] font-medium border transition-all', inviteDepartment === d ? 'bg-[#ede9fe] text-[#4648d4] border-[#c4b5fd]' : 'bg-white text-[#6b7280] border-[#e5e7eb] hover:border-[#4648d4]/30')}
                            >{d}</button>
                          ))}
                        </div>
                        <input
                          type="text"
                          placeholder="Or type a custom department..."
                          value={inviteDepartment}
                          onChange={(e) => setInviteDepartment(e.target.value)}
                          className="w-full h-8 px-3 bg-white border border-[#e5e7eb] rounded-lg text-[13px] text-[#111827] focus:ring-2 focus:ring-[#4648d4]/10 focus:border-[#4648d4] focus:outline-none transition-all placeholder:text-[#c4c4c4]"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={inviting || !inviteEmail.trim()}
                        className="w-full h-9 bg-[#4648d4] text-white rounded-lg text-[13px] font-semibold hover:bg-[#3730a3] transition-colors disabled:opacity-40"
                      >
                        {inviting ? 'Adding...' : 'Add Member'}
                      </button>
                      <p className="text-[12px] text-[#9ca3af]">They'll be added immediately and notified by email.</p>
                    </form>
                  </div>}
                </div>
              )}

              {settingsTab === 'notifications' && (
                <div className="p-4 space-y-4">
                  {/* Toggle rows */}
                  {[
                    { key: 'emailNotifications', label: 'Email Notifications', desc: 'Receive emails for activity in this initiative' },
                    { key: 'dailyReportEnabled', label: 'Daily Digest', desc: 'Send a daily summary of actions and progress' },
                  ].map(({ key, label, desc }) => (
                    <div key={key} className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <div>
                        <p className="text-[13px] font-semibold text-[#111827]">{label}</p>
                        <p className="text-[12px] text-[#9ca3af] mt-0.5">{desc}</p>
                      </div>
                      <button type="button"
                        onClick={() => setNotifSettings((s) => ({ ...s, [key]: !s[key as keyof typeof s] }))}
                        className={cn('w-9 h-5 rounded-full relative transition-all shrink-0 ml-4', notifSettings[key as keyof typeof notifSettings] ? 'bg-[#4648d4]' : 'bg-[#e5e7eb]')}
                      >
                        <div className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all', notifSettings[key as keyof typeof notifSettings] ? 'right-0.5' : 'left-0.5')} />
                      </button>
                    </div>
                  ))}

                  {notifSettings.dailyReportEnabled && (
                    <div className="pt-1">
                      <label className="block text-[11px] font-bold text-[#9ca3af] uppercase tracking-widest mb-1.5">
                        Report Time
                        <span className="normal-case font-normal ml-1">({Intl.DateTimeFormat().resolvedOptions().timeZone})</span>
                      </label>
                      <input type="time" value={notifSettings.dailyReportTime}
                        onChange={(e) => setNotifSettings((s) => ({ ...s, dailyReportTime: e.target.value }))}
                        className="w-full h-9 px-3 bg-white border border-[#e5e7eb] rounded-lg text-[14px] text-[#111827] focus:ring-2 focus:ring-[#4648d4]/10 focus:border-[#4648d4] focus:outline-none transition-all"
                      />
                      <p className="text-[12px] text-[#9ca3af] mt-1.5">Digest will be sent to all initiative members.</p>
                    </div>
                  )}

                  <button onClick={handleSaveNotifications} disabled={savingNotif}
                    className="w-full h-9 bg-[#4648d4] text-white rounded-lg text-[13px] font-semibold hover:bg-[#3730a3] transition-colors disabled:opacity-40"
                  >
                    {savingNotif ? 'Saving...' : 'Save Settings'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── AI Generate Drawer ─────────────────────────────────────────────── */}
      {aiMode && (
        <div
          className="fixed inset-0 z-[60] flex justify-end"
          style={{ background: 'rgba(0,0,0,0.18)', backdropFilter: 'blur(2px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) { setAiMode(false); setGeneratedActions([]) } }}
        >
          <div className="bg-white w-full md:w-[500px] h-full shadow-2xl flex flex-col pt-14 md:pt-0 pb-[110px] md:pb-0" style={{ borderLeft: '1px solid #f0f0f0' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: '1px solid #f3f4f6' }}>
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-[#ede9fe] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#4648d4] text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold text-[#111827] leading-none">AI Action Generator</h2>
                  <p className="text-[12px] text-[#9ca3af] mt-0.5">Paste transcript or meeting notes</p>
                </div>
              </div>
              <button onClick={() => { setAiMode(false); setGeneratedActions([]) }} className="w-7 h-7 flex items-center justify-center text-[#9ca3af] hover:text-[#111827] hover:bg-[#f3f4f6] rounded-lg transition-colors">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden">
              {generatedActions.length === 0 ? (
                <div className="p-4 flex flex-col gap-4 overflow-y-auto flex-1">
                  <textarea rows={8} placeholder="Paste your meeting transcript, notes, or voice recording text here...&#10;&#10;AI will extract action items, assign them to team members by name or department, and detect priorities and deadlines."
                    value={transcript} onChange={(e) => setTranscript(e.target.value)}
                    className="w-full bg-[#f9fafb] border border-[#e5e7eb] rounded-xl px-4 py-3 text-[14px] text-[#111827] focus:ring-2 focus:ring-[#4648d4]/10 focus:border-[#4648d4] focus:outline-none resize-none placeholder:text-[#9ca3af] leading-relaxed"
                  />
                  <button onClick={handleGenerateActions} disabled={generating || !transcript.trim()}
                    className="w-full h-10 bg-[#4648d4] text-white font-semibold rounded-xl hover:bg-[#3730a3] transition-colors disabled:opacity-40 flex items-center justify-center gap-2 text-[14px]"
                  >
                    {generating
                      ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>Extracting actions...</span></>
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
                    <button onClick={() => { setGeneratedActions([]); setEditingAiIndex(null) }} className="text-[12px] font-semibold text-[#9ca3af] hover:text-[#4648d4] transition-colors">Re-generate</button>
                  </div>
                  <div className="flex-1 overflow-y-auto divide-y divide-[#f9fafb]">
                    {generatedActions.map((action: any, i: number) => {
                      const allAssignees = [
                        { id: initiative.creator.id, name: initiative.creator.name, avatar: initiative.creator.avatar || null, role: 'owner', dept: '' },
                        ...members.filter((m) => m.userId !== initiative.creator.id).map((m) => ({ id: m.userId, name: m.user?.name, avatar: m.user?.avatar || null, role: m.role, dept: m.department || '' })),
                      ]
                      const assignedPerson = allAssignees.find((a) => a.id === action.assigneeId)
                      const isEditing = editingAiIndex === i

                      return (
                        <div key={i} className="px-4 py-4">
                          {isEditing ? (
                            <div className="space-y-3">
                              <input
                                autoFocus
                                value={action.title}
                                onChange={(e) => setGeneratedActions((acts) => acts.map((a, idx) => idx === i ? { ...a, title: e.target.value } : a))}
                                className="w-full text-[14px] font-semibold text-[#111827] focus:outline-none border-b border-[#4648d4]/30 pb-1 bg-transparent"
                              />
                              <textarea rows={2}
                                value={action.description || ''}
                                onChange={(e) => setGeneratedActions((acts) => acts.map((a, idx) => idx === i ? { ...a, description: e.target.value } : a))}
                                placeholder="Description..."
                                className="w-full text-[13px] text-[#374151] focus:outline-none bg-[#f9fafb] border border-[#e5e7eb] rounded-lg px-3 py-2 resize-none placeholder:text-[#9ca3af]"
                              />
                              {/* Priority pills */}
                              <div className="flex gap-1.5">
                                {(['low', 'medium', 'high', 'urgent'] as const).map((p) => (
                                  <button key={p} type="button"
                                    onClick={() => setGeneratedActions((acts) => acts.map((a, idx) => idx === i ? { ...a, priority: p } : a))}
                                    className={cn('px-2 py-0.5 rounded-md text-[12px] font-semibold capitalize border transition-all', action.priority === p
                                      ? p === 'urgent' ? 'bg-[#fef2f2] text-[#dc2626] border-[#fecaca]'
                                        : p === 'high' ? 'bg-[#ede9fe] text-[#4648d4] border-[#c4b5fd]'
                                        : p === 'medium' ? 'bg-[#eff6ff] text-[#2563eb] border-[#bfdbfe]'
                                        : 'bg-[#f3f4f6] text-[#6b7280] border-[#e5e7eb]'
                                      : 'bg-transparent text-[#9ca3af] border-[#f0f0f0] hover:border-[#e5e7eb]'
                                    )}
                                  >{p}</button>
                                ))}
                              </div>
                              {/* Assignee select */}
                              <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[15px] text-[#9ca3af]">person</span>
                                <select
                                  value={action.assigneeId || ''}
                                  onChange={(e) => setGeneratedActions((acts) => acts.map((a, idx) => idx === i ? { ...a, assigneeId: e.target.value } : a))}
                                  className="flex-1 h-8 px-2 bg-white border border-[#e5e7eb] rounded-lg text-[13px] text-[#374151] focus:outline-none focus:border-[#4648d4] cursor-pointer"
                                >
                                  <option value="">Unassigned</option>
                                  {allAssignees.map((a) => (
                                    <option key={a.id} value={a.id}>{a.name}{a.dept ? ` · ${a.dept}` : ''}</option>
                                  ))}
                                </select>
                              </div>
                              {/* Due date */}
                              <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[15px] text-[#9ca3af]">event</span>
                                <input type="date"
                                  value={action.dueDate ? action.dueDate.split('T')[0] : ''}
                                  onChange={(e) => setGeneratedActions((acts) => acts.map((a, idx) => idx === i ? { ...a, dueDate: e.target.value || null } : a))}
                                  className="h-8 px-2 bg-white border border-[#e5e7eb] rounded-lg text-[13px] text-[#374151] focus:outline-none focus:border-[#4648d4]"
                                />
                              </div>
                              <button type="button" onClick={() => setEditingAiIndex(null)}
                                className="text-[12px] font-semibold text-[#4648d4] hover:text-[#3730a3]">Done editing</button>
                            </div>
                          ) : (
                            <div className="flex items-start gap-3 group cursor-pointer" onClick={() => setEditingAiIndex(i)}>
                              <div className={cn('w-1.5 h-1.5 rounded-full mt-1.5 shrink-0',
                                action.priority === 'urgent' ? 'bg-[#dc2626]' : action.priority === 'high' ? 'bg-[#4648d4]' : action.priority === 'medium' ? 'bg-[#2563eb]' : 'bg-[#d1d5db]'
                              )} />
                              <div className="flex-1 min-w-0">
                                <p className="text-[14px] font-semibold text-[#111827] leading-snug">{action.title}</p>
                                {action.description && <p className="text-[12px] text-[#9ca3af] mt-0.5 line-clamp-2">{action.description}</p>}
                                <div className="flex items-center gap-3 mt-1.5">
                                  {assignedPerson && (
                                    <div className="flex items-center gap-1">
                                      <Avatar name={assignedPerson.name} avatar={assignedPerson.avatar} size="xs" />
                                      <span className="text-[12px] text-[#6b7280]">{assignedPerson.name}</span>
                                    </div>
                                  )}
                                    {action.dueDate && <span className="text-[12px] text-[#9ca3af]">{format(new Date(action.dueDate), 'MMM d')}</span>}
                                </div>
                                {action.tags?.length > 0 && (
                                  <div className="flex gap-1 flex-wrap mt-1">
                                    {action.tags.map((tag: string, ti: number) => (
                                      <span key={ti} className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-[#f3f4f6] text-[#6b7280]">#{tag}</span>
                                    ))}
                                  </div>
                                )}
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
                      {bulkSaving ? 'Saving...' : `Save All ${generatedActions.length} Actions`}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
