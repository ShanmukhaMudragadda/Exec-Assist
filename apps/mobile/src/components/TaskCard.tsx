import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Task, TaskPriority, TaskStatus } from '../types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  urgent: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
}

export const PRIORITY_BG: Record<TaskPriority, string> = {
  urgent: '#fef2f2',
  high: '#fff7ed',
  medium: '#fefce8',
  low: '#f0fdf4',
}

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

export const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: '#6b7280',
  'in-progress': '#3b82f6',
  review: '#a855f7',
  'in-review': '#a855f7',
  completed: '#22c55e',
  cancelled: '#9ca3af',
}

export const STATUS_LABELS: Record<string, string> = {
  todo: 'To Do',
  'in-progress': 'In Progress',
  review: 'In Review',
  'in-review': 'In Review',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

function isDueDateOverdue(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false
  return new Date(dateStr) < new Date()
}

function formatDueDate(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Avatar Strip ─────────────────────────────────────────────────────────────

function AvatarStrip({ names }: { names: string[] }) {
  const visible = names.slice(0, 3)
  const overflow = names.length - 3
  return (
    <View style={styles.avatarStrip}>
      {visible.map((name, i) => (
        <View key={i} style={[styles.avatar, { marginLeft: i === 0 ? 0 : -6 }]}>
          <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
        </View>
      ))}
      {overflow > 0 && (
        <View style={[styles.avatar, styles.avatarOverflow, { marginLeft: -6 }]}>
          <Text style={styles.avatarOverflowText}>+{overflow}</Text>
        </View>
      )}
    </View>
  )
}

// ─── TaskCard ─────────────────────────────────────────────────────────────────

interface TaskCardProps {
  task: Task
  onPress: () => void
}

export default function TaskCard({ task, onPress }: TaskCardProps) {
  const priorityColor = PRIORITY_COLORS[task.priority] || '#6366f1'
  const priorityBg = PRIORITY_BG[task.priority] || '#f5f3ff'
  const statusColor = STATUS_COLORS[task.status] || '#6b7280'
  const statusLabel = STATUS_LABELS[task.status] || task.status
  const overdue = isDueDateOverdue(task.dueDate) && task.status !== 'completed' && task.status !== 'cancelled'
  const dueDateLabel = formatDueDate(task.dueDate)
  const assigneeNames = task.assignees.filter((a) => a?.user?.name).map((a) => a.user.name)

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      {/* Left priority stripe */}
      <View style={[styles.priorityStripe, { backgroundColor: priorityColor }]} />

      <View style={styles.body}>
        {/* Top row: status pill + priority badge + due date */}
        <View style={styles.topRow}>
          <View style={[styles.statusPill, { backgroundColor: statusColor + '18' }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>

          <View style={[styles.priorityBadge, { backgroundColor: priorityBg, borderColor: priorityColor + '40' }]}>
            <Text style={[styles.priorityBadgeText, { color: priorityColor }]}>
              {PRIORITY_LABELS[task.priority] || task.priority}
            </Text>
          </View>

          {dueDateLabel ? (
            <View style={[styles.dueBadge, overdue && styles.dueBadgeOverdue]}>
              <Ionicons name="calendar-outline" size={13} color={overdue ? '#ef4444' : '#9ca3af'} />
              <Text style={[styles.dueText, overdue && styles.dueTextOverdue]}>
                {overdue ? 'Overdue · ' : ''}{dueDateLabel}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Title */}
        <Text style={styles.title} numberOfLines={2} adjustsFontSizeToFit={false}>{task.title}</Text>

        {/* Source badge */}
        {task.sourceType && (
          <View style={styles.sourceBadge}>
            <Text style={styles.sourceBadgeText}>
              {task.sourceType === 'transcript' ? '📄 Transcript' :
               task.sourceType === 'audio' ? '🎙 Audio' :
               task.sourceType === 'live' ? '🔴 Live' : `📌 ${task.sourceType}`}
            </Text>
          </View>
        )}

        {/* Description */}
        {task.description ? (
          <Text style={styles.description} numberOfLines={1}>{task.description}</Text>
        ) : null}

        {/* Footer: category + tags + assignees */}
        <View style={styles.footer}>
          <View style={styles.footerLeft}>
            {task.category ? (
              <View style={styles.categoryChip}>
                <Ionicons name="folder-outline" size={13} color="#6366f1" />
                <Text style={styles.categoryText}>{task.category}</Text>
              </View>
            ) : null}

            {task.tags.length > 0 && (
              <View style={styles.tagsRow}>
                <Ionicons name="pricetag-outline" size={13} color="#9ca3af" />
                <Text style={styles.tagsText}>
                  {task.tags.slice(0, 3).join(', ')}
                  {task.tags.length > 3 ? ` +${task.tags.length - 3}` : ''}
                </Text>
              </View>
            )}
          </View>

          {assigneeNames.length > 0 && <AvatarStrip names={assigneeNames} />}
        </View>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
    overflow: 'hidden',
  },
  priorityStripe: {
    width: 5,
  },
  body: {
    flex: 1,
    padding: 16,
    gap: 9,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 4,
    gap: 5,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  priorityBadge: {
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
  },
  priorityBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  dueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
  },
  dueBadgeOverdue: {},
  dueText: {
    fontSize: 12,
    color: '#9ca3af',
  },
  dueTextOverdue: {
    color: '#ef4444',
    fontWeight: '500',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    lineHeight: 22,
  },
  description: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 19,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    flexWrap: 'wrap',
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ede9fe',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  categoryText: {
    fontSize: 12,
    color: '#6366f1',
    fontWeight: '500',
  },
  tagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tagsText: {
    fontSize: 12,
    color: '#9ca3af',
  },
  avatarStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'white',
  },
  avatarText: {
    fontSize: 11,
    fontWeight: '700',
    color: 'white',
  },
  avatarOverflow: {
    backgroundColor: '#e5e7eb',
  },
  avatarOverflowText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6b7280',
  },
  sourceBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#f0f4ff',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginBottom: 2,
  },
  sourceBadgeText: {
    fontSize: 11,
    color: '#6366f1',
    fontWeight: '500',
  },
})
