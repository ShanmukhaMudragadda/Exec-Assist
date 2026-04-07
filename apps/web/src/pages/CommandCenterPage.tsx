import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { format, isBefore, differenceInDays, isValid } from 'date-fns'
import AppLayout from '@/components/layout/AppLayout'
import { initiativesApi, actionsApi, membersApi, initiativeSettingsApi, tagsApi } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'

// ── Types ──────────────────────────────────────────────────────────────────────
interface Tag { id: string; name: string; color: string }
interface ActionTag { tag: Tag }
interface Action {
  id: string; actionNumber?: number | null; title: string; description?: string | null; status: string; priority: string
  dueDate?: string | null
  assignee?: { id: string; name: string; avatar?: string | null } | null
  creator: { id: string; name: string; avatar?: string | null }
  tags?: ActionTag[]
  initiative?: { id: string; title: string; status: string } | null
  initiativeId?: string | null
}
interface Member { userId: string; role: string; department?: string | null; user: { id: string; name: string; email: string; avatar?: string | null } }
interface Initiative {
  id: string; title: string; description?: string | null; status: string; priority: string
  progress: number; dueDate?: string | null
  actions: Action[]; members: Member[]
  creator: { id: string; name: string; avatar?: string | null }
  tags?: Tag[]
  pending?: { id: string; email: string; role: string; department?: string | null; createdAt: string }[]
  settings?: { emailNotifications: boolean; dailyReportEnabled: boolean; dailyReportTime: string } | null
}

// ── Design tokens ──────────────────────────────────────────────────────────────
const STATUS_BORDER: Record<string, string> = {
  'todo': '#e5e7eb', 'in-progress': '#4648d4', 'in-review': '#2563eb', 'completed': '#e5e7eb',
}
const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  'todo':        { label: 'To Do',       cls: 'bg-[#f2f4f6] text-[#6b7280]' },
  'in-progress': { label: 'In Progress', cls: 'bg-[#ede9fe] text-[#4648d4]' },
  'in-review':   { label: 'In Review',   cls: 'bg-[#eff6ff] text-[#2563eb]' },
  'completed':   { label: 'Done',        cls: 'bg-[#f0fdf4] text-[#16a34a]' },
}
const INIT_STATUS: Record<string, { cls: string; text: string }> = {
  active:    { cls: 'bg-[#ede9fe] text-[#4648d4]', text: 'Active' },
  'at-risk': { cls: 'bg-[#fef2f2] text-[#dc2626]', text: 'At Risk' },
  completed: { cls: 'bg-[#eff6ff] text-[#2563eb]', text: 'Done' },
  paused:    { cls: 'bg-[#f2f4f6] text-[#6b7280]', text: 'Paused' },
}
const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-[#dc2626]', high: 'bg-[#4648d4]', medium: 'bg-[#2563eb]', low: 'bg-[#e5e7eb]',
}

type ActionFilter = 'all' | 'open' | 'overdue' | 'completed'
type SettingsTab = 'members' | 'notifications'

// ── Helper components ──────────────────────────────────────────────────────────
function HorizBar({ pct, color = '#4648d4' }: { pct: number; color?: string }) {
  return (
    <div className="h-[3px] bg-[#f3f4f6] rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }} />
    </div>
  )
}

function Avatar({ name, avatar, size = 'sm' }: { name?: string; avatar?: string | null; size?: 'xs' | 'sm' | 'md' }) {
  const s = { xs: 'w-6 h-6 text-[10px]', sm: 'w-7 h-7 text-[11px]', md: 'w-8 h-8 text-[12px]' }[size]
  const initials = name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '?'
  if (avatar) return <img src={avatar} alt={name} className={cn('rounded-full object-cover', s)} />
  return <div className={cn('rounded-full bg-[#ede9fe] text-[#4648d4] font-bold flex items-center justify-center', s)}>{initials}</div>
}

function InlineTagInput({ value, onChange, existingTags, onCreateTag }: {
  value: string[]; onChange: (ids: string[]) => void
  existingTags: Tag[]
  onCreateTag: (name: string, color: string) => Promise<Tag>
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
      const newTag = await onCreateTag(input.trim(), tagColor)
      if (newTag) onChange([...value, newTag.id])
      setInput('')
    } finally { setCreating(false) }
  }
  return (
    <div>
      <input type="text" placeholder="Search or create tag..." value={input} onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (exact) { onChange(value.includes(exact.id) ? value.filter((id) => id !== exact.id) : [...value, exact.id]) } else { createAndAdd() } } }}
        className="w-full h-9 px-3 bg-[#f2f4f6] rounded-lg text-xs text-[#111827] focus:ring-2 focus:ring-[#4648d4]/20 focus:outline-none placeholder:text-[#9ca3af]"
      />
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {(input ? filtered : existingTags).map((tag) => {
          const sel = value.includes(tag.id)
          return (
            <button key={tag.id} type="button" onClick={() => onChange(sel ? value.filter((id) => id !== tag.id) : [...value, tag.id])}
              className={cn('px-2 py-0.5 rounded-full text-[12px] font-bold transition-all border', sel ? 'text-white border-transparent' : 'bg-white text-[#6b7280] border-[#e5e7eb] hover:border-[#4648d4]/40')}
              style={sel ? { backgroundColor: tag.color, borderColor: tag.color } : {}}
            >#{tag.name}</button>
          )
        })}
        {input && !exact && (
          <button type="button" onClick={createAndAdd} disabled={creating}
            className="px-2 py-0.5 rounded-full text-[12px] font-bold bg-[#ede9fe] text-[#4648d4] border border-[#4648d4]/20 hover:bg-[#4648d4] hover:text-white transition-all disabled:opacity-50"
          >{creating ? '...' : `+ Create "#${input.trim()}"`}</button>
        )}
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function CommandCenterPage() {
  const [searchParams] = useSearchParams()
  const initiativeId = searchParams.get('initiativeId')
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const now = new Date()

  // UI state
  const [actionFilter, setActionFilter] = useState<ActionFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [showCollabPopover, setShowCollabPopover] = useState(false)
  const [showAddAction, setShowAddAction] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('members')
  const [showUploadDropdown, setShowUploadDropdown] = useState(false)
  const [showCCDropdown, setShowCCDropdown] = useState(false)
  const [aiMode, setAiMode] = useState(false)
  const [confirmDeleteActionId, setConfirmDeleteActionId] = useState<string | null>(null)
  const [extraActions, setExtraActions] = useState<any[]>([])
  const [loadingMore, setLoadingMore] = useState(false)
  const [actionsCursor, setActionsCursor] = useState<string | null>(null)
  const [hasMoreActions, setHasMoreActions] = useState(false)

  // Bulk selection state
  const [selectedActionIds, setSelectedActionIds] = useState<Set<string>>(new Set())
  const [bulkUpdating, setBulkUpdating] = useState(false)
  const [showBulkStatusMenu, setShowBulkStatusMenu] = useState(false)
  const [showBulkPriorityMenu, setShowBulkPriorityMenu] = useState(false)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [showBulkAssigneeMenu, setShowBulkAssigneeMenu] = useState(false)
  const [showBulkInitiativeMenu, setShowBulkInitiativeMenu] = useState(false)

  // Initiative edit state
  const [showEditInitiative, setShowEditInitiative] = useState(false)
  const [editInitForm, setEditInitForm] = useState({ title: '', description: '', status: 'active', priority: 'medium', dueDate: '' })
  const [savingInitiative, setSavingInitiative] = useState(false)
  const editInitDueDateRef = useRef<HTMLInputElement>(null)

  // Action quick-edit state
  const [editingAction, setEditingAction] = useState<Action | null>(null)
  const [editActionForm, setEditActionForm] = useState({ title: '', description: '', priority: 'medium', status: 'todo', dueDate: '', assigneeId: '', tagIds: [] as string[] })
  const [savingEditAction, setSavingEditAction] = useState(false)
  const editActionDueDateRef = useRef<HTMLInputElement>(null)

  // Add action form
  const [actionForm, setActionForm] = useState({ title: '', description: '', priority: 'medium', dueDate: '', assigneeId: '', tagIds: [] as string[] })
  const [saving, setSaving] = useState(false)
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false)
  const [assigneeBtnRect, setAssigneeBtnRect] = useState<DOMRect | null>(null)
  const assigneeDropdownRef = useRef<HTMLDivElement>(null)
  const assigneeBtnRef = useRef<HTMLButtonElement>(null)
  const assigneePortalRef = useRef<HTMLDivElement>(null)
  const addActionDueDateRef = useRef<HTMLInputElement>(null)

  // AI form
  const [transcript, setTranscript] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generatedActions, setGeneratedActions] = useState<any[]>([])
  const [editingAiIndex, setEditingAiIndex] = useState<number | null>(null)
  const [bulkSaving, setBulkSaving] = useState(false)

  // Settings state
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member')
  const [inviteDepartment, setInviteDepartment] = useState('')
  const [inviting, setInviting] = useState(false)
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null)
  const [editMemberRole, setEditMemberRole] = useState<'member' | 'admin'>('member')
  const [editMemberDepartment, setEditMemberDepartment] = useState('')
  const [savingMember, setSavingMember] = useState(false)
  const [notifSettings, setNotifSettings] = useState({ emailNotifications: true, dailyReportEnabled: false, dailyReportTime: '09:00' })
  const [savingNotif, setSavingNotif] = useState(false)

  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLDivElement>(null)

  // Reset state when switching between modes
  useEffect(() => {
    setSearchQuery('')
    setTagFilter(null)
    setActionFilter('all')
    setExtraActions([])
    setActionsCursor(null)
    setHasMoreActions(false)
    setEditingAction(null)
    setShowEditInitiative(false)
    // When switching to CC mode, remove stale cached data so fresh data is always fetched
    if (!initiativeId) {
      queryClient.removeQueries({ queryKey: ['command-center'] })
    }
  }, [initiativeId])

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowUploadDropdown(false); setShowCCDropdown(false)
      }
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

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: initData, isLoading: initLoading } = useQuery({
    queryKey: ['initiative', initiativeId],
    queryFn: () => initiativesApi.get(initiativeId!).then((r) => r.data),
    enabled: !!initiativeId,
  })

  const { data: ccData, isLoading: ccLoading } = useQuery({
    queryKey: ['command-center', actionFilter, debouncedSearch],
    queryFn: () => actionsApi.getCommandCenter(undefined, actionFilter, debouncedSearch).then((r) => r.data),
    enabled: !initiativeId,
  } as any)

  const { data: allInitiativesData } = useQuery({
    queryKey: ['initiatives-list'],
    queryFn: () => initiativesApi.list().then((r) => r.data?.initiatives || []),
  })
  const allInitiatives: { id: string; title: string }[] = allInitiativesData || []

  const { data: workspaceTagsData } = useQuery({
    queryKey: ['tags-all'],
    queryFn: () => tagsApi.listAll().then((r) => r.data?.tags || []),
  })
  const workspaceTags: Tag[] = workspaceTagsData || []


  const initiative: Initiative | null = (initData as any)?.initiative || null
  const isLoading = initiativeId ? initLoading : ccLoading
  const members: Member[] = initiative?.members || []
  const allTags: Tag[] = initiative?.tags || []

  // Sync initiative pagination on load
  useEffect(() => {
    if (!initiative) return
    const meta = (initiative as any).actionsMeta
    setHasMoreActions(meta?.hasMore ?? false)
    setActionsCursor(meta?.nextCursor ?? null)
    setExtraActions([])
  }, [initiative?.id, (initiative as any)?.actionsMeta?.nextCursor])

  // Sync CC pagination on load
  useEffect(() => {
    if (!ccData || initiativeId) return
    const meta = (ccData as any)?.meta
    setHasMoreActions(meta?.hasMore ?? false)
    setActionsCursor(meta?.nextCursor ?? null)
    setExtraActions([])
  }, [(ccData as any)?.meta?.nextCursor, initiativeId])

  // debouncedSearch is only updated on Enter or suggestion select (not on every keystroke)

  // Reset CC pagination when filter or search changes
  useEffect(() => {
    if (initiativeId) return
    setExtraActions([])
    setActionsCursor(null)
    setHasMoreActions(false)
  }, [actionFilter, debouncedSearch, initiativeId])

  useEffect(() => {
    if (initiative?.settings) {
      setNotifSettings({
        emailNotifications: initiative.settings.emailNotifications,
        dailyReportEnabled: initiative.settings.dailyReportEnabled,
        dailyReportTime: initiative.settings.dailyReportTime,
      })
    }
  }, [initiative?.settings])

  // ── Derived data ───────────────────────────────────────────────────────────
  const ccMeta = (ccData as any)?.meta as { total: number; hasMore: boolean; nextCursor: string | null } | undefined
  const ccStats = (ccData as any)?.stats as { all: number; open: number; overdue: number; completed: number } | undefined

  const baseActions: Action[] = initiativeId
    ? [...(initiative?.actions || []), ...extraActions]
    : [...((ccData as any)?.actions || []), ...extraActions]

  const overdueActions = baseActions.filter((a) => a.dueDate && isBefore(new Date(a.dueDate), now) && a.status !== 'completed')
  const openActions = baseActions.filter((a) => a.status !== 'completed')

  const userRole = initiative?.creator?.id === user?.id
    ? 'owner'
    : members.find((m) => m.user.id === user?.id)?.role ?? 'member'
  const isOwnerOrAdmin = userRole === 'owner' || userRole === 'admin'
  const daysRemaining = initiative?.dueDate ? differenceInDays(new Date(initiative.dueDate), now) : null
  const progressColor = initiative?.status === 'at-risk' ? '#dc2626' : '#4648d4'

  // Search autocomplete
  const searchSuggestions = (() => {
    if (!searchQuery.trim()) return null
    const q = searchQuery.toLowerCase()
    type Suggestion = { type: 'action' | 'assignee' | 'status' | 'priority' | 'tag'; label: string; sublabel?: string; value: string }
    const seen = new Set<string>()
    const suggestions: Suggestion[] = []
    // Action number search: if query looks like a number or "A-NNN", propose A-XXXXX directly
    // (don't rely on baseActions being paginated — just format and let backend resolve)
    const numQ = parseInt(q.replace(/^a-0*/i, '').replace(/^0+/, '') || '0', 10)
    const isNumberQuery = /^(a-?\d+|\d+)$/i.test(q.trim())
    if (isNumberQuery && !isNaN(numQ) && numQ > 0) {
      const numLabel = `A-${String(numQ).padStart(5, '0')}`
      seen.add('num:' + numQ)
      suggestions.push({ type: 'action', label: numLabel, sublabel: 'Search by action number', value: numLabel })
    }
    baseActions.filter((a) => a.title.toLowerCase().includes(q)).slice(0, 4).forEach((a) => {
      if (!seen.has('a:' + a.id)) { seen.add('a:' + a.id); suggestions.push({ type: 'action', label: a.title, sublabel: a.assignee?.name, value: a.title }) }
    })
    const assigneeNames = new Map<string, string>()
    baseActions.forEach((a) => { if (a.assignee && a.assignee.name.toLowerCase().includes(q)) assigneeNames.set(a.assignee.id, a.assignee.name) })
    assigneeNames.forEach((name) => { if (!seen.has('as:' + name)) { seen.add('as:' + name); suggestions.push({ type: 'assignee', label: name, sublabel: 'Assignee', value: name }) } })
    const STATUS_DISPLAY: Record<string, string> = { 'todo': 'To Do', 'in-progress': 'In Progress', 'in-review': 'In Review', 'completed': 'Done' }
    Object.entries(STATUS_DISPLAY).forEach(([key, label]) => {
      if (label.toLowerCase().includes(q) || key.includes(q)) {
        const count = baseActions.filter((a) => a.status === key).length
        if (!seen.has('st:' + key)) { seen.add('st:' + key); suggestions.push({ type: 'status', label, sublabel: `${count} action${count !== 1 ? 's' : ''}`, value: key }) }
      }
    })
    const PRIORITY_DISPLAY: Record<string, string> = { 'urgent': 'Urgent', 'high': 'High', 'medium': 'Medium', 'low': 'Low' }
    Object.entries(PRIORITY_DISPLAY).forEach(([key, label]) => {
      if (label.toLowerCase().includes(q) || key.includes(q)) {
        const count = baseActions.filter((a) => a.priority === key).length
        if (!seen.has('pr:' + key)) { seen.add('pr:' + key); suggestions.push({ type: 'priority', label, sublabel: `${count} action${count !== 1 ? 's' : ''} · Priority`, value: label }) }
      }
    })
    if (initiativeId) {
      allTags.filter((t) => t.name.toLowerCase().includes(q)).forEach((tag) => {
        const count = baseActions.filter((a) => a.tags?.some((at) => at.tag.id === tag.id)).length
        if (!seen.has('tg:' + tag.id)) { seen.add('tg:' + tag.id); suggestions.push({ type: 'tag', label: `#${tag.name}`, sublabel: `${count} action${count !== 1 ? 's' : ''}`, value: tag.id }) }
      })
    }
    return suggestions.length ? suggestions : null
  })()

  // Filter actions for initiative mode
  const filteredInitiativeActions = (() => {
    let base: Action[]
    switch (actionFilter) {
      case 'open': base = baseActions.filter((a) => a.status !== 'completed'); break
      case 'overdue': base = overdueActions; break
      case 'completed': base = baseActions.filter((a) => a.status === 'completed'); break
      default: base = baseActions
    }
    if (tagFilter) base = base.filter((a) => a.tags?.some((at) => at.tag.id === tagFilter))
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      const numSearch = parseInt(q.replace(/^a-0*/i, '').replace(/^0+/, '') || '0', 10)
      const matchNum = !isNaN(numSearch) && numSearch > 0 ? numSearch : null
      base = base.filter((a) =>
        a.title.toLowerCase().includes(q) || a.description?.toLowerCase().includes(q) ||
        a.assignee?.name.toLowerCase().includes(q) || a.tags?.some((at) => at.tag.name.toLowerCase().includes(q)) ||
        (matchNum !== null && a.actionNumber === matchNum)
      )
    }
    return base
  })()

  // CC mode: filtering and search are server-side, baseActions is already the filtered result
  const filteredCCActions = baseActions

  // Group CC actions by initiative
  const grouped: Record<string, { initiative: any; actions: Action[] }> = {}
  filteredCCActions.forEach((action) => {
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

  // ── Handlers ───────────────────────────────────────────────────────────────
  const getActionPath = (action: Action) => {
    const iid = initiativeId || action.initiative?.id || (action as any).initiativeId
    return iid ? `/initiatives/${iid}/actions/${action.id}` : `/actions/${action.id}`
  }

  const handleLoadMore = async () => {
    if (!actionsCursor || loadingMore) return
    setLoadingMore(true)
    try {
      if (initiativeId) {
        const res = await actionsApi.listForInitiative(initiativeId, actionsCursor, actionFilter, debouncedSearch)
        const { actions: more, meta } = (res.data as any)
        setExtraActions((prev) => [...prev, ...more])
        setHasMoreActions(meta.hasMore)
        setActionsCursor(meta.nextCursor)
      } else {
        const res = await actionsApi.getCommandCenter(actionsCursor, actionFilter, debouncedSearch)
        const { actions: more, meta } = (res.data as any)
        setExtraActions((prev) => [...prev, ...more])
        setHasMoreActions(meta.hasMore)
        setActionsCursor(meta.nextCursor)
      }
    } catch {}
    finally { setLoadingMore(false) }
  }

  const handleSaveInitiative = async () => {
    if (!initiativeId || !editInitForm.title.trim()) return
    setSavingInitiative(true)
    try {
      await initiativesApi.update(initiativeId, { ...editInitForm, description: editInitForm.description || null, dueDate: editInitForm.dueDate || null })
      queryClient.invalidateQueries({ queryKey: ['initiative', initiativeId] })
      setShowEditInitiative(false)
    } catch { toast({ title: 'Failed to save', variant: 'destructive' }) }
    finally { setSavingInitiative(false) }
  }

  const openEditAction = (action: Action) => {
    setEditingAction(action)
    setEditActionForm({
      title: action.title,
      description: action.description || '',
      priority: action.priority,
      status: action.status,
      dueDate: action.dueDate?.split('T')[0] || '',
      assigneeId: action.assignee?.id || '',
      tagIds: action.tags?.map((at) => at.tag.id) || [],
    })
  }

  const handleSaveEditAction = async () => {
    if (!editingAction || !editActionForm.title.trim()) return
    setSavingEditAction(true)
    try {
      await actionsApi.update(editingAction.id, {
        title: editActionForm.title.trim(),
        description: editActionForm.description || null,
        priority: editActionForm.priority,
        status: editActionForm.status,
        dueDate: editActionForm.dueDate || null,
        assigneeId: editActionForm.assigneeId || null,
        tagIds: editActionForm.tagIds,
      })
      queryClient.invalidateQueries({ queryKey: ['initiative', initiativeId] })
      queryClient.invalidateQueries({ queryKey: ['command-center'] })
      setEditingAction(null)
    } catch { toast({ title: 'Failed to save', variant: 'destructive' }) }
    finally { setSavingEditAction(false) }
  }

  const handleAddAction = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!actionForm.title.trim()) return
    setSaving(true)
    try {
      if (initiativeId) {
        await actionsApi.create(initiativeId, { ...actionForm, dueDate: actionForm.dueDate || null, assigneeId: actionForm.assigneeId || null, tagIds: actionForm.tagIds })
        queryClient.invalidateQueries({ queryKey: ['initiative', initiativeId] })
      } else {
        await actionsApi.createStandalone({ title: actionForm.title.trim(), description: actionForm.description.trim() || undefined, priority: actionForm.priority, dueDate: actionForm.dueDate || null, tagIds: actionForm.tagIds })
        queryClient.invalidateQueries({ queryKey: ['command-center'] })
      }
      queryClient.invalidateQueries({ queryKey: ['command-center'] })
      setShowAddAction(false)
      setActionForm({ title: '', description: '', priority: 'medium', dueDate: '', assigneeId: '', tagIds: [] })
    } finally { setSaving(false) }
  }

  const handleUpdateAction = async (actionId: string, status: string) => {
    try {
      await actionsApi.update(actionId, { status })
      if (initiativeId) queryClient.invalidateQueries({ queryKey: ['initiative', initiativeId] })
      queryClient.invalidateQueries({ queryKey: ['command-center'] })
    } catch {}
  }

  const handleDeleteAction = async (actionId: string) => {
    try {
      await actionsApi.delete(actionId)
      if (initiativeId) queryClient.invalidateQueries({ queryKey: ['initiative', initiativeId] })
      queryClient.invalidateQueries({ queryKey: ['command-center'] })
      setConfirmDeleteActionId(null)
    } catch {}
  }

  const toggleSelectAction = (id: string) => {
    setSelectedActionIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectAllVisible = () => {
    const visibleIds = (initiativeId ? filteredInitiativeActions : filteredCCActions).map((a: Action) => a.id)
    setSelectedActionIds(new Set(visibleIds))
  }

  const clearSelection = () => {
    setSelectedActionIds(new Set())
    setShowBulkStatusMenu(false)
    setShowBulkPriorityMenu(false)
    setShowBulkAssigneeMenu(false)
    setShowBulkInitiativeMenu(false)
    setConfirmBulkDelete(false)
  }

  const handleBulkUpdate = async (update: { status?: string; priority?: string; assigneeId?: string | null; initiativeId?: string | null }) => {
    if (selectedActionIds.size === 0) return
    setBulkUpdating(true)
    try {
      await actionsApi.bulkUpdate([...selectedActionIds], update)
      if (initiativeId) queryClient.invalidateQueries({ queryKey: ['initiative', initiativeId] })
      queryClient.invalidateQueries({ queryKey: ['command-center'] })
      clearSelection()
    } catch {} finally { setBulkUpdating(false) }
  }

  const handleBulkDelete = async () => {
    if (selectedActionIds.size === 0) return
    setBulkUpdating(true)
    try {
      await actionsApi.bulkDelete([...selectedActionIds])
      if (initiativeId) queryClient.invalidateQueries({ queryKey: ['initiative', initiativeId] })
      queryClient.invalidateQueries({ queryKey: ['command-center'] })
      clearSelection()
    } catch {} finally { setBulkUpdating(false) }
  }

  const handleGenerateActions = async () => {
    if (!transcript.trim()) return
    setGenerating(true)
    try {
      if (initiativeId) {
        const res = await actionsApi.generateFromTranscript(initiativeId, { content: transcript })
        setGeneratedActions((res.data as any)?.actions || [])
      } else {
        const res = await actionsApi.generateStandalone(transcript)
        setGeneratedActions((res.data as any)?.actions || [])
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Failed to generate actions'
      toast({ title: 'Generation failed', description: msg, variant: 'destructive' })
    } finally {
      setGenerating(false)
    }
  }

  const handleBulkSave = async () => {
    if (!generatedActions.length) return
    setBulkSaving(true)
    try {
      if (initiativeId) {
        await actionsApi.bulkCreate(initiativeId, generatedActions)
        queryClient.invalidateQueries({ queryKey: ['initiative', initiativeId] })
      } else {
        await Promise.all(generatedActions.map((a) =>
          actionsApi.createStandalone({ title: a.title, description: a.description || undefined, priority: a.priority || 'medium', dueDate: a.dueDate || null })
        ))
        queryClient.invalidateQueries({ queryKey: ['command-center'] })
      }
      queryClient.invalidateQueries({ queryKey: ['command-center'] })
      setAiMode(false); setTranscript(''); setGeneratedActions([])
    } finally { setBulkSaving(false) }
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail.trim() || !initiativeId) return
    setInviting(true)
    try {
      await membersApi.addMember(initiativeId, { email: inviteEmail.trim(), role: inviteRole, department: inviteDepartment.trim() || undefined })
      setInviteEmail(''); setInviteDepartment(''); setInviteRole('member')
      queryClient.invalidateQueries({ queryKey: ['initiative', initiativeId] })
    } catch {}
    finally { setInviting(false) }
  }

  const handleUpdateMember = async (memberId: string) => {
    if (!initiativeId) return
    setSavingMember(true)
    try {
      await membersApi.updateMember(initiativeId, memberId, { role: editMemberRole, department: editMemberDepartment.trim() || null })
      setEditingMemberId(null)
      queryClient.invalidateQueries({ queryKey: ['initiative', initiativeId] })
    } catch {}
    finally { setSavingMember(false) }
  }

  const handleSaveNotifications = async () => {
    if (!initiativeId) return
    setSavingNotif(true)
    try {
      await initiativeSettingsApi.update(initiativeId, { emailNotifications: notifSettings.emailNotifications, dailyReportEnabled: notifSettings.dailyReportEnabled, dailyReportTime: notifSettings.dailyReportTime })
      queryClient.invalidateQueries({ queryKey: ['initiative', initiativeId] })
    } finally { setSavingNotif(false) }
  }

  // ── Loading / not found ────────────────────────────────────────────────────
  if (isLoading) {
    return <AppLayout><div className="flex items-center justify-center min-h-screen bg-[#f9fafb]"><div className="w-6 h-6 border-[3px] border-[#ede9fe] border-t-[#4648d4] rounded-full animate-spin" /></div></AppLayout>
  }
  if (initiativeId && !initiative) {
    return <AppLayout><div className="flex items-center justify-center min-h-screen bg-[#f9fafb]"><p className="text-[#6b7280] text-[14px]">Initiative not found.</p></div></AppLayout>
  }

  // ── Shared: Search bar + filter row ───────────────────────────────────────
  const searchAndFilters = (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
      <div ref={searchRef} className="relative flex-1 min-w-[180px]">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af] text-[16px]">search</span>
        <input
          className="w-full pl-8 pr-3 py-1.5 bg-white border border-[#e5e7eb] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#4648d4]/10 focus:border-[#4648d4] transition-all placeholder:text-[#c4c4c4]"
          placeholder={initiativeId ? 'Search by name, assignee, status, tag…' : 'Search actions, initiatives…'}
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); if (!e.target.value) setDebouncedSearch('') }}
          onFocus={() => setSearchFocused(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setSearchFocused(false); setSearchQuery(''); setDebouncedSearch('') }
            if (e.key === 'Enter') { setDebouncedSearch(searchQuery); setSearchFocused(false) }
          }}
        />
        {searchQuery && (
          <button onClick={() => { setSearchQuery(''); setDebouncedSearch('') }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#374151]">
            <span className="material-symbols-outlined text-[15px]">close</span>
          </button>
        )}
        {searchFocused && searchSuggestions && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-[#e5e7eb] rounded-xl shadow-lg z-30 overflow-hidden">
            <div className="py-1">
              {searchSuggestions.map((s, i) => {
                const iconMap: Record<string, string> = { action: 'task_alt', assignee: 'person', status: 'pending', priority: 'flag', tag: 'sell' }
                const colorMap: Record<string, string> = { action: '#4648d4', assignee: '#2563eb', status: '#7c3aed', priority: '#0891b2', tag: '#0f766e' }
                return (
                  <button key={i} onMouseDown={(e) => {
                    e.preventDefault()
                    if (s.type === 'status') {
                      const filterMap: Record<string, ActionFilter> = { 'completed': 'completed', 'todo': 'open', 'in-progress': 'open', 'in-review': 'open' }
                      setActionFilter(filterMap[s.value] ?? 'all')
                      setSearchQuery(''); setDebouncedSearch('')
                    } else if (s.type === 'tag') {
                      setTagFilter(s.value)
                      setSearchQuery(''); setDebouncedSearch('')
                    } else {
                      setSearchQuery(s.value); setDebouncedSearch(s.value)
                    }
                    setSearchFocused(false)
                  }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#f5f3ff] transition-colors text-left"
                  >
                    <span className="material-symbols-outlined text-[15px] shrink-0" style={{ color: colorMap[s.type], fontVariationSettings: "'FILL' 1" }}>{iconMap[s.type]}</span>
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
      {/* Filters — same tabs in both CC and initiative mode */}
      <div className="flex bg-[#f3f4f6] rounded-lg p-0.5 gap-0.5 overflow-x-auto shrink-0">
        {(['all', 'open', 'overdue', 'completed'] as ActionFilter[]).map((f) => (
          <button key={f} onClick={() => setActionFilter(f)}
            className={cn('px-2.5 py-1 text-[12px] font-semibold rounded-md transition-all capitalize shrink-0', actionFilter === f
              ? f === 'overdue' ? 'bg-[#fef2f2] text-[#dc2626] shadow-sm' : 'bg-white text-[#4648d4] shadow-sm'
              : 'text-[#9ca3af] hover:text-[#374151]'
            )}
          >
            {(() => {
              const label = f === 'all' ? 'All' : f === 'open' ? 'Open' : f === 'overdue' ? 'Overdue' : 'Done'
              if (!initiativeId) {
                // CC mode: use server-returned stats so all tabs show counts upfront
                const count = ccStats
                  ? f === 'all' ? ccStats.all : f === 'open' ? ccStats.open : f === 'overdue' ? ccStats.overdue : ccStats.completed
                  : null
                return count != null ? `${label} (${count})` : label
              }
              // Initiative mode: use server-side counts from actionsMeta
              const meta = (initiative as any)?.actionsMeta
              const count = f === 'all' ? (meta?.total ?? baseActions.length)
                : f === 'open' ? (meta?.open ?? openActions.length)
                : f === 'overdue' ? (meta?.overdue ?? overdueActions.length)
                : (meta?.completed ?? baseActions.filter((a) => a.status === 'completed').length)
              return `${label} (${count})`
            })()}
          </button>
        ))}
      </div>
    </div>
  )

  // ── Shared: Action row ─────────────────────────────────────────────────────
  const ActionRow = ({ action, showInitiativeLabel = false }: { action: Action; showInitiativeLabel?: boolean }) => {
    const isOD = action.dueDate && isBefore(new Date(action.dueDate), now) && action.status !== 'completed'
    const isDueSoon = action.dueDate && !isOD && differenceInDays(new Date(action.dueDate), now) <= 3 && action.status !== 'completed'
    const actionTags = action.tags?.map((at) => at.tag) || []
    const isSelected = selectedActionIds.has(action.id)
    const canModifyAction = isOwnerOrAdmin || action.creator?.id === user?.id || action.assignee?.id === user?.id
    return (
      <div
        className={cn('group relative flex items-start gap-0 transition-colors duration-100',
          isSelected ? 'bg-[#f5f3ff]' : 'hover:bg-[#fafafa]',
          action.status === 'completed' && 'opacity-60'
        )}
      >
        {/* Checkbox */}
        <div className="flex items-center justify-center w-7 shrink-0 self-stretch pl-2">
          <button
            onClick={(e) => { e.stopPropagation(); toggleSelectAction(action.id) }}
            className={cn('rounded flex items-center justify-center border transition-all shrink-0',
              isSelected ? 'bg-[#4648d4] border-[#4648d4]' : 'bg-white border-[#d1d5db] group-hover:border-[#4648d4]'
            )}
            style={{ width: 14, height: 14 }}
          >
            {isSelected && <span className="material-symbols-outlined text-white" style={{ fontSize: 11, fontVariationSettings: "'FILL' 1, 'wght' 700" }}>check</span>}
          </button>
        </div>
        <div className="flex-1 flex flex-col min-w-0 px-3 py-2 gap-1">
          {/* Top bar: action number + due date + actions */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', PRIORITY_DOT[action.priority] || 'bg-[#e5e7eb]')} />
              {action.actionNumber != null && (
                <span className="text-[11px] font-mono font-semibold text-[#9ca3af]">
                  A-{String(action.actionNumber).padStart(5, '0')}
                </span>
              )}
              {isOD ? (
                <span className="text-[11px] font-semibold text-[#dc2626]">{format(new Date(action.dueDate!), 'MMM d')}</span>
              ) : action.dueDate ? (
                <span className="text-[11px] text-[#9ca3af]">{format(new Date(action.dueDate), 'MMM d')}</span>
              ) : null}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {canModifyAction && action.status !== 'completed' && (
                <button onClick={(e) => { e.stopPropagation(); handleUpdateAction(action.id, 'completed') }}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-white text-[#16a34a] border border-[#16a34a] hover:bg-[#f0fdf4] active:bg-[#dcfce7] transition-colors"
                  title="Mark as complete"
                >
                  <span className="material-symbols-outlined text-[12px]">radio_button_unchecked</span>
                  Mark done
                </button>
              )}
              {canModifyAction && (
                <button onClick={(e) => { e.stopPropagation(); openEditAction(action) }}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#f3f4f6] text-[#6b7280] border border-[#e5e7eb] hover:bg-[#ede9fe] hover:text-[#4648d4] hover:border-[#c4b5fd] transition-colors"
                >
                  <span className="material-symbols-outlined text-[12px]">edit</span>
                  Edit
                </button>
              )}
            </div>
          </div>
          {/* Title */}
          <h4
            onClick={() => navigate(getActionPath(action))}
            className={cn('text-[14px] font-medium text-[#111827] truncate cursor-pointer hover:text-[#4648d4] transition-colors', action.status === 'completed' && 'line-through text-[#9ca3af]')}
          >
            {action.title}
          </h4>
          {action.description && <p className="text-[12px] text-[#9ca3af] line-clamp-1">{action.description}</p>}
          {showInitiativeLabel && action.initiative && (
            <p className="text-[11px] text-[#9ca3af]">
              <span className="inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: action.initiative.status === 'at-risk' ? '#dc2626' : '#4648d4' }} />
                {action.initiative.title}
              </span>
            </p>
          )}
          {actionTags.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {actionTags.map((tag) => (
                <span key={tag.id} className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-[#f3f4f6] text-[#6b7280]">#{tag.name}</span>
              ))}
            </div>
          )}
          {/* Bottom: assignee + status */}
          <div className="flex items-center gap-2">
            {action.assignee ? (
              <div className="flex items-center gap-1.5">
                <Avatar name={action.assignee.name} avatar={action.assignee.avatar} size="xs" />
                <span className="text-[12px] text-[#6b7280]">{action.assignee.name}</span>
              </div>
            ) : (
              <span className="text-[12px] text-[#d1d5db]">Unassigned</span>
            )}
            <span className={cn('px-1.5 py-0.5 rounded-md text-[11px] font-semibold', STATUS_BADGE[action.status]?.cls || STATUS_BADGE.todo.cls)}>
              {STATUS_BADGE[action.status]?.label || 'To Do'}
            </span>
          </div>
        </div>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="bg-[#f9fafb] min-h-screen">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        {initiativeId && initiative ? (
          /* Initiative mode header */
          <div className="bg-white border-b border-[#f0f0f0] px-4 py-4">
            <nav className="flex items-center gap-1.5 text-[12px] text-[#9ca3af] mb-2">
              <Link to="/initiatives" className="hover:text-[#4648d4] transition-colors flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">arrow_back</span>
                Initiatives
              </Link>
              <span className="text-[#e5e7eb]">/</span>
              <span className="text-[#374151] font-medium truncate max-w-[240px]">{initiative.title}</span>
            </nav>
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
                <div className="flex items-center gap-3 mt-2.5">
                  <div className="h-[3px] bg-[#f3f4f6] rounded-full w-[180px] overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${initiative.progress || 0}%`, backgroundColor: progressColor }} />
                  </div>
                  <span className="text-[12px] font-semibold text-[#6b7280] tabular-nums">{initiative.progress || 0}%</span>
                </div>
                <div className="flex items-center gap-1.5 mt-2">
                  <Avatar name={initiative.creator.name} avatar={initiative.creator.avatar || null} size="xs" />
                  <span className="text-[12px] text-[#9ca3af]">Owner:</span>
                  <span className="text-[12px] font-semibold text-[#374151]">{initiative.creator.name}</span>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {/* Collaborator avatars with workload popover */}
                {(() => {
                  const creatorInMembers = members.some((m) => m.userId === initiative.creator.id)
                  const all = [
                    ...(creatorInMembers ? [] : [{ id: initiative.creator.id, name: initiative.creator.name, avatar: initiative.creator.avatar || null, role: 'owner' }]),
                    ...members.map((m) => ({ id: m.userId, name: m.user?.name, avatar: m.user?.avatar || null, role: m.role })),
                  ]
                  const visible = all.slice(0, 5)
                  const overflow = all.length - 5
                  return (
                    <div
                      className="relative"
                      onMouseEnter={() => setShowCollabPopover(true)}
                      onMouseLeave={() => setShowCollabPopover(false)}
                    >
                      <button onClick={() => { setShowSettings(true); setSettingsTab('members') }} className="flex items-center hover:opacity-90 transition-opacity">
                        <div className="flex -space-x-2">
                          {visible.map((c) => (
                            <div key={c.id} className="ring-2 ring-white rounded-full">
                              <Avatar name={c.name} avatar={c.avatar} size="sm" />
                            </div>
                          ))}
                          {overflow > 0 && (
                            <div className="w-7 h-7 rounded-full bg-[#f2f4f6] text-[#6b7280] text-[10px] font-bold flex items-center justify-center ring-2 ring-white">+{overflow}</div>
                          )}
                        </div>
                      </button>
                      {showCollabPopover && (
                        <div className="absolute right-0 top-full mt-2 z-[200] bg-white border border-[#e5e7eb] rounded-2xl shadow-2xl overflow-hidden" style={{ minWidth: 260 }}>
                          {/* Header */}
                          <div className="px-4 py-3 bg-gradient-to-r from-[#f5f3ff] to-[#ede9fe] border-b border-[#e5e7eb]">
                            <p className="text-[12px] font-bold text-[#4648d4] tracking-wide flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>group</span>
                              Team Workload
                            </p>
                          </div>
                          {/* Members */}
                          <div className="p-2">
                            {all.map((c) => {
                              const open = baseActions.filter((a) => a.assignee?.id === c.id && a.status !== 'completed').length
                              const total = baseActions.filter((a) => a.assignee?.id === c.id).length
                              const pct = total > 0 ? Math.round((open / total) * 100) : 0
                              const barColor = open === 0 ? '#e5e7eb' : open >= 5 ? '#dc2626' : '#4648d4'
                              return (
                                <div key={c.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-[#f5f3ff] transition-colors">
                                  <div className="relative shrink-0">
                                    <Avatar name={c.name} avatar={c.avatar} size="sm" />
                                    {open > 0 && (
                                      <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#4648d4] text-white text-[8px] font-bold flex items-center justify-center leading-none">{open}</span>
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2 mb-0.5">
                                      <p className="text-[12px] font-semibold text-[#111827] truncate">{c.name}</p>
                                      <span className="text-[11px] font-semibold shrink-0" style={{ color: barColor }}>
                                        {open}<span className="text-[#c4c4c4] font-normal">/{total}</span>
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="flex-1 h-1 bg-[#f3f4f6] rounded-full overflow-hidden">
                                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                                      </div>
                                      <span className="text-[10px] text-[#9ca3af] capitalize shrink-0">{c.role}</span>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}
                {isOwnerOrAdmin && (
                  <button onClick={() => {
                    setEditInitForm({ title: initiative.title, description: initiative.description || '', status: initiative.status, priority: initiative.priority, dueDate: initiative.dueDate?.split('T')[0] || '' })
                    setShowEditInitiative(true)
                  }} className="p-1.5 text-[#9ca3af] hover:text-[#4648d4] hover:bg-[#ede9fe] rounded-lg transition-colors" title="Edit initiative">
                    <span className="material-symbols-outlined text-[20px]">edit</span>
                  </button>
                )}
                {isOwnerOrAdmin && (
                  <button onClick={() => setShowSettings(true)} className="p-1.5 text-[#9ca3af] hover:text-[#4648d4] hover:bg-[#ede9fe] rounded-lg transition-colors">
                    <span className="material-symbols-outlined text-[22px]">settings</span>
                  </button>
                )}
                {/* Split Add Action button */}
                <div ref={dropdownRef} className="relative flex">
                  <button onClick={() => setShowAddAction(true)}
                    className="px-3 py-2 bg-[#4648d4] text-white text-xs font-bold rounded-l-lg flex items-center gap-1.5 hover:bg-[#3730a3] transition-colors border-r border-[#3730a3]"
                  >
                    <span className="material-symbols-outlined text-[16px]">add</span>
                    Add Action
                  </button>
                  <button onClick={() => setShowUploadDropdown((v) => !v)}
                    className="px-1.5 py-2 bg-[#4648d4] text-white rounded-r-lg hover:bg-[#3730a3] transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">arrow_drop_down</span>
                  </button>
                  {showUploadDropdown && (
                    <div className="absolute top-full right-0 mt-1 w-48 bg-white rounded-xl shadow-xl border border-[#f0f0f0] z-50 overflow-hidden">
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
        ) : (
          /* Command Center mode header */
          <div className="bg-white border-b border-[#f0f0f0] px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <h1 className="text-[16px] font-bold text-[#111827] tracking-tight">Command Center</h1>
              <div ref={dropdownRef} className="relative flex shrink-0">
                <button onClick={() => setShowAddAction(true)}
                  className="px-3 py-2 bg-[#4648d4] text-white text-[13px] font-bold rounded-l-lg flex items-center gap-1.5 hover:bg-[#3730a3] transition-colors border-r border-[#3730a3]"
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                  Create Action
                </button>
                <button onClick={() => setShowCCDropdown((v) => !v)}
                  className="px-1.5 py-2 bg-[#4648d4] text-white rounded-r-lg hover:bg-[#3730a3] transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">arrow_drop_down</span>
                </button>
                {showCCDropdown && (
                  <div className="absolute top-full right-0 mt-1 w-52 bg-white rounded-xl shadow-xl border border-[#f0f0f0] z-50 overflow-hidden">
                    {[
                      { label: 'Generate with AI', icon: 'auto_awesome', action: () => { setShowCCDropdown(false); setAiMode(true) } },
                      { label: 'Upload from Sheets', icon: 'table_chart', action: () => { setShowCCDropdown(false); navigate('/upload?mode=sheets') } },
                      { label: 'Upload Transcript', icon: 'description', action: () => { setShowCCDropdown(false); navigate('/upload?mode=transcript') } },
                      { label: 'Live Transcript', icon: 'mic', action: () => { setShowCCDropdown(false); navigate('/upload?mode=live') } },
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
        )}

        {/* ── Content ──────────────────────────────────────────────────────── */}
        <div className="p-4 grid grid-cols-12 gap-3.5">

          {/* LEFT — Actions */}
          <section className="col-span-12 lg:col-span-8 space-y-3">
            {searchAndFilters}

            {/* Action list */}
            {initiativeId ? (
              /* Initiative mode: flat list */
              filteredInitiativeActions.length === 0 ? (
                <div className="bg-white rounded-xl border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] py-8 text-center">
                  <span className="material-symbols-outlined text-[32px] text-[#e5e7eb] block mb-2" style={{ fontVariationSettings: "'FILL' 1" }}>task_alt</span>
                  <p className="text-[13px] text-[#9ca3af] font-medium">No actions in this view</p>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden divide-y divide-[#fafafa]">
                  {filteredInitiativeActions.map((action) => <ActionRow key={action.id} action={action} />)}
                </div>
              )
            ) : (
              /* CC mode: grouped by initiative */
              groups.length === 0 ? (
                <div className="bg-white rounded-xl border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] py-16 text-center">
                  <span className="material-symbols-outlined text-[36px] text-[#e5e7eb] block mb-3" style={{ fontVariationSettings: "'FILL' 1" }}>task_alt</span>
                  <p className="text-[14px] font-medium text-[#9ca3af]">
                    {actionFilter === 'all' ? 'All caught up — no open actions.' : 'No actions match this filter.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  {groups.map(({ initiative: groupInit, actions }) => {
                    const isStandalone = groupInit.id === '__standalone__'
                    return (
                      <div key={groupInit.id}>
                        <div
                          onClick={() => !isStandalone && navigate(`/command-center?initiativeId=${groupInit.id}`)}
                          className={cn('flex items-center gap-2 mb-2', !isStandalone && 'cursor-pointer group')}
                        >
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: isStandalone ? '#9ca3af' : groupInit.status === 'at-risk' ? '#dc2626' : '#4648d4' }} />
                          <span className={cn('text-[13px] font-semibold', isStandalone ? 'text-[#6b7280]' : 'text-[#4648d4] group-hover:underline')}>
                            {groupInit.title}
                          </span>
                          {!isStandalone && groupInit.status === 'at-risk' && (
                            <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-[#fef2f2] text-[#dc2626]">At Risk</span>
                          )}
                          <span className="text-[12px] text-[#d1d5db] ml-0.5">· {actions.length}</span>
                        </div>
                        <div className="bg-white rounded-xl border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden divide-y divide-[#fafafa]">
                          {actions.map((action) => <ActionRow key={action.id} action={action} showInitiativeLabel={false} />)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            )}

            {/* Load more */}
            {hasMoreActions && (
              <button onClick={handleLoadMore} disabled={loadingMore}
                className="w-full h-10 border border-[#e5e7eb] rounded-xl text-[#6b7280] text-[13px] font-semibold hover:border-[#4648d4]/40 hover:text-[#4648d4] hover:bg-[#f5f3ff]/30 transition-all flex items-center justify-center gap-2 bg-white disabled:opacity-50"
              >
                {loadingMore ? (
                  <><div className="w-3.5 h-3.5 border-2 border-[#e5e7eb] border-t-[#4648d4] rounded-full animate-spin" />Loading...</>
                ) : (
                  <><span className="material-symbols-outlined text-[18px]">expand_more</span>Show more actions</>
                )}
              </button>
            )}

            {/* AI Generate */}
            {initiativeId && (
              <button onClick={() => setAiMode(true)}
                className="w-full h-10 border border-dashed border-[#e5e7eb] rounded-xl text-[#9ca3af] text-[13px] font-semibold hover:border-[#4648d4]/40 hover:text-[#4648d4] hover:bg-[#f5f3ff]/50 transition-all flex items-center justify-center gap-2 bg-white"
              >
                <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                Generate actions with AI
              </button>
            )}
          </section>

          {/* RIGHT — Sidebar */}
          <section className="col-span-12 lg:col-span-4 space-y-4">
            {/* Stats */}
            <div className="bg-white rounded-xl border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] p-4">
              {(searchQuery || actionFilter !== 'all' || tagFilter) && (
                <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-3">Filtered view</p>
              )}
              <div className="grid grid-cols-3 gap-3 text-center">
                {initiativeId ? (
                  <>
                    {(() => {
                      const meta = (initiative as any)?.actionsMeta
                      const total = meta?.total ?? filteredInitiativeActions.length
                      const open = meta?.open ?? filteredInitiativeActions.filter((a) => a.status !== 'completed').length
                      const overdue = meta?.overdue ?? filteredInitiativeActions.filter((a) => a.dueDate && isBefore(new Date(a.dueDate), now) && a.status !== 'completed').length
                      return (
                        <>
                          <div>
                            <p className="text-[22px] font-bold text-[#111827] tabular-nums leading-none">{total}</p>
                            <p className="text-[11px] text-[#9ca3af] uppercase tracking-widest font-semibold mt-1.5">Total</p>
                          </div>
                          <div>
                            <p className="text-[22px] font-bold text-[#4648d4] tabular-nums leading-none">{open}</p>
                            <p className="text-[11px] text-[#9ca3af] uppercase tracking-widest font-semibold mt-1.5">Open</p>
                          </div>
                          <div>
                            <p className={cn('text-[22px] font-bold tabular-nums leading-none', overdue > 0 ? 'text-[#dc2626]' : 'text-[#111827]')}>{overdue}</p>
                            <p className="text-[11px] text-[#9ca3af] uppercase tracking-widest font-semibold mt-1.5">Overdue</p>
                          </div>
                        </>
                      )
                    })()}
                  </>
                ) : (
                  <>
                    <div>
                      <p className="text-[22px] font-bold text-[#111827] tabular-nums leading-none">{ccStats?.open ?? openActions.length}</p>
                      <p className="text-[11px] text-[#9ca3af] uppercase tracking-widest font-semibold mt-1.5">Open</p>
                    </div>
                    <div>
                      <p className={cn('text-[22px] font-bold tabular-nums leading-none', (ccStats?.overdue ?? overdueActions.length) > 0 ? 'text-[#dc2626]' : 'text-[#111827]')}>{ccStats?.overdue ?? overdueActions.length}</p>
                      <p className="text-[11px] text-[#9ca3af] uppercase tracking-widest font-semibold mt-1.5">Overdue</p>
                    </div>
                    <div>
                      <p className="text-[22px] font-bold text-[#4648d4] tabular-nums leading-none">{baseActions.filter((a) => (a.assignee?.id === user?.id || (a as any).assigneeId === user?.id) && a.status !== 'completed').length}</p>
                      <p className="text-[11px] text-[#9ca3af] uppercase tracking-widest font-semibold mt-1.5">Mine</p>
                    </div>
                  </>
                )}
              </div>
              {initiativeId && (
                <div className="mt-4">
                  <HorizBar pct={initiative?.progress || 0} color={progressColor} />
                </div>
              )}
            </div>

            {/* Initiative description */}
            {initiativeId && initiative?.description && (
              <div className="bg-white rounded-xl border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] p-4">
                <h3 className="text-[12px] font-bold text-[#9ca3af] uppercase tracking-widest mb-2">About</h3>
                <p className="text-xs text-[#374151] leading-relaxed">{initiative.description}</p>
              </div>
            )}

            {/* Recent Activity */}
            <div className="bg-white rounded-xl border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="px-4 py-3 border-b border-[#f2f4f6] flex items-center justify-between">
                <h3 className="text-[12px] font-bold text-[#9ca3af] uppercase tracking-widest">Recent Activity</h3>
                <span className="text-[11px] text-[#c4c4c4]">{initiativeId ? ((initiative as any)?.actionsMeta?.total ?? baseActions.length) : (ccStats?.all ?? baseActions.length)} action{(initiativeId ? ((initiative as any)?.actionsMeta?.total ?? baseActions.length) : (ccStats?.all ?? baseActions.length)) !== 1 ? 's' : ''}</span>
              </div>
              {baseActions.length === 0 ? (
                <div className="px-4 py-8 flex flex-col items-center gap-2">
                  <span className="material-symbols-outlined text-[28px] text-[#e5e7eb]" style={{ fontVariationSettings: "'FILL' 1" }}>pending_actions</span>
                  <p className="text-[12px] text-[#9ca3af]">No activity yet</p>
                </div>
              ) : (
                <div className="relative px-4 py-2">
                  <div className="absolute left-[27px] top-4 bottom-4 w-px bg-[#f0f0f0]" />
                  <div className="space-y-0">
                    {baseActions.slice(0, 6).map((action) => {
                      const person = action.assignee || action.creator
                      const initials = person?.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '?'
                      const isDone = action.status === 'completed'
                      const isOverdue = action.dueDate && isBefore(new Date(action.dueDate), now) && !isDone
                      const iconMap: Record<string, string> = { 'completed': 'check_circle', 'in-progress': 'play_circle', 'in-review': 'rate_review', 'todo': 'radio_button_unchecked' }
                      const iconColorMap: Record<string, string> = { 'completed': '#16a34a', 'in-progress': '#4648d4', 'in-review': '#2563eb', 'todo': '#d1d5db' }
                      return (
                        <div key={action.id} onClick={() => navigate(getActionPath(action))} className="relative flex items-start gap-3 py-2.5 cursor-pointer group">
                          <div className="relative shrink-0 z-10">
                            {person?.avatar
                              ? <img src={person.avatar} alt={person.name} className="w-7 h-7 rounded-full object-cover ring-2 ring-white" />
                              : <div className="w-7 h-7 rounded-full bg-[#ede9fe] text-[#4648d4] text-[10px] font-bold flex items-center justify-center ring-2 ring-white">{initials}</div>
                            }
                            <span className="material-symbols-outlined absolute -bottom-0.5 -right-0.5 text-[12px] bg-white rounded-full"
                              style={{ color: iconColorMap[action.status] || '#d1d5db', fontVariationSettings: "'FILL' 1" }}
                            >{iconMap[action.status] || 'radio_button_unchecked'}</span>
                          </div>
                          <div className="flex-1 min-w-0 pt-0.5">
                            <p className="text-[12px] text-[#111827] leading-snug group-hover:text-[#4648d4] transition-colors">
                              <span className="font-semibold">{person?.name?.split(' ')[0] || 'Someone'}</span>
                              {' '}<span className="text-[#6b7280]">{isDone ? 'completed' : action.status === 'in-progress' ? 'is working on' : action.status === 'in-review' ? 'put in review' : 'added'}</span>
                            </p>
                            <p className="text-[12px] font-medium text-[#374151] line-clamp-1 mt-0.5 group-hover:text-[#4648d4] transition-colors">{action.title}</p>
                            {isOverdue && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-[#dc2626] mt-0.5">
                                <span className="material-symbols-outlined text-[11px]">schedule</span>
                                Overdue · {format(new Date(action.dueDate!), 'MMM d')}
                              </span>
                            )}
                            {!initiativeId && action.initiative && (
                              <p className="text-[11px] text-[#c4c4c4] mt-0.5">{action.initiative.title}</p>
                            )}
                          </div>
                          <div className={cn('w-1.5 h-1.5 rounded-full mt-2 shrink-0', PRIORITY_DOT[action.priority] || 'bg-[#e5e7eb]')} />
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

      {/* ── Add Action Pane ──────────────────────────────────────────────────── */}
      {showAddAction && (
        <div className="fixed inset-0 z-[60] flex justify-end" style={{ background: 'rgba(0,0,0,0.18)', backdropFilter: 'blur(2px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowAddAction(false) }}
        >
          <div className="bg-white w-full md:w-[440px] h-full shadow-2xl flex flex-col pt-14 md:pt-0 pb-[110px] md:pb-0" style={{ borderLeft: '1px solid #f0f0f0' }}>
            <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: '1px solid #f3f4f6' }}>
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-[#ede9fe] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#4648d4] text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>add_task</span>
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold text-[#111827] leading-none">New Action</h2>
                  <p className="text-[12px] text-[#9ca3af] mt-0.5">{initiativeId && initiative ? initiative.title : 'Standalone'}</p>
                </div>
              </div>
              <button onClick={() => setShowAddAction(false)} className="w-7 h-7 flex items-center justify-center text-[#9ca3af] hover:text-[#111827] hover:bg-[#f3f4f6] rounded-lg transition-colors">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <form onSubmit={handleAddAction} className="flex-1 flex flex-col min-h-0">
              <div className="p-4 space-y-5 flex-1 overflow-y-auto min-h-0">
                <input autoFocus type="text" placeholder="Action title..."
                  value={actionForm.title} onChange={(e) => setActionForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full text-[16px] font-semibold text-[#111827] placeholder:text-[#d1d5db] placeholder:font-normal focus:outline-none bg-transparent border-none"
                />
                <textarea rows={3} placeholder="Add a description..."
                  value={actionForm.description} onChange={(e) => setActionForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full text-[14px] text-[#374151] placeholder:text-[#d1d5db] focus:outline-none bg-transparent border-none resize-none leading-relaxed"
                />
                <div className="h-px bg-[#f3f4f6]" />
                <div className="space-y-1">
                  {/* Priority */}
                  <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-[#f9fafb]">
                    <span className="material-symbols-outlined text-[16px] text-[#9ca3af]">flag</span>
                    <span className="text-[12px] font-medium text-[#9ca3af] w-20 shrink-0">Priority</span>
                    <div className="flex gap-1 flex-1">
                      {(['low', 'medium', 'high', 'urgent'] as const).map((p) => (
                        <button key={p} type="button" onClick={() => setActionForm((f) => ({ ...f, priority: p }))}
                          className={cn('px-2 py-0.5 rounded-md text-[12px] font-semibold capitalize transition-all border', actionForm.priority === p
                            ? p === 'urgent' ? 'bg-[#fef2f2] text-[#dc2626] border-[#fecaca]'
                              : p === 'high' ? 'bg-[#ede9fe] text-[#4648d4] border-[#c4b5fd]'
                              : p === 'medium' ? 'bg-[#eff6ff] text-[#2563eb] border-[#bfdbfe]'
                              : 'bg-[#f3f4f6] text-[#6b7280] border-[#e5e7eb]'
                            : 'bg-transparent text-[#9ca3af] border-[#f0f0f0] hover:border-[#e5e7eb] hover:text-[#6b7280]'
                          )}>{p}</button>
                      ))}
                    </div>
                  </div>
                  {/* Due Date */}
                  <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-[#f9fafb]">
                    <span className="material-symbols-outlined text-[16px] text-[#9ca3af]">event</span>
                    <span className="text-[12px] font-medium text-[#9ca3af] w-20 shrink-0">Due Date</span>
                    <div className="flex items-center gap-2 flex-1">
                      <div className="relative flex items-center gap-2 cursor-pointer">
                        <span className="text-[13px] font-medium text-[#374151]">
                          {actionForm.dueDate ? format(new Date(actionForm.dueDate + 'T00:00:00'), 'MMM d, yyyy') : <span className="text-[#9ca3af]">Pick a date</span>}
                        </span>
                        <span className="material-symbols-outlined text-[16px] text-[#9ca3af] hover:text-[#4648d4] transition-colors">calendar_month</span>
                        <input type="date" value={actionForm.dueDate} onChange={(e) => setActionForm((f) => ({ ...f, dueDate: e.target.value }))} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                      </div>
                      {actionForm.dueDate && <button type="button" onClick={() => setActionForm((f) => ({ ...f, dueDate: '' }))} className="text-[#9ca3af] hover:text-[#dc2626] text-[14px] leading-none">×</button>}
                    </div>
                  </div>
                  {/* Assignee */}
                  {(initiativeId ? (initiative != null) : (user != null)) && (
                    <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-[#f9fafb]">
                      <span className="material-symbols-outlined text-[16px] text-[#9ca3af]">person</span>
                      <span className="text-[12px] font-medium text-[#9ca3af] w-20 shrink-0">Assignee</span>
                      <div className="flex-1" ref={assigneeDropdownRef}>
                        {(() => {
                          const allAssignees = initiativeId && initiative
                            ? [
                                { id: initiative.creator.id, name: initiative.creator.name, avatar: initiative.creator.avatar || null, role: 'owner' },
                                ...members.filter((m) => m.userId !== initiative.creator.id).map((m) => ({ id: m.userId, name: m.user?.name || '', avatar: m.user?.avatar || null, role: m.role })),
                              ]
                            : user ? [{ id: user.id, name: user.name, avatar: user.avatar || null, role: 'me' }] : []
                          const selected = allAssignees.find((a) => a.id === actionForm.assigneeId)
                          return (
                            <>
                              <button ref={assigneeBtnRef} type="button"
                                onClick={() => { if (!showAssigneeDropdown && assigneeBtnRef.current) setAssigneeBtnRect(assigneeBtnRef.current.getBoundingClientRect()); setShowAssigneeDropdown((v) => !v) }}
                                className="flex items-center gap-2 text-[13px] font-medium text-[#374151] hover:text-[#4648d4] transition-colors w-full"
                              >
                                {selected ? (<><Avatar name={selected.name} avatar={selected.avatar} size="xs" /><span>{selected.name}</span></>) : <span className="text-[#9ca3af]">Unassigned</span>}
                              </button>
                              {showAssigneeDropdown && assigneeBtnRect && createPortal(
                                <div ref={assigneePortalRef} style={{ position: 'fixed', top: assigneeBtnRect.bottom + 4, left: assigneeBtnRect.left, zIndex: 9999, minWidth: 220 }}
                                  className="bg-white border border-[#e5e7eb] rounded-xl shadow-xl py-1 overflow-hidden"
                                >
                                  <button onMouseDown={(e) => { e.preventDefault(); setActionForm((f) => ({ ...f, assigneeId: '' })); setShowAssigneeDropdown(false) }}
                                    className={cn('w-full flex items-center gap-2.5 px-3 py-2 text-[13px] hover:bg-[#f9fafb]', !actionForm.assigneeId ? 'text-[#4648d4] font-semibold' : 'text-[#9ca3af]')}
                                  >
                                    <div className="w-5 h-5 rounded-full border-2 border-dashed border-[#d1d5db] flex items-center justify-center shrink-0" />
                                    Unassigned
                                  </button>
                                  {allAssignees.map((a) => (
                                    <button key={a.id} onMouseDown={(e) => { e.preventDefault(); setActionForm((f) => ({ ...f, assigneeId: a.id })); setShowAssigneeDropdown(false) }}
                                      className={cn('w-full flex items-center gap-2.5 px-3 py-2 text-[13px] hover:bg-[#f9fafb]', actionForm.assigneeId === a.id ? 'bg-[#f5f3ff]' : '')}
                                    >
                                      <Avatar name={a.name} avatar={a.avatar} size="xs" />
                                      <span className={cn('flex-1 text-left', actionForm.assigneeId === a.id ? 'text-[#4648d4] font-semibold' : 'text-[#374151]')}>{a.name}</span>
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
                  )}
                </div>
                {/* Tags — always visible, workspace-level */}
                <>
                  <div className="h-px bg-[#f3f4f6]" />
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="material-symbols-outlined text-[16px] text-[#9ca3af]">label</span>
                      <span className="text-[12px] font-medium text-[#9ca3af]">Tags</span>
                    </div>
                    <InlineTagInput
                      value={actionForm.tagIds}
                      onChange={(ids) => setActionForm((f) => ({ ...f, tagIds: ids }))}
                      existingTags={workspaceTags}
                      onCreateTag={async (name, color) => {
                        const res = await tagsApi.createGlobal({ name, color })
                        queryClient.invalidateQueries({ queryKey: ['tags-all'] })
                        return (res.data as any).tag
                      }}
                    />
                  </div>
                </>
              </div>
              <div className="px-4 py-4 flex gap-2.5" style={{ borderTop: '1px solid #f3f4f6' }}>
                <button type="button" onClick={() => setShowAddAction(false)}
                  className="flex-1 h-9 text-[13px] font-semibold text-[#6b7280] border border-[#e5e7eb] rounded-lg hover:bg-[#f9fafb] transition-colors"
                >Cancel</button>
                <button type="submit" disabled={saving || !actionForm.title.trim()}
                  className="flex-1 h-9 text-[13px] font-semibold bg-[#4648d4] hover:bg-[#3730a3] text-white rounded-lg transition-colors disabled:opacity-40"
                >{saving ? 'Creating...' : 'Create Action'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Initiative Edit Pane ─────────────────────────────────────────────── */}
      {showEditInitiative && initiative && (
        <div className="fixed inset-0 z-[60] flex justify-end" style={{ background: 'rgba(0,0,0,0.18)', backdropFilter: 'blur(2px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowEditInitiative(false) }}
        >
          <div className="bg-white w-full md:w-[480px] h-full shadow-2xl flex flex-col pt-14 md:pt-0 pb-[110px] md:pb-0" style={{ borderLeft: '1px solid #f0f0f0' }}>
            <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: '1px solid #f3f4f6' }}>
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-[#ede9fe] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#4648d4] text-[16px]">edit</span>
                </div>
                <h2 className="text-[15px] font-semibold text-[#111827]">Edit Initiative</h2>
              </div>
              <button onClick={() => setShowEditInitiative(false)} className="p-1.5 text-[#9ca3af] hover:text-[#374151] rounded-lg hover:bg-[#f3f4f6] transition-colors">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-5">
              <div>
                <label className="block text-[11px] font-bold text-[#9ca3af] uppercase tracking-widest mb-1.5">Title</label>
                <input autoFocus type="text" value={editInitForm.title} onChange={(e) => setEditInitForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full text-[15px] font-semibold text-[#111827] focus:outline-none bg-transparent border-b border-[#e5e7eb] pb-1 focus:border-[#4648d4]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#9ca3af] uppercase tracking-widest mb-1.5">Description</label>
                <textarea rows={4} value={editInitForm.description} onChange={(e) => setEditInitForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Add a description..."
                  className="w-full text-[13px] text-[#374151] focus:outline-none bg-[#f9fafb] border border-[#e5e7eb] rounded-lg p-3 resize-none placeholder:text-[#c4c4c4] focus:ring-2 focus:ring-[#4648d4]/10 focus:border-[#4648d4]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#9ca3af] uppercase tracking-widest mb-2">Status</label>
                <div className="flex flex-wrap gap-1.5">
                  {(['active', 'paused', 'at-risk', 'completed'] as const).map((s) => (
                    <button key={s} type="button" onClick={() => setEditInitForm((f) => ({ ...f, status: s }))}
                      className={cn('px-3 py-1 rounded-lg text-[12px] font-semibold capitalize border transition-all', editInitForm.status === s ? 'bg-[#ede9fe] text-[#4648d4] border-[#c4b5fd]' : 'bg-white text-[#9ca3af] border-[#e5e7eb] hover:border-[#4648d4]/40')}
                    >{s === 'at-risk' ? 'At Risk' : s.charAt(0).toUpperCase() + s.slice(1)}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#9ca3af] uppercase tracking-widest mb-2">Priority</label>
                <div className="flex gap-1.5">
                  {(['low', 'medium', 'high', 'urgent'] as const).map((p) => (
                    <button key={p} type="button" onClick={() => setEditInitForm((f) => ({ ...f, priority: p }))}
                      className={cn('px-2.5 py-1 rounded-md text-[12px] font-semibold capitalize border transition-all', editInitForm.priority === p
                        ? p === 'urgent' ? 'bg-[#fef2f2] text-[#dc2626] border-[#fecaca]' : p === 'high' ? 'bg-[#ede9fe] text-[#4648d4] border-[#c4b5fd]' : p === 'medium' ? 'bg-[#eff6ff] text-[#2563eb] border-[#bfdbfe]' : 'bg-[#f3f4f6] text-[#6b7280] border-[#e5e7eb]'
                        : 'bg-white text-[#9ca3af] border-[#e5e7eb] hover:border-[#4648d4]/40'
                      )}>{p}</button>
                  ))}
                </div>
              </div>
              <div>
                <span className="block text-[11px] font-bold text-[#9ca3af] uppercase tracking-widest mb-2">Due Date</span>
                <div className="flex items-center gap-2">
                  <div className="relative flex items-center gap-2 cursor-pointer">
                    <span className="text-[13px] font-medium text-[#374151]">
                      {editInitForm.dueDate ? format(new Date(editInitForm.dueDate + 'T00:00:00'), 'MMM d, yyyy') : <span className="text-[#9ca3af]">No due date</span>}
                    </span>
                    <span className="material-symbols-outlined text-[16px] text-[#9ca3af] hover:text-[#4648d4] transition-colors">calendar_month</span>
                    <input type="date" value={editInitForm.dueDate} onChange={(e) => setEditInitForm((f) => ({ ...f, dueDate: e.target.value }))} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                  </div>
                  {editInitForm.dueDate && <button type="button" onClick={() => setEditInitForm((f) => ({ ...f, dueDate: '' }))} className="text-[#9ca3af] hover:text-[#dc2626] text-[14px]">×</button>}
                </div>
              </div>
            </div>
            <div className="px-4 py-4 flex gap-2.5" style={{ borderTop: '1px solid #f3f4f6' }}>
              <button onClick={() => setShowEditInitiative(false)}
                className="flex-1 h-9 text-[13px] font-semibold text-[#6b7280] border border-[#e5e7eb] rounded-lg hover:bg-[#f9fafb] transition-colors"
              >Cancel</button>
              <button onClick={handleSaveInitiative} disabled={savingInitiative || !editInitForm.title.trim()}
                className="flex-1 h-9 text-[13px] font-semibold bg-[#4648d4] hover:bg-[#3730a3] text-white rounded-lg transition-colors disabled:opacity-40"
              >{savingInitiative ? 'Saving...' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Action Quick-Edit Pane ───────────────────────────────────────────── */}
      {editingAction && (
        <div className="fixed inset-0 z-[60] flex justify-end" style={{ background: 'rgba(0,0,0,0.18)', backdropFilter: 'blur(2px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setEditingAction(null) }}
        >
          <div className="bg-white w-full md:w-[480px] h-full shadow-2xl flex flex-col pt-14 md:pt-0 pb-[110px] md:pb-0" style={{ borderLeft: '1px solid #f0f0f0' }}>
            <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: '1px solid #f3f4f6' }}>
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-[#ede9fe] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#4648d4] text-[16px]">edit</span>
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold text-[#111827]">Edit Action</h2>
                  {editingAction.actionNumber != null && (
                    <span className="text-[11px] font-mono font-semibold text-[#9ca3af]">A-{String(editingAction.actionNumber).padStart(5, '0')}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => navigate(getActionPath(editingAction))} className="p-1.5 text-[#9ca3af] hover:text-[#4648d4] rounded-lg hover:bg-[#f3f4f6] transition-colors" title="Open full detail page">
                  <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                </button>
                <button onClick={() => setEditingAction(null)} className="p-1.5 text-[#9ca3af] hover:text-[#374151] rounded-lg hover:bg-[#f3f4f6] transition-colors">
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">
              <input autoFocus type="text" value={editActionForm.title} onChange={(e) => setEditActionForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full text-[15px] font-semibold text-[#111827] focus:outline-none bg-transparent border-b border-[#e5e7eb] pb-1 focus:border-[#4648d4]"
                placeholder="Action title..."
              />
              <textarea rows={3} value={editActionForm.description} onChange={(e) => setEditActionForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Add a description..."
                className="w-full text-[13px] text-[#374151] focus:outline-none bg-[#f9fafb] border border-[#e5e7eb] rounded-lg p-3 resize-none placeholder:text-[#c4c4c4] focus:ring-2 focus:ring-[#4648d4]/10 focus:border-[#4648d4]"
              />
              <div className="space-y-1">
                {/* Priority */}
                <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-[#f9fafb]">
                  <span className="material-symbols-outlined text-[16px] text-[#9ca3af]">flag</span>
                  <span className="text-[12px] font-medium text-[#9ca3af] w-20 shrink-0">Priority</span>
                  <div className="flex gap-1 flex-1">
                    {(['low', 'medium', 'high', 'urgent'] as const).map((p) => (
                      <button key={p} type="button" onClick={() => setEditActionForm((f) => ({ ...f, priority: p }))}
                        className={cn('px-2 py-0.5 rounded-md text-[12px] font-semibold capitalize transition-all border', editActionForm.priority === p
                          ? p === 'urgent' ? 'bg-[#fef2f2] text-[#dc2626] border-[#fecaca]' : p === 'high' ? 'bg-[#ede9fe] text-[#4648d4] border-[#c4b5fd]' : p === 'medium' ? 'bg-[#eff6ff] text-[#2563eb] border-[#bfdbfe]' : 'bg-[#f3f4f6] text-[#6b7280] border-[#e5e7eb]'
                          : 'bg-transparent text-[#9ca3af] border-[#f0f0f0] hover:border-[#e5e7eb] hover:text-[#6b7280]'
                        )}>{p}</button>
                    ))}
                  </div>
                </div>
                {/* Status */}
                <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-[#f9fafb]">
                  <span className="material-symbols-outlined text-[16px] text-[#9ca3af]">pending</span>
                  <span className="text-[12px] font-medium text-[#9ca3af] w-20 shrink-0">Status</span>
                  <div className="flex flex-wrap gap-1 flex-1">
                    {(['todo', 'in-progress', 'in-review', 'completed'] as const).map((s) => (
                      <button key={s} type="button" onClick={() => setEditActionForm((f) => ({ ...f, status: s }))}
                        className={cn('px-2 py-0.5 rounded-md text-[11px] font-semibold transition-all border', editActionForm.status === s
                          ? cn(STATUS_BADGE[s]?.cls, 'border-transparent shadow-sm') : 'bg-transparent text-[#9ca3af] border-[#f0f0f0] hover:border-[#e5e7eb]'
                        )}>{STATUS_BADGE[s]?.label || s}</button>
                    ))}
                  </div>
                </div>
                {/* Due Date */}
                <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-[#f9fafb]">
                  <span className="material-symbols-outlined text-[16px] text-[#9ca3af]">event</span>
                  <span className="text-[12px] font-medium text-[#9ca3af] w-20 shrink-0">Due Date</span>
                  <div className="flex items-center gap-2 flex-1">
                    <div className="relative flex items-center gap-2 cursor-pointer">
                      <span className="text-[13px] font-medium text-[#374151]">
                        {editActionForm.dueDate ? format(new Date(editActionForm.dueDate + 'T00:00:00'), 'MMM d, yyyy') : <span className="text-[#9ca3af]">Pick a date</span>}
                      </span>
                      <span className="material-symbols-outlined text-[16px] text-[#9ca3af] hover:text-[#4648d4] transition-colors">calendar_month</span>
                      <input type="date" value={editActionForm.dueDate} onChange={(e) => setEditActionForm((f) => ({ ...f, dueDate: e.target.value }))} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                    </div>
                    {editActionForm.dueDate && <button type="button" onClick={() => setEditActionForm((f) => ({ ...f, dueDate: '' }))} className="text-[#9ca3af] hover:text-[#dc2626] text-[14px]">×</button>}
                  </div>
                </div>
                {/* Assignee */}
                {(() => {
                  const initData2 = editingAction.initiative?.id === initiativeId ? initiative : null
                  let assigneeList: { id: string; name: string }[] = []
                  if (initData2) {
                    assigneeList = [
                      { id: initData2.creator.id, name: initData2.creator.name },
                      ...initData2.members.filter((m) => m.userId !== initData2.creator.id).map((m) => ({ id: m.userId, name: m.user?.name || '' })),
                    ]
                  } else {
                    // CC mode: build from reliable sources already on the action
                    const seen = new Map<string, string>()
                    if (user?.id) seen.set(user.id, user.name || 'Me')
                    if (editingAction.creator?.id && !seen.has(editingAction.creator.id))
                      seen.set(editingAction.creator.id, editingAction.creator.name || '')
                    if (editingAction.assignee?.id && !seen.has(editingAction.assignee.id))
                      seen.set(editingAction.assignee.id, editingAction.assignee.name || '')
                    assigneeList = Array.from(seen.entries()).map(([id, name]) => ({ id, name }))
                  }
                  if (!assigneeList.length) return null
                  return (
                    <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-[#f9fafb]">
                      <span className="material-symbols-outlined text-[16px] text-[#9ca3af]">person</span>
                      <span className="text-[12px] font-medium text-[#9ca3af] w-20 shrink-0">Assignee</span>
                      <select value={editActionForm.assigneeId} onChange={(e) => setEditActionForm((f) => ({ ...f, assigneeId: e.target.value }))}
                        className="flex-1 text-[13px] text-[#374151] bg-transparent focus:outline-none cursor-pointer"
                      >
                        <option value="">Unassigned</option>
                        {assigneeList.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </div>
                  )
                })()}
              </div>
              {/* Tags — always visible, workspace-level */}
              <div className="h-px bg-[#f3f4f6]" />
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-[16px] text-[#9ca3af]">label</span>
                  <span className="text-[12px] font-medium text-[#9ca3af]">Tags</span>
                </div>
                <InlineTagInput
                  value={editActionForm.tagIds}
                  onChange={(ids) => setEditActionForm((f) => ({ ...f, tagIds: ids }))}
                  existingTags={workspaceTags}
                  onCreateTag={async (name, color) => {
                    const res = await tagsApi.createGlobal({ name, color })
                    queryClient.invalidateQueries({ queryKey: ['tags-all'] })
                    return (res.data as any).tag
                  }}
                />
              </div>
            </div>
            <div className="px-4 py-4 flex gap-2.5" style={{ borderTop: '1px solid #f3f4f6' }}>
              <button onClick={() => setEditingAction(null)}
                className="flex-1 h-9 text-[13px] font-semibold text-[#6b7280] border border-[#e5e7eb] rounded-lg hover:bg-[#f9fafb] transition-colors"
              >Cancel</button>
              <button onClick={handleSaveEditAction} disabled={savingEditAction || !editActionForm.title.trim()}
                className="flex-1 h-9 text-[13px] font-semibold bg-[#4648d4] hover:bg-[#3730a3] text-white rounded-lg transition-colors disabled:opacity-40"
              >{savingEditAction ? 'Saving...' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── AI Generate Pane ─────────────────────────────────────────────────── */}
      {aiMode && (
        <div className="fixed inset-0 z-[60] flex justify-end" style={{ background: 'rgba(0,0,0,0.18)', backdropFilter: 'blur(2px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) { setAiMode(false); setTranscript(''); setGeneratedActions([]) } }}
        >
          <div className="bg-white w-full md:w-[520px] h-full shadow-2xl flex flex-col pt-14 md:pt-0 pb-[110px] md:pb-0" style={{ borderLeft: '1px solid #f0f0f0' }}>
            <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: '1px solid #f3f4f6' }}>
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-[#ede9fe] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#4648d4] text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold text-[#111827] leading-none">Generate with AI</h2>
                  <p className="text-[12px] text-[#9ca3af] mt-0.5">Paste a transcript or meeting notes</p>
                </div>
              </div>
              <button onClick={() => { setAiMode(false); setTranscript(''); setGeneratedActions([]) }}
                className="w-7 h-7 flex items-center justify-center text-[#9ca3af] hover:text-[#111827] hover:bg-[#f3f4f6] rounded-lg transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="flex-1 flex flex-col min-h-0 p-4 gap-4">
              {generatedActions.length === 0 ? (
                <>
                  <textarea
                    rows={10} placeholder="Paste transcript, meeting notes, or describe what needs to be done..."
                    value={transcript} onChange={(e) => setTranscript(e.target.value)}
                    className="flex-1 w-full p-3 bg-[#f9fafb] border border-[#e5e7eb] rounded-xl text-[13px] text-[#374151] focus:outline-none focus:ring-2 focus:ring-[#4648d4]/10 focus:border-[#4648d4] resize-none placeholder:text-[#c4c4c4]"
                  />
                  <button onClick={handleGenerateActions} disabled={generating || !transcript.trim()}
                    className="w-full h-10 bg-[#4648d4] text-white rounded-xl text-[13px] font-bold hover:bg-[#3730a3] transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {generating ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Generating...</> : <><span className="material-symbols-outlined text-[18px]">auto_awesome</span>Generate Actions</>}
                  </button>
                </>
              ) : (
                <>
                  <div className="flex-1 overflow-y-auto min-h-0 space-y-2">
                    {generatedActions.map((a, i) => (
                      <div key={i} className="bg-white border border-[#f0f0f0] rounded-xl p-3">
                        {editingAiIndex === i ? (
                          <div className="space-y-2">
                            <input value={a.title} onChange={(e) => setGeneratedActions((prev) => prev.map((x, j) => j === i ? { ...x, title: e.target.value } : x))}
                              className="w-full text-[13px] font-medium text-[#111827] border-b border-[#e5e7eb] focus:outline-none pb-1 bg-transparent"
                            />
                            <div className="flex gap-1">
                              {(['low', 'medium', 'high', 'urgent'] as const).map((p) => (
                                <button key={p} type="button" onClick={() => setGeneratedActions((prev) => prev.map((x, j) => j === i ? { ...x, priority: p } : x))}
                                  className={cn('px-2 py-0.5 rounded-md text-[11px] font-semibold capitalize border', a.priority === p ? 'bg-[#ede9fe] text-[#4648d4] border-[#c4b5fd]' : 'bg-[#f3f4f6] text-[#9ca3af] border-transparent')}
                                >{p}</button>
                              ))}
                            </div>
                            <button onClick={() => setEditingAiIndex(null)} className="text-[12px] font-semibold text-[#4648d4]">Done</button>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-medium text-[#111827]">{a.title}</p>
                              {a.description && <p className="text-[12px] text-[#9ca3af] mt-0.5 line-clamp-2">{a.description}</p>}
                              <div className="flex items-center gap-2 mt-1.5">
                                <span className={cn('text-[11px] font-semibold px-1.5 py-0.5 rounded capitalize',
                                  a.priority === 'urgent' ? 'bg-[#fef2f2] text-[#dc2626]' : a.priority === 'high' ? 'bg-[#ede9fe] text-[#4648d4]' : a.priority === 'medium' ? 'bg-[#eff6ff] text-[#2563eb]' : 'bg-[#f3f4f6] text-[#6b7280]'
                                )}>{a.priority || 'medium'}</span>
                                {a.dueDate && (() => { const d = new Date(a.dueDate); return isValid(d) ? <span className="text-[11px] text-[#9ca3af]">{format(d, 'MMM d')}</span> : null })()}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button onClick={() => setEditingAiIndex(i)} className="p-1 text-[#9ca3af] hover:text-[#4648d4] transition-colors">
                                <span className="material-symbols-outlined text-[15px]">edit</span>
                              </button>
                              <button onClick={() => setGeneratedActions((prev) => prev.filter((_, j) => j !== i))} className="p-1 text-[#9ca3af] hover:text-[#dc2626] transition-colors">
                                <span className="material-symbols-outlined text-[15px]">delete</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2.5">
                    <button onClick={() => { setGeneratedActions([]); setTranscript('') }}
                      className="flex-1 h-9 text-[13px] font-semibold text-[#6b7280] border border-[#e5e7eb] rounded-lg hover:bg-[#f9fafb] transition-colors"
                    >Regenerate</button>
                    <button onClick={handleBulkSave} disabled={bulkSaving}
                      className="flex-1 h-9 text-[13px] font-semibold bg-[#4648d4] hover:bg-[#3730a3] text-white rounded-lg transition-colors disabled:opacity-40"
                    >{bulkSaving ? 'Saving...' : `Save ${generatedActions.length} Actions`}</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Settings Pane (initiative mode only) ────────────────────────────── */}
      {showSettings && initiativeId && initiative && (
        <div className="fixed inset-0 z-[60] flex justify-end" style={{ background: 'rgba(0,0,0,0.18)', backdropFilter: 'blur(2px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowSettings(false) }}
        >
          <div className="bg-white w-full md:w-[400px] h-full shadow-2xl flex flex-col pt-14 md:pt-0 pb-[110px] md:pb-0" style={{ borderLeft: '1px solid #f0f0f0' }}>
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
            <div className="flex px-4" style={{ borderBottom: '1px solid #f3f4f6' }}>
              {(['members', 'notifications'] as SettingsTab[]).map((tab) => (
                <button key={tab} onClick={() => setSettingsTab(tab)}
                  className={cn('py-3 px-1 mr-5 text-[12px] font-semibold border-b-2 -mb-px transition-all capitalize', settingsTab === tab ? 'border-[#4648d4] text-[#4648d4]' : 'border-transparent text-[#9ca3af] hover:text-[#6b7280]')}
                >{tab}</button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto">
              {settingsTab === 'members' && (
                <div>
                  <div className="divide-y divide-[#f9fafb]">
                    {(() => {
                      const creatorIsMember = members.some((m) => m.userId === initiative.creator.id)
                      const rows = creatorIsMember
                        ? members
                        : [{ userId: initiative.creator.id, role: 'owner', department: null, user: { id: initiative.creator.id, name: initiative.creator.name, email: '', avatar: initiative.creator.avatar || null } } as Member, ...members]
                      return rows.map((m) => {
                        const isEditing = editingMemberId === m.userId
                        const canEdit = isOwnerOrAdmin && m.role !== 'owner'
                        return (
                          <div key={m.userId} className="px-4 py-2.5 hover:bg-[#fafafa]">
                            <div className="flex items-center gap-3 group/member">
                              <Avatar name={m.user?.name} avatar={m.user?.avatar} size="sm" />
                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-semibold text-[#111827] truncate">{m.user?.name}</p>
                                {m.user?.email && <p className="text-[12px] text-[#9ca3af] truncate">{m.user.email}</p>}
                                {m.department && !isEditing && <p className="text-[11px] text-[#9ca3af] mt-0.5">{m.department}</p>}
                              </div>
                              <span className={cn('text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full', m.role === 'owner' ? 'bg-[#ede9fe] text-[#4648d4]' : m.role === 'admin' ? 'bg-[#eff6ff] text-[#2563eb]' : 'bg-[#f3f4f6] text-[#6b7280]')}>{m.role}</span>
                              {canEdit && !isEditing && (
                                <button onClick={() => { setEditingMemberId(m.userId); setEditMemberRole(m.role as 'member' | 'admin'); setEditMemberDepartment(m.department || '') }}
                                  className="opacity-0 group-hover/member:opacity-100 text-[#9ca3af] hover:text-[#4648d4] transition-all p-1 rounded"
                                ><span className="material-symbols-outlined text-[15px]">edit</span></button>
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
                                  <input type="text" placeholder="Custom department..." value={editMemberDepartment} onChange={(e) => setEditMemberDepartment(e.target.value)}
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
                    {(initiative.pending ?? []).map((p) => (
                      <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 opacity-60">
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
                  {isOwnerOrAdmin && (
                    <div className="px-4 py-3.5" style={{ borderTop: '1px solid #f3f4f6' }}>
                      <p className="text-[12px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-3">Add Member</p>
                      <form onSubmit={handleInvite} className="space-y-3">
                        <input type="email" placeholder="colleague@company.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
                          className="w-full h-9 px-3 bg-white border border-[#e5e7eb] rounded-lg text-[13px] focus:ring-2 focus:ring-[#4648d4]/10 focus:border-[#4648d4] focus:outline-none transition-all placeholder:text-[#c4c4c4]"
                        />
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
                        <div>
                          <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-1.5">Department / Function</p>
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {['Engineering', 'Sales', 'Presales', 'Consultant', 'Solution', 'Marketing', 'Finance'].map((d) => (
                              <button key={d} type="button" onClick={() => setInviteDepartment(inviteDepartment === d ? '' : d)}
                                className={cn('px-2.5 py-1 rounded-full text-[12px] font-medium border transition-all', inviteDepartment === d ? 'bg-[#ede9fe] text-[#4648d4] border-[#c4b5fd]' : 'bg-white text-[#6b7280] border-[#e5e7eb] hover:border-[#4648d4]/30')}
                              >{d}</button>
                            ))}
                          </div>
                          <input type="text" placeholder="Or type a custom department..." value={inviteDepartment} onChange={(e) => setInviteDepartment(e.target.value)}
                            className="w-full h-8 px-3 bg-white border border-[#e5e7eb] rounded-lg text-[13px] focus:ring-2 focus:ring-[#4648d4]/10 focus:border-[#4648d4] focus:outline-none transition-all placeholder:text-[#c4c4c4]"
                          />
                        </div>
                        <button type="submit" disabled={inviting || !inviteEmail.trim()}
                          className="w-full h-9 bg-[#4648d4] text-white rounded-lg text-[13px] font-semibold hover:bg-[#3730a3] transition-colors disabled:opacity-40"
                        >{inviting ? 'Adding...' : 'Add Member'}</button>
                        <p className="text-[12px] text-[#9ca3af]">They'll be added immediately and notified by email.</p>
                      </form>
                    </div>
                  )}
                </div>
              )}
              {settingsTab === 'notifications' && (
                <div className="p-4 space-y-4">
                  {[
                    { key: 'emailNotifications', label: 'Email Notifications', desc: 'Receive emails for activity in this initiative' },
                    { key: 'dailyReportEnabled', label: 'Daily Digest', desc: 'Send a daily summary of actions and progress' },
                  ].map(({ key, label, desc }) => (
                    <div key={key} className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <div>
                        <p className="text-[13px] font-semibold text-[#111827]">{label}</p>
                        <p className="text-[12px] text-[#9ca3af] mt-0.5">{desc}</p>
                      </div>
                      <button type="button" onClick={() => setNotifSettings((s) => ({ ...s, [key]: !s[key as keyof typeof s] }))}
                        className={cn('w-9 h-5 rounded-full relative transition-all shrink-0 ml-4', notifSettings[key as keyof typeof notifSettings] ? 'bg-[#4648d4]' : 'bg-[#e5e7eb]')}
                      >
                        <div className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all', notifSettings[key as keyof typeof notifSettings] ? 'right-0.5' : 'left-0.5')} />
                      </button>
                    </div>
                  ))}
                  {notifSettings.dailyReportEnabled && (
                    <div>
                      <p className="text-[12px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-2">Report Time</p>
                      <input type="time" value={notifSettings.dailyReportTime} onChange={(e) => setNotifSettings((s) => ({ ...s, dailyReportTime: e.target.value }))}
                        className="h-9 px-3 bg-white border border-[#e5e7eb] rounded-lg text-[13px] focus:ring-2 focus:ring-[#4648d4]/10 focus:border-[#4648d4] focus:outline-none"
                      />
                    </div>
                  )}
                  <button onClick={handleSaveNotifications} disabled={savingNotif}
                    className="w-full h-9 bg-[#4648d4] text-white rounded-lg text-[13px] font-semibold hover:bg-[#3730a3] transition-colors disabled:opacity-40"
                  >{savingNotif ? 'Saving...' : 'Save Settings'}</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* ── Bulk Action Toolbar (Gmail-style top bar) ────────────────────────── */}
      <div
        className={cn('fixed left-0 right-0 md:left-[216px] z-[70]', selectedActionIds.size === 0 && 'pointer-events-none')}
        style={{
          top: 'var(--content-pt)',
          transform: selectedActionIds.size > 0 ? 'translateY(0)' : 'translateY(calc(-100% - var(--content-pt)))',
          transition: 'transform 0.25s ease-out',
        }}
      >
        <div className="bg-white border-b border-[#e5e7eb] shadow-md px-4 py-2 flex items-center gap-2 flex-wrap">
          {/* Count + select all */}
          <span className="material-symbols-outlined text-[#4648d4] text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_box</span>
          <span className="text-[13px] font-semibold text-[#111827]">{selectedActionIds.size} selected</span>
          <button onClick={selectAllVisible} className="text-[11px] text-[#4648d4] hover:text-[#3730a3] transition-colors underline underline-offset-2 mr-2">
            Select all
          </button>

          {/* Status quick actions */}
          <button onClick={() => handleBulkUpdate({ status: 'completed' })} disabled={bulkUpdating}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[#f0fdf4] text-[#16a34a] border border-[#bbf7d0] hover:bg-[#dcfce7] transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
            Mark Done
          </button>
          <button onClick={() => handleBulkUpdate({ status: 'in-progress' })} disabled={bulkUpdating}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[#ede9fe] text-[#4648d4] border border-[#c4b5fd] hover:bg-[#ddd6fe] transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>play_circle</span>
            In Progress
          </button>
          <button onClick={() => handleBulkUpdate({ status: 'todo' })} disabled={bulkUpdating}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[#f3f4f6] text-[#6b7280] border border-[#e5e7eb] hover:bg-[#e5e7eb] transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[12px]">radio_button_unchecked</span>
            To Do
          </button>

          {/* Priority */}
          <div className="relative">
            <button onClick={() => { setShowBulkPriorityMenu((v) => !v); setShowBulkAssigneeMenu(false) }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[#f3f4f6] text-[#374151] border border-[#e5e7eb] hover:bg-[#e5e7eb] transition-colors"
            >
              <span className="material-symbols-outlined text-[12px]">flag</span>
              Priority
              <span className="material-symbols-outlined text-[11px]">expand_more</span>
            </button>
            {showBulkPriorityMenu && (
              <div className="absolute top-full mt-1 left-0 bg-white rounded-xl shadow-xl border border-[#e5e7eb] overflow-hidden w-36 z-10">
                {(['urgent', 'high', 'medium', 'low'] as const).map((p) => (
                  <button key={p} onClick={() => { handleBulkUpdate({ priority: p }); setShowBulkPriorityMenu(false) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[12px] font-medium text-[#374151] hover:bg-[#f5f3ff] hover:text-[#4648d4] transition-colors"
                  >
                    <span className={cn('w-2 h-2 rounded-full', { urgent: 'bg-[#dc2626]', high: 'bg-[#f97316]', medium: 'bg-[#eab308]', low: 'bg-[#6b7280]' }[p])} />
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Assignee */}
          <div className="relative">
            {(() => {
              const bulkAssignees = initiativeId && initiative
                ? [{ id: initiative.creator.id, name: initiative.creator.name, avatar: initiative.creator.avatar || null }, ...members.filter((m) => m.userId !== initiative.creator.id).map((m) => ({ id: m.userId, name: m.user?.name || '', avatar: m.user?.avatar || null }))]
                : user ? [{ id: user.id, name: user.name, avatar: user.avatar || null }] : []
              return (
                <>
                  <button onClick={() => { setShowBulkAssigneeMenu((v) => !v); setShowBulkPriorityMenu(false) }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[#f3f4f6] text-[#374151] border border-[#e5e7eb] hover:bg-[#e5e7eb] transition-colors"
                  >
                    <span className="material-symbols-outlined text-[12px]">person</span>
                    Assignee
                    <span className="material-symbols-outlined text-[11px]">expand_more</span>
                  </button>
                  {showBulkAssigneeMenu && (
                    <div className="absolute top-full mt-1 left-0 bg-white rounded-xl shadow-xl border border-[#e5e7eb] overflow-hidden w-44 z-10">
                      <button onClick={() => { handleBulkUpdate({ assigneeId: null }); setShowBulkAssigneeMenu(false) }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-[#9ca3af] hover:bg-[#f5f3ff] hover:text-[#4648d4] transition-colors"
                      >
                        <span className="material-symbols-outlined text-[14px]">person_off</span>
                        Unassign
                      </button>
                      {bulkAssignees.map((a) => (
                        <button key={a.id} onClick={() => { handleBulkUpdate({ assigneeId: a.id }); setShowBulkAssigneeMenu(false) }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-[12px] font-medium text-[#374151] hover:bg-[#f5f3ff] hover:text-[#4648d4] transition-colors"
                        >
                          {a.avatar
                            ? <img src={a.avatar} className="w-5 h-5 rounded-full object-cover" />
                            : <div className="w-5 h-5 rounded-full bg-[#ede9fe] text-[#4648d4] text-[9px] font-bold flex items-center justify-center">{a.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}</div>
                          }
                          {a.name}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )
            })()}
          </div>

          {/* Initiative */}
          <div className="relative">
            <button onClick={() => { setShowBulkInitiativeMenu((v) => !v); setShowBulkPriorityMenu(false); setShowBulkAssigneeMenu(false) }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[#f3f4f6] text-[#374151] border border-[#e5e7eb] hover:bg-[#e5e7eb] transition-colors"
            >
              <span className="material-symbols-outlined text-[12px]">folder</span>
              Initiative
              <span className="material-symbols-outlined text-[11px]">expand_more</span>
            </button>
            {showBulkInitiativeMenu && (
              <div className="absolute top-full mt-1 left-0 bg-white rounded-xl shadow-xl border border-[#e5e7eb] overflow-hidden w-52 z-10 max-h-60 overflow-y-auto">
                <button onClick={() => { handleBulkUpdate({ initiativeId: null }); setShowBulkInitiativeMenu(false) }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-[#9ca3af] hover:bg-[#f5f3ff] hover:text-[#4648d4] transition-colors"
                >
                  <span className="material-symbols-outlined text-[14px]">folder_off</span>
                  No Initiative
                </button>
                {allInitiatives.map((ini) => (
                  <button key={ini.id} onClick={() => { handleBulkUpdate({ initiativeId: ini.id }); setShowBulkInitiativeMenu(false) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[12px] font-medium text-[#374151] hover:bg-[#f5f3ff] hover:text-[#4648d4] transition-colors text-left"
                  >
                    <span className="material-symbols-outlined text-[14px] text-[#4648d4] shrink-0">folder</span>
                    <span className="truncate">{ini.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1" />

          {/* Delete */}
          {confirmBulkDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[#dc2626] font-medium">Delete {selectedActionIds.size} actions?</span>
              <button onClick={handleBulkDelete} disabled={bulkUpdating}
                className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[#dc2626] text-white hover:bg-[#b91c1c] transition-colors disabled:opacity-50"
              >{bulkUpdating ? '...' : 'Confirm'}</button>
              <button onClick={() => setConfirmBulkDelete(false)}
                className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[#f3f4f6] text-[#6b7280] border border-[#e5e7eb] hover:bg-[#e5e7eb] transition-colors"
              >Cancel</button>
            </div>
          ) : (
            <button onClick={() => setConfirmBulkDelete(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[#fef2f2] text-[#dc2626] border border-[#fecaca] hover:bg-[#fee2e2] transition-colors"
            >
              <span className="material-symbols-outlined text-[12px]">delete</span>
              Delete
            </button>
          )}

          {/* Clear */}
          <button onClick={clearSelection}
            className="w-6 h-6 flex items-center justify-center rounded-md bg-[#f3f4f6] text-[#9ca3af] border border-[#e5e7eb] hover:bg-[#e5e7eb] hover:text-[#374151] transition-colors shrink-0 ml-1"
          >
            <span className="material-symbols-outlined text-[14px]">close</span>
          </button>
        </div>
      </div>
    </AppLayout>
  )
}
