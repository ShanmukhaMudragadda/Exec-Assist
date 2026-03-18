import { Link } from 'react-router-dom'
import { format, isAfter } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { Calendar, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Assignee {
  id: string
  name: string
  avatar?: string | null
}

interface Task {
  id: string
  title: string
  description?: string | null
  status: string
  priority: string
  tags?: string[]
  category?: string | null
  dueDate?: string | null
  assignees?: Assignee[]
  workspaceId: string
}

interface TaskCardProps {
  task: Task
  isDragging?: boolean
  onDragStart?: (e: React.DragEvent, taskId: string) => void
}

const PRIORITY_STYLES: Record<string, { bar: string; badge: string }> = {
  urgent: { bar: 'bg-red-500', badge: 'bg-red-100 text-red-700 border-red-200' },
  high: { bar: 'bg-orange-500', badge: 'bg-orange-100 text-orange-700 border-orange-200' },
  medium: { bar: 'bg-yellow-500', badge: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  low: { bar: 'bg-green-500', badge: 'bg-green-100 text-green-700 border-green-200' },
}

function AvatarStack({ assignees }: { assignees: Assignee[] }) {
  const shown = assignees.filter((a) => a && a.name).slice(0, 3)
  const extra = assignees.length - 3
  return (
    <div className="flex -space-x-2">
      {shown.map((a) => (
        <div
          key={a.id}
          title={a.name}
          className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 border-2 border-white flex items-center justify-center text-white text-[10px] font-semibold"
        >
          {a.name.charAt(0).toUpperCase()}
        </div>
      ))}
      {extra > 0 && (
        <div className="w-6 h-6 rounded-full bg-muted border-2 border-white flex items-center justify-center text-muted-foreground text-[10px] font-semibold">
          +{extra}
        </div>
      )}
    </div>
  )
}

export default function TaskCard({ task, isDragging, onDragStart }: TaskCardProps) {
  const priorityStyle = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium
  const now = new Date()
  const isOverdue = task.dueDate && isAfter(now, new Date(task.dueDate)) && task.status !== 'completed'

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart?.(e, task.id)}
      className={cn(
        'bg-card border rounded-lg p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-all select-none',
        isDragging && 'opacity-50 shadow-lg rotate-2',
        'group'
      )}
    >
      {/* Priority bar */}
      <div className={`h-1 w-12 rounded-full mb-2 ${priorityStyle.bar}`} />

      {/* Title */}
      <Link
        to={`/workspace/${task.workspaceId}/tasks/${task.id}`}
        className="block"
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      >
        <h4 className="text-sm font-medium leading-snug group-hover:text-primary transition-colors line-clamp-2 mb-2">
          {task.title}
        </h4>
      </Link>

      {/* Tags */}
      {task.tags && task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {task.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="text-[10px] bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded-full">
              {tag}
            </span>
          ))}
          {task.tags.length > 3 && (
            <span className="text-[10px] text-muted-foreground">+{task.tags.length - 3}</span>
          )}
        </div>
      )}

      {/* Category */}
      {task.category && (
        <div className="mb-2">
          <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-full font-medium">
            {task.category}
          </span>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2">
          {task.priority && (
            <Badge className={cn('text-[10px] px-1.5 py-0 h-4 border', priorityStyle.badge)} variant="outline">
              {task.priority}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {task.dueDate && (
            <div className={cn('flex items-center gap-1 text-[10px]', isOverdue ? 'text-red-500 font-medium' : 'text-muted-foreground')}>
              {isOverdue ? <AlertCircle className="w-3 h-3" /> : <Calendar className="w-3 h-3" />}
              {format(new Date(task.dueDate), 'MMM d')}
            </div>
          )}
          {task.assignees && task.assignees.length > 0 && (
            <AvatarStack assignees={task.assignees} />
          )}
        </div>
      </div>
    </div>
  )
}
