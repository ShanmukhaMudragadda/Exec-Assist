import { format, isValid, isPast } from 'date-fns'
import { cn } from '@/lib/utils'
import { Calendar, Tag, Folder } from 'lucide-react'

interface Task {
  id: string
  title: string
  description?: string | null
  status: string
  priority: string
  tags?: string[]
  category?: string | null
  dueDate?: string | null
  sourceType?: string | null
  assignees?: { userId: string; user: { id: string; name: string; avatar?: string | null } }[]
  workspaceId: string
}

const PRIORITY_BORDER: Record<string, string> = {
  urgent: 'border-l-red-500',
  high: 'border-l-orange-400',
  medium: 'border-l-yellow-400',
  low: 'border-l-slate-300',
}

const PRIORITY_LABEL: Record<string, { text: string; cls: string }> = {
  urgent: { text: 'Urgent', cls: 'bg-red-50 text-red-600 border border-red-200' },
  high:   { text: 'High',   cls: 'bg-orange-50 text-orange-600 border border-orange-200' },
  medium: { text: 'Medium', cls: 'bg-yellow-50 text-yellow-600 border border-yellow-200' },
  low:    { text: 'Low',    cls: 'bg-slate-50 text-slate-500 border border-slate-200' },
}

const STATUS_PILL: Record<string, { text: string; cls: string; dot: string }> = {
  'todo':        { text: 'Todo',        cls: 'bg-slate-100 text-slate-600',  dot: 'bg-slate-400' },
  'in-progress': { text: 'In Progress', cls: 'bg-blue-50 text-blue-700',    dot: 'bg-blue-500' },
  'in-review':   { text: 'In Review',   cls: 'bg-purple-50 text-purple-700', dot: 'bg-purple-500' },
  'completed':   { text: 'Completed',   cls: 'bg-green-50 text-green-700',  dot: 'bg-green-500' },
}

interface Props {
  task: Task
  onClick: () => void
  selected?: boolean
}

export default function TaskListCard({ task, onClick, selected }: Props) {
  const pBorder = PRIORITY_BORDER[task.priority] || 'border-l-slate-200'
  const pLabel = PRIORITY_LABEL[task.priority]
  const statusPill = STATUS_PILL[task.status] || { text: task.status, cls: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' }

  const due = task.dueDate ? new Date(task.dueDate) : null
  const isOverdue = due && isValid(due) && isPast(due) && task.status !== 'completed'
  const assignees = (task.assignees || []).filter((a) => a?.user?.name)

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left bg-card rounded-lg border-l-4 border border-border shadow-sm',
        'hover:shadow hover:border-border/80 transition-all duration-150',
        'px-4 py-3 group',
        pBorder,
        selected && 'ring-2 ring-primary ring-offset-1 shadow-md'
      )}
    >
      {/* Top row: status + priority + due */}
      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold', statusPill.cls)}>
          <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', statusPill.dot)} />
          {statusPill.text}
        </span>

        {pLabel && (
          <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold', pLabel.cls)}>
            {pLabel.text}
          </span>
        )}

        {due && isValid(due) && (
          <span className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ml-auto',
            isOverdue ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-muted text-muted-foreground'
          )}>
            <Calendar className="w-2.5 h-2.5" />
            {isOverdue ? 'Overdue · ' : ''}{format(due, 'MMM d')}
          </span>
        )}
      </div>

      {/* Title */}
      <h3 className="text-[13px] font-semibold text-foreground leading-snug mb-1 group-hover:text-primary transition-colors line-clamp-1">
        {task.title}
      </h3>

      {/* Source badge */}
      {task.sourceType && (
        <span className="inline-flex items-center gap-1 text-[10px] text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded font-medium mb-1">
          {task.sourceType === 'transcript' ? '📄 Transcript' :
           task.sourceType === 'audio' ? '🎙 Audio' :
           task.sourceType === 'live' ? '🔴 Live' : `📌 ${task.sourceType}`}
        </span>
      )}

      {/* Description */}
      {task.description && (
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-1 mb-1.5">
          {task.description}
        </p>
      )}

      {/* Footer: tags + category + assignees */}
      <div className="flex items-center gap-2 flex-wrap mt-1">
        {/* Category */}
        {task.category && (
          <span className="inline-flex items-center gap-1 text-[11px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded font-medium">
            <Folder className="w-2.5 h-2.5" />
            {task.category}
          </span>
        )}

        {/* Tags */}
        {task.tags && task.tags.length > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Tag className="w-2.5 h-2.5" />
            {task.tags.slice(0, 2).join(', ')}
            {task.tags.length > 2 && ` +${task.tags.length - 2}`}
          </span>
        )}

        {/* Assignees — push to right */}
        {assignees.length > 0 && (
          <div className="flex items-center gap-1 ml-auto">
            <div className="flex -space-x-1.5">
              {assignees.slice(0, 3).map((a) => (
                <div
                  key={a.userId}
                  title={a.user.name}
                  className="w-5 h-5 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 border border-background flex items-center justify-center text-white text-[9px] font-bold"
                >
                  {a.user.name.charAt(0).toUpperCase()}
                </div>
              ))}
            </div>
            {assignees.length > 3 && (
              <span className="text-[10px] text-muted-foreground">+{assignees.length - 3}</span>
            )}
          </div>
        )}
      </div>
    </button>
  )
}
