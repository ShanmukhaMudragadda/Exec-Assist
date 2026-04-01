// DashboardPage — Executive Newspaper
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { format, isBefore, isToday, differenceInDays } from 'date-fns'
import AppLayout from '@/components/layout/AppLayout'
import { initiativesApi, actionsApi } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'

// Helper function to get greeting
function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

// ProgressBar component
function ProgressBar({ pct, color = '#4648d4' }: { pct: number; color?: string }) {
  return (
    <div className="h-[3px] bg-[#f3f4f6] rounded-full overflow-hidden flex-1">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
      />
    </div>
  )
}

const PRIORITY_COLOR: Record<string, string> = {
  urgent: '#dc2626', high: '#4648d4', medium: '#6b7280', low: '#d1d5db',
}

// Constants for localStorage keys
const LS_BRIEF_DATA_KEY = 'executiveBriefData';
const LS_BRIEF_DATE_KEY = 'executiveBriefFetchDate';

export default function DashboardPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const now = new Date()
  const todayString = now.toDateString(); // Consistent date string for comparison

  const {
    data: briefData,
    isFetching: briefLoading,
    refetch: refetchBriefQuery,
  } = useQuery({
    queryKey: ['executive-brief'],
    queryFn: async () => {
      // Return localStorage data if it's from today — skip the API entirely
      try {
        const storedDate = localStorage.getItem(LS_BRIEF_DATE_KEY);
        const storedData = localStorage.getItem(LS_BRIEF_DATA_KEY);
        if (storedDate === todayString && storedData) {
          return JSON.parse(storedData);
        }
      } catch {}

      const fetchedData = await actionsApi.getExecutiveBrief(true).then((r) => r.data);
      try {
        localStorage.setItem(LS_BRIEF_DATE_KEY, todayString);
        localStorage.setItem(LS_BRIEF_DATA_KEY, JSON.stringify(fetchedData));
      } catch {}
      return fetchedData;
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const refetchBrief = () => {
    // Clear localStorage so the queryFn hits the API with refresh=true
    try {
      localStorage.removeItem(LS_BRIEF_DATE_KEY);
      localStorage.removeItem(LS_BRIEF_DATA_KEY);
    } catch {}
    refetchBriefQuery();
  };

  const { data: initiativesData } = useQuery({
    queryKey: ['initiatives'],
    queryFn: () => initiativesApi.list().then((r) => r.data),
  })
  const { data: ccData } = useQuery({
    queryKey: ['command-center'],
    queryFn: () => actionsApi.getCommandCenter().then((r) => r.data),
  })

  const allInitiatives: any[] = (initiativesData as any)?.initiatives || []
  const allActions: any[] = (ccData as any)?.actions || []

  const overdueActions = allActions.filter((a) => a.dueDate && isBefore(new Date(a.dueDate), now) && a.status !== 'completed')
  const todayActions = allActions.filter((a) => a.dueDate && isToday(new Date(a.dueDate)) && a.status !== 'completed')
  const urgentActions = allActions.filter((a) => a.priority === 'urgent' && a.status !== 'completed')
  const atRiskInits = allInitiatives.filter((i) => i.status === 'at-risk')
  const openActions = allActions.filter((a) => a.status !== 'completed')
  const completedActions = allActions.filter((a) => a.status === 'completed')

  const getActionPath = (action: any) =>
    action.initiativeId
      ? `/initiatives/${action.initiativeId}/actions/${action.id}`
      : `/actions/${action.id}`

  const priorityFeed = [
    ...overdueActions,
    ...urgentActions.filter((a) => !overdueActions.find((o) => o.id === a.id)),
    ...todayActions.filter((a) => !overdueActions.find((o) => o.id === a.id) && !urgentActions.find((u) => u.id === a.id)),
  ].slice(0, 8)

  const aiBriefPoints: { headline: string; detail: string; metric: string | null; type: string }[] = (briefData as any)?.brief || [];

  return (
    <AppLayout>
      <div className="min-h-screen p-3 md:p-3.5 max-w-[1200px]">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-5">
          <div>
            <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-1">
              {format(now, 'EEEE, MMMM d, yyyy')}
            </p>
            <h1 className="text-[24px] font-bold text-[#111827] tracking-tight">
              {getGreeting()}, {user?.name?.split(' ')[0] || 'there'}.
            </h1>
          </div>

          {/* Stat strip */}
          <div className="flex items-center gap-3.5 mt-1 flex-wrap">
            <div className="text-right">
              <p className="text-[24px] font-bold text-[#111827] tabular-nums leading-none">{openActions.length}</p>
              <p className="text-[11px] text-[#9ca3af] uppercase tracking-wider font-semibold mt-1">Open</p>
            </div>
            {overdueActions.length > 0 && (
              <div className="text-right">
                <p className="text-[24px] font-bold text-[#dc2626] tabular-nums leading-none">{overdueActions.length}</p>
                <p className="text-[11px] text-[#dc2626] uppercase tracking-wider font-semibold mt-1">Overdue</p>
              </div>
            )}
            <div className="text-right">
              <p className="text-[24px] font-bold text-[#4648d4] tabular-nums leading-none">{allInitiatives.length}</p>
              <p className="text-[11px] text-[#9ca3af] uppercase tracking-wider font-semibold mt-1">Initiatives</p>
            </div>
          </div>
        </div>

        {/* Executive Brief — newspaper editorial */}
        <div className="mb-5 overflow-hidden" style={{ background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 4px 16px rgba(0,0,0,0.07)' }}>
          {/* Masthead */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-[14px] text-[#4648d4]" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
              <span className="font-serif text-[18px] font-bold text-[#111827] tracking-tight">Executive Brief</span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 bg-[#4648d4] text-white tracking-widest uppercase">AI</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-[#9ca3af]">{format(now, 'EEEE, MMMM d, yyyy')}</span>
              <button
                onClick={() => refetchBrief()}
                title="Refresh"
                className={cn('text-[#9ca3af] hover:text-[#4648d4] transition-colors', briefLoading && 'animate-spin pointer-events-none')}
              >
                <span className="material-symbols-outlined text-[16px]">refresh</span>
              </button>
              <Link to="/command-center" className="text-[11px] font-semibold text-[#4648d4] hover:opacity-70 transition-opacity">
                View all →
              </Link>
            </div>
          </div>

          {/* Body */}
          {briefLoading ? ( // Use briefLoading for spinner when fetching/refetching
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-0 px-4 py-2">
              {[0, 1].map((col) => (
                <div key={col} className={cn('divide-y', col === 1 && 'pl-6')} style={{ borderColor: '#e2e8f0' }}>
                  {[0, 1].map((row) => (
                    <div key={row} className="py-3.5 animate-pulse space-y-2">
                      <div className="h-2 w-14 rounded" style={{ background: '#f3f4f6' }} />
                      <div className="h-2.5 w-4/5 rounded" style={{ background: '#f3f4f6' }} />
                      <div className="h-2.5 w-3/5 rounded" style={{ background: '#f3f4f6' }} />
                      <div className="h-2 w-full rounded" style={{ background: '#f3f4f6' }} />
                      <div className="h-2 w-11/12 rounded" style={{ background: '#f3f4f6' }} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : aiBriefPoints.length > 0 ? (
            (() => {
              const mid = Math.ceil(aiBriefPoints.length / 2)
              const left = aiBriefPoints.slice(0, mid)
              const right = aiBriefPoints.slice(mid)
              const typeColor: Record<string, string> = {
                critical: '#b91c1c', warning: '#b45309', success: '#15803d', info: '#4648d4',
              }
              const typeLabel: Record<string, string> = {
                critical: 'Critical', warning: 'Watch', success: 'Highlight', info: 'Briefing',
              }
              const renderItem = (item: typeof aiBriefPoints[0], idx: number) => {
                const color = typeColor[item.type] || '#4648d4'
                const label = typeLabel[item.type] || 'Briefing'
                return (
                  <div key={idx} className="py-3.5" style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color }}>{label}</span>
                    </div>
                    <h3 className="font-serif text-[22px] font-bold leading-tight mb-2.5" style={{ color: '#0f172a' }}>
                      {item.headline}
                    </h3>
                    <p className="text-[14px] leading-[1.75]" style={{ color: '#64748b' }}>
                      {item.detail}
                    </p>
                  </div>
                )
              }
              return (
                <div className="grid grid-cols-1 md:grid-cols-2 px-4">
                  <div className="pr-6">
                    {left.map((item, i) => renderItem(item, i))}
                  </div>
                  <div className="pl-6" style={{ borderLeft: '1px solid #e2e8f0' }}>
                    {right.map((item, i) => renderItem(item, i))}
                  </div>
                </div>
              )
            })()
          ) : (
            <div className="py-6 text-center px-4">
              <p className="text-[13px] mb-3" style={{ color: '#9ca3af' }}>Brief not available.</p>
              <button onClick={() => refetchBrief()} className="text-[12px] font-semibold text-[#4648d4] hover:opacity-70 transition-opacity">
                Generate Brief →
              </button>
            </div>
          )}

          {/* Footer rule */}
          <div className="mx-6 mb-4" style={{ borderTop: '1px solid #e2e8f0' }} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
          {/* LEFT */}
          <div className="col-span-12 lg:col-span-8 space-y-5">

            {/* Priority Queue */}
            <div className="bg-white rounded-xl border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#f9fafb]">
                <div className="flex items-center gap-2.5">
                  <h2 className="text-[14px] font-semibold text-[#111827]">Priority Queue</h2>
                  {overdueActions.length > 0 && (
                    <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-[#fef2f2] text-[#dc2626]">
                      {overdueActions.length} overdue
                    </span>
                  )}
                </div>
                <Link to="/command-center" className="text-[12px] font-medium text-[#9ca3af] hover:text-[#4648d4] transition-colors">
                  See all
                </Link>
              </div>

              {priorityFeed.length === 0 ? (
                <div className="py-8 text-center">
                  <span className="material-symbols-outlined text-[32px] text-[#e5e7eb] block mb-2" style={{ fontVariationSettings: "'FILL' 1" }}>
                    task_alt
                  </span>
                  <p className="text-[13px] text-[#9ca3af]">All clear — no priority actions.</p>
                </div>
              ) : (
                    <div className="divide-y divide-[#fafafa]">
                  {priorityFeed.map((action) => {
                    const isOD = action.dueDate && isBefore(new Date(action.dueDate), now) && action.status !== 'completed'
                    const dotColor = PRIORITY_COLOR[action.priority] || '#d1d5db'
                    const assigneeInitials = action.assignee?.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
                    return (
                      <div
                        key={action.id}
                        onClick={() => navigate(getActionPath(action))}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-[#fafafa] cursor-pointer group transition-colors duration-100"
                      >
                        <div
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: isOD ? '#dc2626' : dotColor }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-medium text-[#111827] truncate group-hover:text-[#4648d4] transition-colors">
                            {action.title}
                          </p>
                          <p className="text-[12px] text-[#9ca3af] truncate mt-0.5">{action.initiative?.title}</p>
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0">
                          {isOD ? (
                            <span className="text-[12px] font-semibold text-[#dc2626]">{format(new Date(action.dueDate), 'MMM d')}</span>
                          ) : action.dueDate ? (
                            <span className="text-[12px] text-[#9ca3af]">{format(new Date(action.dueDate), 'MMM d')}</span>
                          ) : null}
                          {assigneeInitials && (
                            <div className="w-5 h-5 rounded-full bg-[#ede9fe] text-[#4648d4] text-[10px] font-bold flex items-center justify-center">
                              {assigneeInitials}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Initiative Pulse */}
            <div className="bg-white rounded-xl border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#f9fafb]">
                <h2 className="text-[14px] font-semibold text-[#111827]">Initiative Pulse</h2>
                <Link to="/initiatives" className="text-[12px] font-medium text-[#9ca3af] hover:text-[#4648d4] transition-colors">
                  See all
                </Link>
              </div>

              {allInitiatives.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-[13px] text-[#9ca3af]">No initiatives yet.</p>
                  <Link to="/initiatives" className="text-[13px] font-semibold text-[#4648d4] hover:opacity-70 mt-1 inline-block transition-opacity">
                    Create one →
                  </Link>
                </div>
              ) : (
                <div className="divide-y divide-[#fafafa]">
                  {allInitiatives.slice(0, 6).map((init) => {
                    const isAtRisk = init.status === 'at-risk'
                    const daysLeft = init.dueDate ? differenceInDays(new Date(init.dueDate), now) : null
                    const actions: any[] = init.actions || []
                    const done = actions.filter((a: any) => a.status === 'completed').length
                    const barColor = isAtRisk ? '#dc2626' : init.status === 'completed' ? '#2563eb' : '#4648d4'
                    return (
                      <div
                        key={init.id}
                        onClick={() => navigate(`/initiatives/${init.id}`)}
                        className="flex items-center gap-4 px-4 py-2.5 hover:bg-[#fafafa] cursor-pointer group transition-colors duration-100"
                      >
                        <div
                          className="w-[3px] h-8 rounded-full shrink-0"
                          style={{ backgroundColor: barColor }}
                        />
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[14px] font-medium text-[#111827] truncate group-hover:text-[#4648d4] transition-colors">
                              {init.title}
                            </p>
                            <div className="flex items-center gap-2 shrink-0">
                              {isAtRisk && (
                                <span className="text-[11px] font-semibold text-[#dc2626] bg-[#fef2f2] px-1.5 py-0.5 rounded-full">At Risk</span>
                              )}
                              <span className="text-[12px] font-semibold tabular-nums text-[#6b7280]">{init.progress || 0}%</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <ProgressBar pct={init.progress || 0} color={barColor} />
                            <span className="text-[11px] text-[#9ca3af] shrink-0 tabular-nums">
                              {done}/{actions.length}
                              {daysLeft !== null && (
                                <span className={daysLeft < 0 ? ' text-[#dc2626]' : ''}>
                                  {daysLeft < 0 ? ` · ${Math.abs(daysLeft)}d late` : ` · ${daysLeft}d left`}
                                </span>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT */}
          <div className="col-span-12 lg:col-span-4 space-y-4">
            {/* Stats */}
            <div className="bg-white rounded-xl border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] p-3.5">
              <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-4">Today's Progress</p>
              <div className="grid grid-cols-2 gap-3">
                <div
                  className="rounded-xl p-3.5 text-center"
                  style={{ background: 'linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)' }}
                >
                  <p className="text-[26px] font-bold text-[#111827] tabular-nums leading-none">{completedActions.length}</p>
                  <p className="text-[11px] text-[#9ca3af] uppercase tracking-wider font-semibold mt-2">Completed</p>
                </div>
                <div
                  className="rounded-xl p-3.5 text-center"
                  style={{ background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)' }}
                >
                  <p className="text-[26px] font-bold text-[#4648d4] tabular-nums leading-none">{todayActions.length}</p>
                  <p className="text-[11px] text-[#9ca3af] uppercase tracking-wider font-semibold mt-2">Due Today</p>
                </div>
              </div>
            </div>

            {/* Recent Actions */}
            <div className="bg-white rounded-xl border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#f9fafb]">
                <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest">Recent Actions</p>
              </div>
              <div className="divide-y divide-[#fafafa]">
                {allActions.slice(0, 6).map((action) => (
                  <div
                    key={action.id}
                    onClick={() => navigate(getActionPath(action))}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#fafafa] cursor-pointer group transition-colors duration-100"
                  >
                    <div
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{
                        backgroundColor:
                          action.status === 'completed' ? '#2563eb'
                          : action.status === 'in-progress' ? '#4648d4'
                          : '#d1d5db',
                      }}
                    />
                    <p className="text-[13px] font-medium text-[#374151] line-clamp-1 group-hover:text-[#4648d4] transition-colors">
                      {action.title}
                    </p>
                  </div>
                ))}
                {allActions.length === 0 && (
                  <div className="px-4 py-8 text-center text-[13px] text-[#9ca3af]">No actions yet.</div>
                )}
              </div>
            </div>

            {/* Quick nav */}
            <div className="bg-white rounded-xl border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] p-4">
              <p className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-3">Quick Access</p>
              <div className="space-y-0.5">
                {[
                  { icon: 'rocket_launch', label: 'All Initiatives', to: '/initiatives' },
                  { icon: 'layers', label: 'Command Center', to: '/command-center' },
                ].map(({ icon, label, to }) => (
                  <Link
                    key={to}
                    to={to}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#f9fafb] transition-colors group"
                  >
                    <span className="material-symbols-outlined text-[18px] text-[#9ca3af] group-hover:text-[#4648d4] transition-colors">
                      {icon}
                    </span>
                    <span className="text-[13px] font-medium text-[#374151] group-hover:text-[#4648d4] transition-colors flex-1">
                      {label}
                    </span>
                    <span className="material-symbols-outlined text-[15px] text-[#e5e7eb] group-hover:text-[#4648d4] transition-colors">
                      arrow_forward
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
