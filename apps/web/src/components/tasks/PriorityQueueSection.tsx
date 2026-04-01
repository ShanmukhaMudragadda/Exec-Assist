import { useNavigate } from 'react-router-dom'
import { format, isBefore, isToday } from 'date-fns'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'

const PRIORITY_CONFIG: Record<string, { label: string; cls: string }> = {
  low:    { label: 'Low',    cls: 'bg-[#f3f4f6] text-[#6b7280] border-[#e5e7eb]' },
  medium: { label: 'Medium', cls: 'bg-[#eff6ff] text-[#2563eb] border-[#bfdbfe]' },
  high:   { label: 'High',   cls: 'bg-[#ede9fe] text-[#4648d4] border-[#c4b5fd]' },
  urgent: { label: 'Urgent', cls: 'bg-[#fef2f2] text-[#dc2626] border-[#fecaca]' },
}

interface PriorityQueueSectionProps {
  allActions: any[];
  getActionPath: (action: any) => string;
}

export function PriorityQueueSection({ allActions, getActionPath }: PriorityQueueSectionProps) {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const now = new Date()

  const todayActions = allActions.filter((a) => isToday(new Date(a.dueDate)) && a.status !== 'completed')
  const overdueActions = allActions.filter((a) => a.dueDate && isBefore(new Date(a.dueDate), now) && a.status !== 'completed')
  const urgentActions = allActions.filter((a) => a.priority === 'urgent' && a.status !== 'completed')

  const priorityFeed = Array.from(new Set([...overdueActions, ...urgentActions, ...todayActions]))
    .sort((a, b) => {
      // Sort by overdue first
      const aIsOverdue = a.dueDate && isBefore(new Date(a.dueDate), now) && a.status !== 'completed'
      const bIsOverdue = b.dueDate && isBefore(new Date(b.dueDate), now) && b.status !== 'completed'
      if (aIsOverdue && !bIsOverdue) return -1
      if (!aIsOverdue && bIsOverdue) return 1

      // Then by urgent
      if (a.priority === 'urgent' && b.priority !== 'urgent') return -1
      if (a.priority !== 'urgent' && b.priority === 'urgent') return 1

      // Then by due date
      if (a.dueDate && b.dueDate) {
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
      }
      return 0
    })

  return (
    <div className="col-span-12 lg:col-span-4 space-y-4">
      {priorityFeed.length > 0 && (
        <div className="bg-white rounded-xl border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#f2f4f6]">
            <h3 className="text-[12px] font-bold text-[#9ca3af] uppercase tracking-widest">Priority Queue</h3>
          </div>
          <div className="py-2 space-y-1.5 max-h-[320px] overflow-y-auto">
            {priorityFeed.map((action) => {
              const isOD = action.dueDate && isBefore(new Date(action.dueDate), now) && action.status !== 'completed'
              const isDueToday = action.dueDate && isToday(new Date(action.dueDate)) && action.status !== 'completed'
              const person = action.assignee || action.creator
              const initials = person?.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '?'

              return (
                <button
                  key={action.id}
                  onClick={() => navigate(getActionPath(action))}
                  className="w-full flex items-start gap-3 py-1.5 px-4 text-left hover:bg-[#fafafa] rounded-lg"
                >
                  <div
                    className={cn(
                      'w-1.5 h-1.5 rounded-full mt-2 shrink-0',
                      action.priority === 'urgent' ? 'bg-[#dc2626]' : action.priority === 'high' ? 'bg-[#4648d4]' : 'bg-[#d1d5db]'
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] text-[#111827] line-clamp-1">{action.title}</p>
                    <p className="text-[11px] text-[#9ca3af] mt-0.5">
                      {action.initiative?.title ? `${action.initiative.title} · ` : ''}
                      {isOD ? <span className="font-semibold text-[#dc2626]">Overdue</span> : isDueToday ? 'Today' : ''}
                      {action.dueDate && !isOD && !isDueToday && `Due ${format(new Date(action.dueDate), 'MMM d')}`}
                    </p>
                  </div>
                  {action.assignee && (
                    action.assignee.avatar ? (
                      <img src={action.assignee.avatar} alt={action.assignee.name} className="w-6 h-6 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-[#ede9fe] text-[#4648d4] text-[10px] font-bold flex items-center justify-center shrink-0">
                        {initials}
                      </div>
                    )
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}