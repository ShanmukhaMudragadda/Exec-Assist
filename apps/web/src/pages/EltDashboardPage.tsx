import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, CartesianGrid, Legend,
} from 'recharts'
import AppLayout from '@/components/layout/AppLayout'
import { eltApi } from '@/services/api'
import { useToast } from '@/hooks/use-toast'
import { format, isBefore, differenceInDays } from 'date-fns'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface InitiativeSummary {
  id: string; title: string; status: string; priority: string; progress: number
  dueDate: string | null; createdAt: string
  ownerName: string; ownerAvatar: string | null
  memberCount: number; actionCount: number; completedCount: number
  openCount: number; overdueCount: number; riskScore: number
}
interface ActionItem {
  id: string; title: string; status: string; priority: string
  dueDate: string | null; createdAt: string; updatedAt: string
  ageDays: number; daysSinceUpdate: number
  initiative: { id: string; title: string } | null
  assignees: { id: string; name: string; avatar: string | null }[]
}
interface MemberWorkload {
  id: string; name: string; avatar: string | null; department: string | null
  assigned: number; open: number; overdue: number; completed: number
  avgAgeDays: number; staleCount: number
}
interface EltSummary {
  initiatives: InitiativeSummary[]
  actionCounts: { total: number; open: number; overdue: number; completed: number }
  overdueActions: ActionItem[]
  statusFunnel: Record<string, number>
  priorityDistribution: Record<string, number>
  memberWorkload: MemberWorkload[]
  staleActions: ActionItem[]
  longRunningActions: ActionItem[]
  onTimeRate: number | null
  unassignedHighPriority: number
  dueSoon: number
}
interface UserWorkload {
  user: { id: string; name: string; avatar: string | null; email: string }
  actions: (ActionItem & { isStale: boolean; isOverdue: boolean })[]
}

// ── Design tokens ─────────────────────────────────────────────────────────────

const DARK = {
  page: '#070c1b',
  surface: '#0c1428',
  surfaceHover: '#0f1935',
  border: 'rgba(99,102,241,0.15)',
  borderBright: 'rgba(99,102,241,0.35)',
  text: '#e2e8f0',
  muted: '#64748b',
  subtle: '#1e2a45',
}

// 3-color palette: indigo (primary), green (success), red (danger)
const C = {
  indigo: '#818cf8',
  green:  '#34d399',
  red:    '#f87171',
}

const PRIORITY_COLOR: Record<string, string> = {
  urgent: C.red, high: C.red, medium: C.indigo, low: DARK.muted,
}

const STATUS_COLOR: Record<string, string> = {
  active: C.green, 'at-risk': C.red, paused: C.indigo,
  completed: C.green, archived: DARK.muted, 'on-hold': C.indigo,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(iso: string | null) {
  if (!iso) return '—'
  return format(new Date(iso), 'MMM d, yy')
}

function daysTo(iso: string | null): number | null {
  if (!iso) return null
  return differenceInDays(new Date(iso), new Date())
}

function riskLabel(score: number): { label: string; color: string } {
  if (score === 0) return { label: 'Low', color: C.green }
  if (score <= 4)  return { label: 'Medium', color: C.indigo }
  return { label: 'High', color: C.red }
}

// ── Shared dark components ────────────────────────────────────────────────────

function Card({ children, className = '', style = {} }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={cn('rounded-xl overflow-hidden', className)}
      style={{
        background: DARK.surface,
        border: `1px solid ${DARK.border}`,
        boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

function CardHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="px-5 py-4" style={{ borderBottom: `1px solid ${DARK.subtle}` }}>
      <h3 className="text-sm font-semibold" style={{ color: DARK.text }}>{title}</h3>
      {subtitle && <p className="text-xs mt-0.5" style={{ color: DARK.muted }}>{subtitle}</p>}
    </div>
  )
}

function Avatar({ name, avatar, size = 6 }: { name: string; avatar?: string | null; size?: number }) {
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  const cls = `w-${size} h-${size} rounded-full object-cover ring-1 ring-white/10`
  return avatar
    ? <img src={avatar} alt={name} title={name} className={cls} />
    : <div title={name} className={`w-${size} h-${size} rounded-full flex items-center justify-center text-[9px] font-bold ring-1 ring-white/10`} style={{ background: '#4648d4', color: '#fff' }}>{initials}</div>
}

function StatusDot({ status }: { status: string }) {
  return <span className="w-1.5 h-1.5 rounded-full shrink-0 inline-block" style={{ background: STATUS_COLOR[status] ?? DARK.muted }} />
}

function PriorityBadge({ priority }: { priority: string }) {
  const color = PRIORITY_COLOR[priority] ?? DARK.muted
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold capitalize" style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}>
      {priority}
    </span>
  )
}

const CHART_TOOLTIP_STYLE = {
  background: '#0c1428',
  border: `1px solid rgba(99,102,241,0.25)`,
  borderRadius: 8,
  color: '#e2e8f0',
  fontSize: 12,
  boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
}

// ── Tab nav ───────────────────────────────────────────────────────────────────

type Tab = 'pulse' | 'portfolio' | 'team' | 'risk'
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'pulse',     label: 'Executive Pulse',       icon: 'monitoring' },
  { id: 'portfolio', label: 'Portfolio Intelligence', icon: 'rocket_launch' },
  { id: 'team',      label: 'Team Performance',       icon: 'groups' },
  { id: 'risk',      label: 'Risk & Alerts',          icon: 'crisis_alert' },
]

// ── KPI tile ──────────────────────────────────────────────────────────────────

function KpiTile({ label, value, color, icon, sub }: {
  label: string; value: string | number; color: string; icon: string; sub?: string
}) {
  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-2 relative overflow-hidden"
      style={{
        background: DARK.surface,
        border: `1px solid ${DARK.border}`,
        boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
      }}
    >
      <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl" style={{ background: `linear-gradient(90deg, transparent, ${color}60, transparent)` }} />
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: DARK.muted }}>{label}</span>
        <span className="material-symbols-outlined text-[16px]" style={{ color }}>{icon}</span>
      </div>
      <div className="text-4xl font-black tabular-nums leading-none" style={{ color }}>
        {value}
      </div>
      {sub && <div className="text-[11px]" style={{ color: DARK.muted }}>{sub}</div>}
    </div>
  )
}

// ── Tab 1: Executive Pulse ────────────────────────────────────────────────────

function PulseTab({ data }: { data: EltSummary }) {
  const { actionCounts, statusFunnel, priorityDistribution, initiatives, onTimeRate, unassignedHighPriority, dueSoon } = data

  const completionRate = actionCounts.total > 0
    ? Math.round((actionCounts.completed / actionCounts.total) * 100) : 0
  const atRiskCount = initiatives.filter(i => i.status === 'at-risk' || i.riskScore > 8).length

  const chartData = [...initiatives]
    .sort((a, b) => b.actionCount - a.actionCount)
    .slice(0, 10)
    .map(i => ({
      name: i.title.length > 16 ? i.title.slice(0, 14) + '…' : i.title,
      Open: Math.max(0, i.openCount - i.overdueCount),
      Overdue: i.overdueCount,
      Done: i.completedCount,
    }))

  const priorityData = [
    { name: 'Urgent', count: priorityDistribution.urgent ?? 0, color: C.red },
    { name: 'High',   count: priorityDistribution.high ?? 0,   color: C.red },
    { name: 'Medium', count: priorityDistribution.medium ?? 0, color: C.indigo },
    { name: 'Low',    count: priorityDistribution.low ?? 0,    color: DARK.muted },
  ]

  const funnelTotal = Object.values(statusFunnel).reduce((s, v) => s + v, 0)
  const funnelStages = [
    { key: 'todo',        label: 'To Do',       color: DARK.muted },
    { key: 'in-progress', label: 'In Progress', color: C.indigo },
    { key: 'in-review',   label: 'In Review',   color: C.indigo },
    { key: 'completed',   label: 'Completed',   color: C.green },
  ]

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiTile label="Completion Rate"     value={`${completionRate}%`}                            color={C.green}  icon="check_circle" sub={`${actionCounts.completed} of ${actionCounts.total} actions`} />
        <KpiTile label="On-Time Delivery"    value={onTimeRate != null ? `${onTimeRate}%` : 'N/A'}   color={C.green}  icon="schedule"     sub="Completed before due date" />
        <KpiTile label="Overdue Actions"     value={actionCounts.overdue}                            color={actionCounts.overdue > 0 ? C.red : C.green}   icon="alarm"       sub="Require immediate attention" />
        <KpiTile label="At-Risk Initiatives" value={atRiskCount}                                     color={atRiskCount > 0 ? C.red : C.green}            icon="warning"     sub="High risk score or at-risk" />
        <KpiTile label="Due This Week"       value={dueSoon}                                         color={C.indigo} icon="event"        sub="Actions due in next 7 days" />
        <KpiTile label="Unassigned Critical" value={unassignedHighPriority}                         color={unassignedHighPriority > 0 ? C.red : C.green} icon="person_off"  sub="Urgent/high with no owner" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stacked bar */}
        <Card className="lg:col-span-2">
          <CardHeader title="Initiative Action Health" subtitle="Open · Overdue · Completed per initiative (top 10 by volume)" />
          <div className="p-4">
            {chartData.length === 0 ? (
              <div className="h-52 flex items-center justify-center text-sm" style={{ color: DARK.muted }}>No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: -22, bottom: 44 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={DARK.subtle} vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: DARK.muted, fontSize: 10 }} angle={-35} textAnchor="end" interval={0} axisLine={{ stroke: DARK.subtle }} tickLine={false} />
                  <YAxis tick={{ fill: DARK.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                  <Legend wrapperStyle={{ fontSize: 11, color: DARK.muted, paddingTop: 4 }} />
                  <Bar dataKey="Open"    stackId="a" fill={C.indigo} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Overdue" stackId="a" fill={C.red}    radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Done"    stackId="a" fill={C.green}  radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* Status funnel */}
        <Card>
          <CardHeader title="Action Pipeline" subtitle="Distribution across stages" />
          <div className="p-5 space-y-3">
            {funnelStages.map(({ key, label, color }) => {
              const count = statusFunnel[key] ?? 0
              const pct = funnelTotal > 0 ? Math.round((count / funnelTotal) * 100) : 0
              return (
                <div key={key} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span style={{ color: DARK.text }}>{label}</span>
                    <span className="tabular-nums" style={{ color }}>{count} <span style={{ color: DARK.muted }}>({pct}%)</span></span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: DARK.subtle }}>
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      {/* Priority chart + risk spotlight */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Open Actions by Priority" subtitle="Where effort is concentrated" />
          <div className="p-4">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart layout="vertical" data={priorityData} margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={DARK.subtle} horizontal={false} />
                <XAxis type="number" tick={{ fill: DARK.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" tick={{ fill: DARK.text, fontSize: 12 }} width={56} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={20}>
                  {priorityData.map(entry => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Risk Spotlight" subtitle="Initiatives requiring leadership attention" />
          <div className="divide-y" style={{ borderColor: DARK.subtle }}>
            {[...data.initiatives]
              .filter(i => i.riskScore > 0 || i.status === 'at-risk')
              .sort((a, b) => b.riskScore - a.riskScore)
              .slice(0, 5)
              .map(init => {
                const risk = riskLabel(init.riskScore)
                const days = daysTo(init.dueDate)
                return (
                  <div key={init.id} className="px-5 py-3 flex items-start gap-3">
                    <div className="mt-1 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: risk.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate" style={{ color: DARK.text }}>{init.title}</span>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: `${risk.color}18`, color: risk.color, border: `1px solid ${risk.color}30` }}>
                          {risk.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: DARK.muted }}>
                        <span>{init.overdueCount} overdue</span>
                        <span>{init.openCount} open</span>
                        {days != null && (
                          <span style={{ color: days < 0 ? C.red : days < 14 ? C.indigo : DARK.muted, fontWeight: days < 0 ? 600 : 400 }}>
                            {days < 0 ? `${Math.abs(days)}d past due` : `${days}d left`}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-bold tabular-nums" style={{ color: risk.color }}>{init.riskScore}</div>
                      <div className="text-[9px]" style={{ color: DARK.muted }}>risk pts</div>
                    </div>
                  </div>
                )
              })}
            {data.initiatives.filter(i => i.riskScore > 0 || i.status === 'at-risk').length === 0 && (
              <div className="px-5 py-8 text-center text-sm" style={{ color: DARK.muted }}>
                <span className="material-symbols-outlined text-[32px] block mb-2" style={{ color: C.green }}>verified</span>
                All initiatives are on track
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

// ── Tab 2: Portfolio Intelligence ─────────────────────────────────────────────

function PortfolioTab({ data }: { data: EltSummary }) {
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortKey, setSortKey] = useState<'riskScore' | 'overdueCount' | 'progress' | 'actionCount'>('riskScore')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const statuses = ['all', ...Array.from(new Set(data.initiatives.map(i => i.status)))]

  const filtered = data.initiatives
    .filter(i => statusFilter === 'all' || i.status === statusFilter)
    .sort((a, b) => {
      if (sortKey === 'progress') return a.progress - b.progress
      return (b as any)[sortKey] - (a as any)[sortKey]
    })

  const thCls = 'px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest'

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1.5 flex-wrap">
          {statuses.map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize"
              style={{
                background: statusFilter === s ? C.indigo : DARK.surface,
                color: statusFilter === s ? '#fff' : DARK.muted,
                border: `1px solid ${statusFilter === s ? C.indigo : DARK.border}`,
              }}
            >{s}</button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs" style={{ color: DARK.muted }}>Sort:</span>
          <select value={sortKey} onChange={e => setSortKey(e.target.value as typeof sortKey)}
            className="text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1"
            style={{ background: DARK.surface, color: DARK.text, border: `1px solid ${DARK.border}` }}
          >
            <option value="riskScore">Risk Score</option>
            <option value="overdueCount">Most Overdue</option>
            <option value="progress">Lowest Progress</option>
            <option value="actionCount">Most Actions</option>
          </select>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: `1px solid ${DARK.subtle}`, background: '#080e1f' }}>
                <th className={thCls} style={{ color: DARK.muted }}>Initiative</th>
                <th className={thCls} style={{ color: DARK.muted }}>Owner</th>
                <th className={thCls} style={{ color: DARK.muted }}>Status</th>
                <th className={thCls} style={{ color: DARK.muted }}>Risk</th>
                <th className={cn(thCls, 'min-w-[130px]')} style={{ color: DARK.muted }}>Progress</th>
                <th className={cn(thCls, 'text-right')} style={{ color: DARK.muted }}>Open</th>
                <th className={cn(thCls, 'text-right')} style={{ color: DARK.muted }}>Overdue</th>
                <th className={cn(thCls, 'text-right')} style={{ color: DARK.muted }}>Done</th>
                <th className={thCls} style={{ color: DARK.muted }}>Deadline</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="text-center py-10 text-sm" style={{ color: DARK.muted }}>No initiatives match</td></tr>
              )}
              {filtered.map(init => {
                const risk = riskLabel(init.riskScore)
                const days = daysTo(init.dueDate)
                const pct = init.actionCount > 0
                  ? Math.round((init.completedCount / init.actionCount) * 100)
                  : init.progress
                const progColor = pct >= 70 ? C.green : pct >= 40 ? C.indigo : C.red
                const initOverdue = data.overdueActions.filter(a => a.initiative?.id === init.id).slice(0, 5)
                const isExp = expandedId === init.id

                return [
                  <tr key={init.id}
                    onClick={() => setExpandedId(isExp ? null : init.id)}
                    className="cursor-pointer transition-colors"
                    style={{ borderBottom: `1px solid ${DARK.subtle}` }}
                    onMouseEnter={e => (e.currentTarget.style.background = DARK.surfaceHover)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td className="px-4 py-3 max-w-[180px]">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[13px]" style={{ color: DARK.muted }}>
                          {isExp ? 'expand_less' : 'chevron_right'}
                        </span>
                        <span className="font-medium truncate" style={{ color: DARK.text }}>{init.title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Avatar name={init.ownerName} avatar={init.ownerAvatar} size={6} />
                        <span className="text-xs truncate max-w-[70px]" style={{ color: DARK.muted }}>{init.ownerName.split(' ')[0]}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5 text-xs font-medium capitalize">
                        <StatusDot status={init.status} />
                        <span style={{ color: STATUS_COLOR[init.status] ?? DARK.muted }}>{init.status}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ background: `${risk.color}15`, color: risk.color, border: `1px solid ${risk.color}30` }}>
                        {risk.label} · {init.riskScore}
                      </span>
                    </td>
                    <td className="px-4 py-3 min-w-[130px]">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: DARK.subtle }}>
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: progColor }} />
                        </div>
                        <span className="text-[10px] w-7 text-right tabular-nums" style={{ color: progColor }}>{pct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-xs tabular-nums" style={{ color: DARK.muted }}>{init.openCount}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-xs font-bold tabular-nums" style={{ color: init.overdueCount > 0 ? C.red : DARK.muted }}>
                        {init.overdueCount}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs tabular-nums" style={{ color: C.green }}>{init.completedCount}</td>
                    <td className="px-4 py-3 text-xs">
                      {days == null ? <span style={{ color: DARK.muted }}>—</span>
                        : days < 0 ? <span className="font-semibold" style={{ color: C.red }}>{Math.abs(days)}d overdue</span>
                        : days <= 7 ? <span className="font-semibold" style={{ color: C.indigo }}>{days}d left</span>
                        : <span style={{ color: DARK.muted }}>{fmt(init.dueDate)}</span>}
                    </td>
                  </tr>,
                  isExp && (
                    <tr key={`${init.id}-exp`} style={{ background: '#09112a', borderBottom: `1px solid ${DARK.subtle}` }}>
                      <td colSpan={9} className="px-8 py-3">
                        {initOverdue.length === 0
                          ? <p className="text-xs italic" style={{ color: DARK.muted }}>No overdue actions in this initiative</p>
                          : (
                            <div className="space-y-2">
                              <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: C.red }}>Overdue Actions</p>
                              {initOverdue.map(a => (
                                <div key={a.id} className="flex items-center gap-3 text-xs">
                                  <span className="material-symbols-outlined text-[13px]" style={{ color: C.red }}>alarm</span>
                                  <span className="font-medium flex-1 truncate" style={{ color: DARK.text }}>{a.title}</span>
                                  <PriorityBadge priority={a.priority} />
                                  <span className="font-semibold shrink-0" style={{ color: C.red }}>{fmt(a.dueDate)}</span>
                                  <div className="flex -space-x-1">
                                    {a.assignees.slice(0, 3).map(u => <Avatar key={u.id} name={u.name} avatar={u.avatar} />)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                      </td>
                    </tr>
                  ),
                ]
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

// ── Tab 3: Team Performance ───────────────────────────────────────────────────

function TeamTab({ data }: { data: EltSummary }) {
  const { toast } = useToast()
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [actionFilter, setActionFilter] = useState<'all' | 'overdue' | 'stale' | 'in-progress'>('all')

  const { data: workloadData, isLoading } = useQuery<UserWorkload>({
    queryKey: ['elt-workload', selectedUserId],
    queryFn: () => eltApi.getUserWorkload(selectedUserId!).then(r => r.data),
    enabled: !!selectedUserId,
    onError: () => toast({ title: 'Failed to load member detail', variant: 'destructive' }),
  } as any)

  const selected = selectedUserId ? data.memberWorkload.find(m => m.id === selectedUserId) : null

  const topCompletors = [...data.memberWorkload].sort((a, b) => b.completed - a.completed).slice(0, 5)

  const filteredActions = workloadData?.actions.filter(a => {
    if (actionFilter === 'overdue')     return a.isOverdue
    if (actionFilter === 'stale')       return a.isStale
    if (actionFilter === 'in-progress') return a.status === 'in-progress'
    return true
  }) ?? []

  const thCls = 'px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest'

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top performers */}
        <Card>
          <CardHeader title="Top Performers" subtitle="Most actions completed" />
          <div className="divide-y" style={{ borderColor: DARK.subtle }}>
            {topCompletors.map((m, i) => (
              <div key={m.id} className="px-5 py-3 flex items-center gap-3">
                <div className="text-base font-bold tabular-nums w-5 text-center" style={{ color: i === 0 ? C.green : DARK.muted }}>
                  {i + 1}
                </div>
                <Avatar name={m.name} avatar={m.avatar} size={7} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: DARK.text }}>{m.name}</div>
                  <div className="text-xs" style={{ color: DARK.muted }}>{m.department ?? 'No dept'}</div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold tabular-nums" style={{ color: C.green }}>{m.completed}</div>
                  <div className="text-[9px]" style={{ color: DARK.muted }}>done</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Workload table */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader title="Workload Overview" subtitle="Click a member to drill into their actions" />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${DARK.subtle}`, background: '#080e1f' }}>
                    {['Member', 'Dept', 'Open', 'Overdue', 'Done', 'Avg Age', 'Stale'].map(h => (
                      <th key={h} className={thCls} style={{ color: DARK.muted }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.memberWorkload.map(m => (
                    <tr key={m.id} onClick={() => setSelectedUserId(m.id === selectedUserId ? null : m.id)}
                      className="cursor-pointer transition-colors"
                      style={{
                        borderBottom: `1px solid ${DARK.subtle}`,
                        background: selectedUserId === m.id ? DARK.surfaceHover : 'transparent',
                        outline: selectedUserId === m.id ? `1px solid ${DARK.borderBright}` : 'none',
                      }}
                      onMouseEnter={e => { if (selectedUserId !== m.id) e.currentTarget.style.background = DARK.surfaceHover }}
                      onMouseLeave={e => { if (selectedUserId !== m.id) e.currentTarget.style.background = 'transparent' }}
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <Avatar name={m.name} avatar={m.avatar} size={6} />
                          <span className="text-xs font-medium" style={{ color: DARK.text }}>{m.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-xs" style={{ color: DARK.muted }}>{m.department ?? '—'}</td>
                      <td className="px-4 py-2.5 text-xs tabular-nums text-center" style={{ color: DARK.text }}>{m.open}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="text-xs font-bold tabular-nums" style={{ color: m.overdue > 0 ? C.red : DARK.muted }}>{m.overdue}</span>
                      </td>
                      <td className="px-4 py-2.5 text-xs tabular-nums text-center" style={{ color: C.green }}>{m.completed}</td>
                      <td className="px-4 py-2.5 text-xs tabular-nums text-center" style={{ color: m.avgAgeDays > 14 ? C.indigo : DARK.muted }}>{m.avgAgeDays}d</td>
                      <td className="px-4 py-2.5 text-center">
                        {m.staleCount > 0
                          ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${C.indigo}20`, color: C.indigo, border: `1px solid ${C.indigo}30` }}>{m.staleCount}</span>
                          : <span style={{ color: DARK.muted }}>—</span>}
                      </td>
                    </tr>
                  ))}
                  {data.memberWorkload.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-8 text-sm" style={{ color: DARK.muted }}>No assigned actions found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>

      {/* Member detail */}
      {selectedUserId && (
        <Card>
          <div className="px-5 py-4 flex items-center justify-between gap-4 flex-wrap" style={{ borderBottom: `1px solid ${DARK.subtle}` }}>
            <div className="flex items-center gap-3">
              {selected && <Avatar name={selected.name} avatar={selected.avatar} size={8} />}
              <div>
                <h3 className="text-sm font-semibold" style={{ color: DARK.text }}>{selected?.name}</h3>
                <p className="text-xs" style={{ color: DARK.muted }}>
                  {selected?.department} · {selected?.assigned} assigned · {selected?.open} open · {selected?.overdue} overdue · avg {selected?.avgAgeDays}d age
                </p>
              </div>
            </div>
            <div className="flex gap-1.5">
              {(['all', 'overdue', 'stale', 'in-progress'] as const).map(f => (
                <button key={f} onClick={() => setActionFilter(f)}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all capitalize"
                  style={{
                    background: actionFilter === f ? C.indigo : DARK.subtle,
                    color: actionFilter === f ? '#fff' : DARK.muted,
                  }}
                >{f === 'in-progress' ? 'In Progress' : f.charAt(0).toUpperCase() + f.slice(1)}</button>
              ))}
            </div>
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center py-10" style={{ color: DARK.muted }}>
              <span className="material-symbols-outlined animate-spin text-[28px] mr-2">progress_activity</span> Loading…
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${DARK.subtle}`, background: '#080e1f' }}>
                    {['Action', 'Initiative', 'Status', 'Priority', 'Due Date', 'Age', 'Last Update'].map(h => (
                      <th key={h} className={thCls} style={{ color: DARK.muted }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredActions.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-8 text-sm" style={{ color: DARK.muted }}>No actions match</td></tr>
                  )}
                  {filteredActions.map(a => (
                    <tr key={a.id} style={{ borderBottom: `1px solid ${DARK.subtle}` }}
                      onMouseEnter={e => (e.currentTarget.style.background = DARK.surfaceHover)}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td className="px-4 py-2.5 max-w-[200px]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate" style={{ color: DARK.text }}>{a.title}</span>
                          {a.isStale && <span className="text-[9px] font-bold px-1 py-0.5 rounded" style={{ background: `${C.indigo}20`, color: C.indigo, border: `1px solid ${C.indigo}30` }}>STALE</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-xs max-w-[120px] truncate" style={{ color: DARK.muted }}>
                        {a.initiative?.title ?? <span className="italic">Standalone</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <StatusDot status={a.status} />
                          <span className="text-xs capitalize" style={{ color: DARK.text }}>{a.status.replace('-', ' ')}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5"><PriorityBadge priority={a.priority} /></td>
                      <td className="px-4 py-2.5 text-xs">
                        <span style={{ color: a.isOverdue ? C.red : DARK.muted, fontWeight: a.isOverdue ? 600 : 400 }}>{fmt(a.dueDate)}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="text-xs font-semibold tabular-nums" style={{ color: a.ageDays > 30 ? C.red : a.ageDays > 14 ? C.indigo : DARK.muted }}>{a.ageDays}d</span>
                      </td>
                      <td className="px-4 py-2.5 text-center text-xs tabular-nums" style={{ color: DARK.muted }}>{a.daysSinceUpdate}d ago</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

// ── Tab 4: Risk & Alerts ──────────────────────────────────────────────────────

function RiskTab({ data }: { data: EltSummary }) {
  const [view, setView] = useState<'overdue' | 'stale' | 'longrunning'>('overdue')
  const [initFilter, setInitFilter] = useState('all')

  const initiatives = Array.from(
    new Map(
      [...data.overdueActions, ...data.staleActions, ...data.longRunningActions]
        .filter(a => a.initiative)
        .map(a => [a.initiative!.id, a.initiative!])
    ).values()
  )

  const sourceMap = { overdue: data.overdueActions, stale: data.staleActions, longrunning: data.longRunningActions }
  const filtered = sourceMap[view].filter(a => initFilter === 'all' || a.initiative?.id === initFilter)

  const nearDeadline = data.initiatives
    .filter(i => {
      const days = daysTo(i.dueDate)
      return days != null && days >= 0 && days <= 14 && i.progress < 60
    })
    .sort((a, b) => (daysTo(a.dueDate) ?? 999) - (daysTo(b.dueDate) ?? 999))

  const thCls = 'px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest'

  return (
    <div className="space-y-6">
      {/* Alert banners */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: DARK.surface, border: `1px solid ${C.red}25` }}>
          <span className="material-symbols-outlined text-[22px]" style={{ color: C.red }}>alarm</span>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: C.red }}>Overdue Actions</div>
            <div className="text-3xl font-black tabular-nums" style={{ color: C.red }}>{data.actionCounts.overdue}</div>
            <div className="text-xs mt-1" style={{ color: DARK.muted }}>Require immediate action</div>
          </div>
        </div>
        <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: DARK.surface, border: `1px solid ${C.red}25` }}>
          <span className="material-symbols-outlined text-[22px]" style={{ color: C.red }}>person_off</span>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: C.red }}>Unassigned Critical</div>
            <div className="text-3xl font-black tabular-nums" style={{ color: C.red }}>{data.unassignedHighPriority}</div>
            <div className="text-xs mt-1" style={{ color: DARK.muted }}>Urgent/high with no owner</div>
          </div>
        </div>
        <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: DARK.surface, border: `1px solid ${C.indigo}25` }}>
          <span className="material-symbols-outlined text-[22px]" style={{ color: C.indigo }}>schedule</span>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: C.indigo }}>Stale (14d+)</div>
            <div className="text-3xl font-black tabular-nums" style={{ color: C.indigo }}>{data.staleActions.length}</div>
            <div className="text-xs mt-1" style={{ color: DARK.muted }}>Open, no recent activity</div>
          </div>
        </div>
      </div>

      {/* Near-deadline initiatives */}
      {nearDeadline.length > 0 && (
        <Card>
          <CardHeader title="Near-Deadline Initiatives" subtitle="Due within 14 days with less than 60% progress" />
          <div className="divide-y" style={{ borderColor: DARK.subtle }}>
            {nearDeadline.map(init => {
              const days = daysTo(init.dueDate)!
              const pct = init.actionCount > 0 ? Math.round((init.completedCount / init.actionCount) * 100) : init.progress
              const urgentColor = days <= 3 ? C.red : C.indigo
              return (
                <div key={init.id} className="px-5 py-3 flex items-center gap-4">
                  <div className="w-1 h-10 rounded-full shrink-0" style={{ background: urgentColor }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: DARK.text }}>{init.title}</div>
                    <div className="flex items-center gap-3 mt-1">
                      <div className="flex-1 max-w-[140px] h-1.5 rounded-full overflow-hidden" style={{ background: DARK.subtle }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: C.red }} />
                      </div>
                      <span className="text-xs" style={{ color: C.red }}>{pct}% done</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-bold tabular-nums" style={{ color: urgentColor }}>{days}d</div>
                    <div className="text-[9px]" style={{ color: DARK.muted }}>remaining</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs" style={{ color: C.red }}>{init.overdueCount} overdue</div>
                    <div className="text-xs" style={{ color: DARK.muted }}>{init.memberCount} members</div>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Action lists */}
      <Card>
        <div className="px-5 py-3.5 flex items-center gap-3 flex-wrap" style={{ borderBottom: `1px solid ${DARK.subtle}` }}>
          <div className="flex gap-1.5">
            {[
              { key: 'overdue',     label: `Overdue (${data.overdueActions.length})`,          accent: C.red },
              { key: 'stale',       label: `Stale 14d+ (${data.staleActions.length})`,         accent: C.indigo },
              { key: 'longrunning', label: `Long-Running (${data.longRunningActions.length})`, accent: C.indigo },
            ].map(({ key, label, accent }) => (
              <button key={key} onClick={() => setView(key as typeof view)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: view === key ? `${accent}20` : DARK.subtle,
                  color: view === key ? accent : DARK.muted,
                  border: `1px solid ${view === key ? accent + '40' : 'transparent'}`,
                }}
              >{label}</button>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <select value={initFilter} onChange={e => setInitFilter(e.target.value)}
              className="text-xs rounded-lg px-2 py-1.5 focus:outline-none"
              style={{ background: DARK.surface, color: DARK.text, border: `1px solid ${DARK.border}` }}
            >
              <option value="all">All Initiatives</option>
              {initiatives.map(i => <option key={i.id} value={i.id}>{i.title}</option>)}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: `1px solid ${DARK.subtle}`, background: '#080e1f' }}>
                {['Action', 'Initiative', 'Assignees', 'Priority', view === 'overdue' ? 'Days Overdue' : view === 'stale' ? 'Days Since Update' : 'Days Open', 'Due Date'].map(h => (
                  <th key={h} className={thCls} style={{ color: DARK.muted }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="text-center py-10 text-sm" style={{ color: DARK.muted }}>
                  <span className="material-symbols-outlined text-[28px] block mb-1" style={{ color: C.green }}>verified</span>
                  No actions found — this is good!
                </td></tr>
              )}
              {filtered.map(a => {
                const metricValue = view === 'overdue'
                  ? (a.dueDate ? Math.abs(differenceInDays(new Date(a.dueDate), new Date())) : '—')
                  : view === 'stale' ? a.daysSinceUpdate
                  : a.ageDays
                const metricColor = Number(metricValue) > 30 ? C.red : C.indigo
                return (
                  <tr key={a.id} style={{ borderBottom: `1px solid ${DARK.subtle}` }}
                    onMouseEnter={e => (e.currentTarget.style.background = DARK.surfaceHover)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td className="px-4 py-2.5 font-medium max-w-[200px] truncate" style={{ color: DARK.text }}>{a.title}</td>
                    <td className="px-4 py-2.5 text-xs max-w-[120px] truncate" style={{ color: DARK.muted }}>
                      {a.initiative?.title ?? <span className="italic">Standalone</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      {a.assignees.length === 0
                        ? <span className="text-xs italic" style={{ color: DARK.muted }}>Unassigned</span>
                        : <div className="flex -space-x-1">{a.assignees.slice(0, 4).map(u => <Avatar key={u.id} name={u.name} avatar={u.avatar} />)}</div>}
                    </td>
                    <td className="px-4 py-2.5"><PriorityBadge priority={a.priority} /></td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="text-sm font-bold tabular-nums" style={{ color: metricColor }}>{metricValue}d</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: isBefore(new Date(a.dueDate ?? '9999'), new Date()) ? C.red : DARK.muted }}>{fmt(a.dueDate)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EltDashboardPage() {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<Tab>('pulse')

  const { data, isLoading } = useQuery<EltSummary>({
    queryKey: ['elt-summary'],
    queryFn: () => eltApi.getSummary().then(r => r.data),
    onError: () => toast({ title: 'Failed to load ELT data', variant: 'destructive' }),
    staleTime: 2 * 60 * 1000,
  } as any)

  if (isLoading || !data) {
    return (
      <AppLayout>
        <div style={{ background: DARK.page, minHeight: '100vh' }} className="flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <span className="material-symbols-outlined text-[40px] animate-spin" style={{ color: C.indigo }}>progress_activity</span>
            <p className="text-sm font-medium" style={{ color: DARK.muted }}>Loading executive data…</p>
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div style={{ background: DARK.page, minHeight: '100vh' }}>
        <div className="max-w-12xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-1">
              <span className="material-symbols-outlined text-[20px]" style={{ color: C.indigo }}>bar_chart_4_bars</span>
              <h1 className="text-2xl font-black tracking-tight" style={{ color: DARK.text }}>
                ELT Dashboard
              </h1>
            </div>
            <p className="text-sm" style={{ color: DARK.muted }}>
              Executive intelligence · {data.initiatives.length} initiatives · {data.memberWorkload.length} active members · {format(new Date(), 'MMM d, yyyy')}
            </p>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 mb-8 overflow-x-auto" style={{ borderBottom: `1px solid ${DARK.subtle}` }}>
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-all whitespace-nowrap -mb-px border-b-2"
                style={{
                  borderColor: activeTab === tab.id ? C.indigo : 'transparent',
                  color: activeTab === tab.id ? C.indigo : DARK.muted,
                }}
              >
                <span className="material-symbols-outlined text-[15px]">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          {activeTab === 'pulse'     && <PulseTab data={data} />}
          {activeTab === 'portfolio' && <PortfolioTab data={data} />}
          {activeTab === 'team'      && <TeamTab data={data} />}
          {activeTab === 'risk'      && <RiskTab data={data} />}
        </div>
      </div>
    </AppLayout>
  )
}
