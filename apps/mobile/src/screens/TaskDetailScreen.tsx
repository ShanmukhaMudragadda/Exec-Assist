import { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RouteProp } from '@react-navigation/native'
import { tasksApi, workspacesApi } from '../services/api'
import { connectSocket, getSocket, joinWorkspaceRoom, leaveWorkspaceRoom } from '../services/socket'
import { useAuthStore } from '../store/authStore'
import {
  MainStackParamList,
  Task,
  TaskUpdate,
  TaskStatus,
  TaskPriority,
} from '../types'
import { PRIORITY_COLORS, STATUS_COLORS, STATUS_LABELS } from '../components/TaskCard'

type Props = {
  navigation: NativeStackNavigationProp<MainStackParamList, 'TaskDetail'>
  route: RouteProp<MainStackParamList, 'TaskDetail'>
}

interface Member {
  userId: string
  role: string
  user: { id: string; name: string; email: string; avatar?: string | null }
}

const STATUS_OPTIONS: TaskStatus[] = ['todo', 'in-progress', 'in-review', 'completed', 'cancelled']
const PRIORITY_OPTIONS: TaskPriority[] = ['urgent', 'high', 'medium', 'low']

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
}

function toDateInput(iso: string): string {
  return iso.slice(0, 10)
}

// ─── Pill Selector ────────────────────────────────────────────────────────────

function PillSelector<T extends string>({
  options, selected, onSelect, colorMap, labelMap,
}: {
  options: T[]
  selected: T
  onSelect: (v: T) => void
  colorMap: Record<string, string>
  labelMap?: Record<string, string>
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row' }}>
      {options.map((opt) => {
        const active = opt === selected
        const color = colorMap[opt] || '#9ca3af'
        return (
          <TouchableOpacity
            key={opt}
            style={[
              styles.pill,
              active && { backgroundColor: color, borderColor: color },
            ]}
            onPress={() => onSelect(opt)}
          >
            {!active && <View style={[styles.pillDot, { backgroundColor: color }]} />}
            <Text style={[styles.pillText, active && styles.pillTextActive]}>
              {labelMap ? labelMap[opt] : opt}
            </Text>
          </TouchableOpacity>
        )
      })}
    </ScrollView>
  )
}

// ─── Comment Row ──────────────────────────────────────────────────────────────

function CommentRow({ update, currentUserId, onDelete }: {
  update: TaskUpdate
  currentUserId: string
  onDelete: (id: string) => void
}) {
  const isOwn = update.user.id === currentUserId
  return (
    <View style={styles.commentBubble}>
      <View style={[styles.commentAvatar, isOwn && styles.commentAvatarOwn]}>
        <Text style={[styles.commentAvatarText, isOwn && { color: 'white' }]}>
          {update.user.name.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={[styles.commentBody, isOwn && styles.commentBodyOwn]}>
        <View style={styles.commentHeader}>
          <Text style={styles.commentAuthor}>{update.user.name}</Text>
          <Text style={styles.commentTime}>{formatDateTime(update.createdAt)}</Text>
          {isOwn && (
            <TouchableOpacity onPress={() => onDelete(update.id)} style={styles.deleteCommentBtn}>
              <Ionicons name="trash-outline" size={13} color="#ef4444" />
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.commentContent}>{update.content}</Text>
      </View>
    </View>
  )
}

// ─── Inline Editable Field ────────────────────────────────────────────────────

function EditableField({
  label, value, placeholder, onSave, multiline = false, titleStyle = false, readOnly = false,
}: {
  label: string
  value?: string | null
  placeholder: string
  onSave: (v: string | null) => void
  multiline?: boolean
  titleStyle?: boolean
  readOnly?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')

  const handleSave = () => {
    onSave(draft.trim() || null)
    setEditing(false)
  }

  const handleCancel = () => {
    setDraft(value ?? '')
    setEditing(false)
  }

  return (
    <View style={styles.editableField}>
      {label ? <Text style={styles.sectionLabel}>{label}</Text> : null}
      {editing ? (
        <View>
          <TextInput
            style={[
              styles.editInput,
              multiline && styles.editInputMultiline,
              titleStyle && styles.editInputTitle,
            ]}
            value={draft}
            onChangeText={setDraft}
            autoFocus
            multiline={multiline}
            textAlignVertical={multiline ? 'top' : 'center'}
            placeholder={placeholder}
            placeholderTextColor="#cbd5e1"
          />
          <View style={styles.editActions}>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Ionicons name="checkmark" size={14} color="white" />
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : readOnly ? (
        <Text style={[
          titleStyle ? styles.editableTitle : styles.editableValue,
          !value && styles.editablePlaceholder,
        ]}>
          {value || placeholder}
        </Text>
      ) : (
        <TouchableOpacity
          style={styles.editableTap}
          onPress={() => { setDraft(value ?? ''); setEditing(true) }}
        >
          <Text style={[
            titleStyle ? styles.editableTitle : styles.editableValue,
            !value && styles.editablePlaceholder,
          ]}>
            {value || placeholder}
          </Text>
          <Ionicons name="pencil-outline" size={13} color="#cbd5e1" />
        </TouchableOpacity>
      )}
    </View>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TaskDetailScreen({ navigation, route }: Props) {
  const { taskId, workspaceId } = route.params
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)

  const [commentText, setCommentText] = useState('')
  const [liveTask, setLiveTask] = useState<Task | null>(null)
  const [liveUpdates, setLiveUpdates] = useState<TaskUpdate[]>([])
  const scrollRef = useRef<ScrollView>(null)

  const [editingTags, setEditingTags] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [editingDueDate, setEditingDueDate] = useState(false)
  const [dueDateDraft, setDueDateDraft] = useState('')
  const [assigneeDropdownOpen, setAssigneeDropdownOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')

  const { data: taskData, isLoading: taskLoading } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => tasksApi.get(taskId).then((r) => r.data.task),
  })

  useEffect(() => {
    if (taskData) setLiveTask(taskData as Task)
  }, [taskData])

  const { data: membersData } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => workspacesApi.getMembers(workspaceId).then((r) => r.data),
  })
  const members: Member[] = (membersData as { members?: Member[] })?.members ?? []

  const { data: updatesData, isLoading: updatesLoading } = useQuery({
    queryKey: ['task-updates', taskId],
    queryFn: () => tasksApi.getUpdates(taskId).then((r) => r.data.updates),
  })

  useEffect(() => {
    if (updatesData) setLiveUpdates(updatesData as TaskUpdate[])
  }, [updatesData])

  useEffect(() => {
    let mounted = true
    connectSocket().then(() => {
      if (!mounted) return
      const socket = getSocket()
      joinWorkspaceRoom(workspaceId)
      socket.on('task:updated', (updated: Task) => {
        if (updated.id === taskId) setLiveTask(updated)
      })
      socket.on('task:commented', (data: { taskId: string; update: TaskUpdate }) => {
        if (data.taskId === taskId) {
          setLiveUpdates((prev) => {
            const exists = prev.some((u) => u.id === data.update.id)
            return exists ? prev : [...prev, data.update]
          })
        }
      })
    })
    return () => {
      mounted = false
      leaveWorkspaceRoom(workspaceId)
      const socket = getSocket()
      socket.off('task:updated')
      socket.off('task:commented')
    }
  }, [taskId, workspaceId])

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof tasksApi.update>[1]) =>
      tasksApi.update(taskId, data).then((r) => r.data.task),
    onSuccess: (updated: Task) => {
      setLiveTask(updated)
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
    onError: () => Alert.alert('Error', 'Failed to update task.'),
  })

  const commentMutation = useMutation({
    mutationFn: (content: string) =>
      tasksApi.createUpdate(taskId, content).then((r) => r.data.update),
    onSuccess: (update: TaskUpdate) => {
      setLiveUpdates((prev) => {
        const exists = prev.some((u) => u.id === update.id)
        return exists ? prev : [...prev, update]
      })
      setCommentText('')
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150)
    },
    onError: () => Alert.alert('Error', 'Failed to post update.'),
  })

  const deleteCommentMutation = useMutation({
    mutationFn: (updateId: string) =>
      tasksApi.deleteUpdate(updateId).then(() => updateId),
    onSuccess: (updateId: string) => {
      setLiveUpdates((prev) => prev.filter((u) => u.id !== updateId))
    },
    onError: () => Alert.alert('Error', 'Failed to delete update.'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => tasksApi.delete(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      navigation.goBack()
    },
    onError: () => Alert.alert('Error', 'Failed to delete task.'),
  })

  const save = (data: Parameters<typeof tasksApi.update>[1]) => {
    updateMutation.mutate(data)
  }

  const handleDeleteComment = (updateId: string) => {
    Alert.alert('Delete Update', 'Remove this update?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteCommentMutation.mutate(updateId) },
    ])
  }

  const confirmDelete = () => {
    Alert.alert('Delete Task', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate() },
    ])
  }

  const addTag = () => {
    const tag = tagInput.trim()
    if (!tag || !liveTask) return
    if (liveTask.tags?.includes(tag)) { setTagInput(''); return }
    save({ tags: [...(liveTask.tags || []), tag] })
    setTagInput('')
  }

  const removeTag = (tag: string) => {
    if (!liveTask) return
    save({ tags: liveTask.tags.filter((t) => t !== tag) })
  }

  const toggleAssignee = (member: Member) => {
    if (!liveTask) return
    const currentIds = liveTask.assignees.map((a) => a.userId)
    const newIds = currentIds.includes(member.userId)
      ? currentIds.filter((id) => id !== member.userId)
      : [...currentIds, member.userId]
    save({ assigneeIds: newIds })
  }

  const saveDueDate = () => {
    if (!dueDateDraft) {
      save({ dueDate: null })
      setEditingDueDate(false)
      return
    }
    const d = new Date(dueDateDraft)
    if (isNaN(d.getTime())) {
      Alert.alert('Invalid date', 'Use format: YYYY-MM-DD')
      return
    }
    save({ dueDate: d.toISOString() })
    setEditingDueDate(false)
  }

  if (taskLoading) {
    return <View style={styles.loaderWrap}><ActivityIndicator size="large" color="#6366f1" /></View>
  }

  const task = liveTask
  if (!task) {
    return (
      <View style={styles.loaderWrap}>
        <Text style={styles.errorText}>Task not found.</Text>
      </View>
    )
  }

  const isOverdue =
    task.dueDate && new Date(task.dueDate) < new Date() &&
    task.status !== 'completed' && task.status !== 'cancelled'

  const isSaving = updateMutation.isPending
  const myMember = members.find((m) => m.userId === currentUser?.id)
  const isAssignee = task.assignees.some((a) => a.userId === currentUser?.id)
  // owner/admin: full edit; collaborator/member: only edit if assigned
  const canEdit = !myMember || myMember.role === 'owner' || myMember.role === 'admin' || isAssignee
  const priorityColor = PRIORITY_COLORS[task.priority] || '#9ca3af'
  const statusColor = STATUS_COLORS[task.status] || '#9ca3af'

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >

        {/* Saving indicator */}
        {isSaving && (
          <View style={styles.savingBar}>
            <ActivityIndicator size="small" color="#6366f1" />
            <Text style={styles.savingText}>Saving...</Text>
          </View>
        )}

        {/* ── Header: chips + title + description ─────────────── */}
        <View style={styles.titleSection}>
          <View style={styles.chipRow}>
            <View style={[styles.priorityChip, { backgroundColor: priorityColor + '18', borderColor: priorityColor + '50' }]}>
              <View style={[styles.priorityDot, { backgroundColor: priorityColor }]} />
              <Text style={[styles.priorityChipText, { color: priorityColor }]}>{task.priority}</Text>
            </View>
            <View style={[styles.statusChip, { backgroundColor: statusColor + '18' }]}>
              <Text style={[styles.statusChipText, { color: statusColor }]}>{STATUS_LABELS[task.status]}</Text>
            </View>
          </View>

          <EditableField
            label=""
            value={task.title}
            placeholder="Task title"
            onSave={(v) => v && save({ title: v })}
            titleStyle
            readOnly={!canEdit}
          />
          <EditableField
            label=""
            value={task.description}
            placeholder="Add a description..."
            onSave={(v) => save({ description: v })}
            multiline
            readOnly={!canEdit}
          />
        </View>

        <View style={styles.divider} />

        {/* ── Properties ──────────────────────────────────────── */}
        <View style={styles.propsSection}>

          {/* Due Date */}
          <View style={styles.propRow}>
            <View style={styles.propLabelWrap}>
              <Ionicons name="calendar-outline" size={15} color="#94a3b8" />
              <Text style={styles.propLabel}>Due Date</Text>
            </View>
            {editingDueDate ? (
              <View style={{ flex: 1 }}>
                <TextInput
                  style={styles.propInput}
                  value={dueDateDraft}
                  onChangeText={setDueDateDraft}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#cbd5e1"
                  autoFocus
                />
                <View style={styles.propEditActions}>
                  <TouchableOpacity style={styles.propSaveBtn} onPress={saveDueDate}>
                    <Text style={styles.propSaveBtnText}>Save</Text>
                  </TouchableOpacity>
                  {task.dueDate && (
                    <TouchableOpacity style={styles.propClearBtn} onPress={() => { save({ dueDate: null }); setEditingDueDate(false) }}>
                      <Text style={styles.propClearBtnText}>Clear</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => setEditingDueDate(false)}>
                    <Text style={styles.propCancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => { if (!canEdit) return; setDueDateDraft(task.dueDate ? toDateInput(task.dueDate) : ''); setEditingDueDate(true) }}
                style={styles.propValueTap}
                disabled={!canEdit}
              >
                <Text style={[styles.propValue, !task.dueDate && styles.propValueEmpty, isOverdue && { color: '#ef4444' }]}>
                  {task.dueDate ? formatDate(task.dueDate) : 'Set due date'}
                </Text>
                {isOverdue && <View style={styles.overdueDot} />}
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.propDivider} />

          {/* Category */}
          <View style={styles.propRow}>
            <View style={styles.propLabelWrap}>
              <Ionicons name="folder-outline" size={15} color="#94a3b8" />
              <Text style={styles.propLabel}>Category</Text>
            </View>
            <View style={{ flex: 1 }}>
              <EditableField
                label=""
                value={task.category}
                placeholder="Set category"
                onSave={(v) => save({ category: v })}
                readOnly={!canEdit}
              />
            </View>
          </View>

          <View style={styles.propDivider} />

          {/* Created */}
          <View style={styles.propRow}>
            <View style={styles.propLabelWrap}>
              <Ionicons name="time-outline" size={15} color="#94a3b8" />
              <Text style={styles.propLabel}>Created</Text>
            </View>
            <Text style={styles.propValue}>{formatDate(task.createdAt)}</Text>
          </View>

        </View>

        <View style={styles.divider} />

        {/* ── Status ──────────────────────────────────────────── */}
        <View style={styles.selectorSection}>
          <Text style={styles.selectorLabel}>Status</Text>
          <PillSelector
            options={STATUS_OPTIONS}
            selected={task.status}
            onSelect={canEdit ? (s) => save({ status: s }) : () => {}}
            colorMap={STATUS_COLORS}
            labelMap={STATUS_LABELS}
          />
        </View>

        <View style={styles.divider} />

        {/* ── Priority ────────────────────────────────────────── */}
        <View style={styles.selectorSection}>
          <Text style={styles.selectorLabel}>Priority</Text>
          <PillSelector
            options={PRIORITY_OPTIONS}
            selected={task.priority}
            onSelect={canEdit ? (p) => save({ priority: p }) : () => {}}
            colorMap={PRIORITY_COLORS}
          />
        </View>

        <View style={styles.divider} />

        {/* ── Assignees ───────────────────────────────────────── */}
        <View style={styles.selectorSection}>
          <View style={styles.selectorHeaderRow}>
            <Text style={styles.selectorLabel}>Assignees</Text>
            {canEdit && (
              <TouchableOpacity style={styles.addBtn} onPress={() => setAssigneeDropdownOpen(true)}>
                <Ionicons name="person-add-outline" size={13} color="#6366f1" />
                <Text style={styles.addBtnText}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>
          {task.assignees.length === 0 ? (
            <Text style={styles.emptyHint}>No assignees — tap Edit to add</Text>
          ) : (
            <View style={styles.assigneeList}>
              {task.assignees.map((a) => (
                <TouchableOpacity
                  key={a.userId}
                  style={styles.assigneeChip}
                  onPress={() => {
                    const member = members.find((m) => m.userId === a.userId)
                    if (member) toggleAssignee(member)
                  }}
                >
                  <View style={styles.assigneeAvatar}>
                    <Text style={styles.assigneeAvatarText}>{a.user.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <Text style={styles.assigneeChipName}>{a.user.name.split(' ')[0]}</Text>
                  <Ionicons name="close" size={11} color="#94a3b8" />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={styles.divider} />

        {/* ── Tags ────────────────────────────────────────────── */}
        <View style={styles.selectorSection}>
          <View style={styles.selectorHeaderRow}>
            <Text style={styles.selectorLabel}>Tags</Text>
            {canEdit && (
              <TouchableOpacity onPress={() => setEditingTags((v) => !v)}>
                <Ionicons name={editingTags ? 'close' : 'add-circle-outline'} size={18} color="#6366f1" />
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.tagsWrap}>
            {task.tags.map((tag) => (
              <View key={tag} style={styles.tagChip}>
                <Text style={styles.tagChipText}>{tag}</Text>
                {editingTags && (
                  <TouchableOpacity onPress={() => removeTag(tag)}>
                    <Ionicons name="close" size={11} color="#6366f1" />
                  </TouchableOpacity>
                )}
              </View>
            ))}
            {task.tags.length === 0 && !editingTags && <Text style={styles.emptyHint}>No tags</Text>}
          </View>
          {editingTags && (
            <View style={styles.tagInputRow}>
              <TextInput
                style={styles.tagInput}
                value={tagInput}
                onChangeText={setTagInput}
                placeholder="Add tag..."
                placeholderTextColor="#cbd5e1"
                onSubmitEditing={addTag}
                returnKeyType="done"
              />
              <TouchableOpacity
                style={[styles.tagAddBtn, !tagInput.trim() && styles.tagAddBtnDisabled]}
                onPress={addTag}
                disabled={!tagInput.trim()}
              >
                <Text style={styles.tagAddBtnText}>Add</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.divider} />

        {/* ── Comments ────────────────────────────────────────── */}
        <View style={styles.commentsSection}>
          <Text style={styles.selectorLabel}>
            Updates{liveUpdates.length > 0 ? ` (${liveUpdates.length})` : ''}
          </Text>
          {updatesLoading ? (
            <ActivityIndicator color="#6366f1" style={{ marginTop: 8 }} />
          ) : liveUpdates.length === 0 ? (
            <Text style={styles.emptyHint}>No updates yet. Be the first!</Text>
          ) : (
            <View style={styles.commentList}>
              {liveUpdates.map((u) => (
                <CommentRow
                  key={u.id}
                  update={u}
                  currentUserId={currentUser?.id ?? ''}
                  onDelete={handleDeleteComment}
                />
              ))}
            </View>
          )}
        </View>

        {/* ── Delete ──────────────────────────────────────────── */}
        {canEdit && (
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={confirmDelete}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? (
              <ActivityIndicator color="#ef4444" size="small" />
            ) : (
              <>
                <Ionicons name="trash-outline" size={15} color="#ef4444" />
                <Text style={styles.deleteBtnText}>Delete Task</Text>
              </>
            )}
          </TouchableOpacity>
        )}

      </ScrollView>

      {/* Comment input */}
      <View style={styles.commentInputWrap}>
        <TextInput
          style={styles.commentInput}
          placeholder="Write an update..."
          value={commentText}
          onChangeText={setCommentText}
          placeholderTextColor="#94a3b8"
          multiline
          maxLength={1000}
        />
        <TouchableOpacity
          style={[
            styles.commentSendBtn,
            (!commentText.trim() || commentMutation.isPending) && styles.commentSendBtnDisabled,
          ]}
          onPress={() => commentText.trim() && commentMutation.mutate(commentText.trim())}
          disabled={!commentText.trim() || commentMutation.isPending}
        >
          {commentMutation.isPending ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Ionicons name="send" size={16} color="white" />
          )}
        </TouchableOpacity>
      </View>

      {/* Assignee picker modal */}
      <Modal
        visible={assigneeDropdownOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setAssigneeDropdownOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setAssigneeDropdownOpen(false)}
        />
        <View style={styles.assigneeModal}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeaderRow}>
            <Text style={styles.modalTitle}>Select Assignees</Text>
            <TouchableOpacity onPress={() => setAssigneeDropdownOpen(false)}>
              <Ionicons name="close" size={22} color="#6b7280" />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
            {members.map((m) => {
              const isAssigned = task.assignees.some((a) => a.userId === m.userId)
              return (
                <TouchableOpacity
                  key={m.userId}
                  style={[styles.memberRow, isAssigned && styles.memberRowSelected]}
                  onPress={() => toggleAssignee(m)}
                >
                  <View style={[styles.memberAvatar, isAssigned && styles.memberAvatarSelected]}>
                    <Text style={[styles.memberAvatarText, isAssigned && { color: 'white' }]}>
                      {m.user.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberName}>{m.user.name}</Text>
                    <Text style={styles.memberEmail}>{m.user.email}</Text>
                  </View>
                  {isAssigned && <Ionicons name="checkmark-circle" size={20} color="#6366f1" />}
                </TouchableOpacity>
              )
            })}

            {/* Invite non-member by email */}
            <View style={{ marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
                Invite & Assign by Email
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  style={{ flex: 1, borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: '#0f172a', backgroundColor: '#f8fafc' }}
                  value={inviteEmail}
                  onChangeText={setInviteEmail}
                  placeholder="email@example.com"
                  placeholderTextColor="#cbd5e1"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={[{ backgroundColor: '#6366f1', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, justifyContent: 'center' }, !inviteEmail.trim() && { backgroundColor: '#c7d2fe' }]}
                  disabled={!inviteEmail.trim()}
                  onPress={() => {
                    if (!inviteEmail.trim()) return
                    save({ inviteEmails: [inviteEmail.trim()] } as any)
                    setInviteEmail('')
                    setAssigneeDropdownOpen(false)
                  }}
                >
                  <Text style={{ color: 'white', fontSize: 13, fontWeight: '700' }}>Invite</Text>
                </TouchableOpacity>
              </View>
              <Text style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
                They'll be added as a Member and assigned to this task.
              </Text>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#ffffff' },
  scroll: { flex: 1 },
  content: { paddingBottom: 24 },
  loaderWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 16, color: '#6b7280' },

  // Saving bar
  savingBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 7, backgroundColor: '#f5f3ff' },
  savingText: { fontSize: 12, color: '#6366f1', fontWeight: '600' },

  // Title section
  titleSection: { padding: 20, paddingBottom: 24 },
  chipRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  priorityChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  priorityDot: { width: 6, height: 6, borderRadius: 3 },
  priorityChipText: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  statusChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusChipText: { fontSize: 12, fontWeight: '600' },

  // Editable field
  editableField: { marginBottom: 4 },
  editableTap: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  editableTitle: { fontSize: 22, color: '#0f172a', fontWeight: '700', flex: 1, lineHeight: 30 },
  editableValue: { fontSize: 15, color: '#64748b', fontWeight: '400', flex: 1, lineHeight: 22 },
  editablePlaceholder: { color: '#cbd5e1' },
  editInput: { borderWidth: 1.5, borderColor: '#6366f1', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15, color: '#0f172a', backgroundColor: '#f8fafc' },
  editInputTitle: { fontSize: 22, fontWeight: '700' },
  editInputMultiline: { minHeight: 80, textAlignVertical: 'top', paddingTop: 8 },
  editActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#6366f1', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 },
  saveBtnText: { color: 'white', fontSize: 12, fontWeight: '700' },
  cancelBtn: { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 },
  cancelBtnText: { color: '#94a3b8', fontSize: 12, fontWeight: '600' },

  // Section divider
  divider: { height: 1, backgroundColor: '#f1f5f9' },

  // Properties section
  propsSection: { backgroundColor: '#f8fafc', paddingHorizontal: 20, paddingVertical: 4 },
  propRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  propLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, width: 110 },
  propLabel: { fontSize: 14, color: '#94a3b8', fontWeight: '500' },
  propValue: { fontSize: 14, color: '#0f172a', fontWeight: '500', flex: 1 },
  propValueEmpty: { color: '#cbd5e1', fontWeight: '400' },
  propValueTap: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  propInput: { borderWidth: 1.5, borderColor: '#6366f1', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 13, color: '#0f172a', backgroundColor: '#ffffff' },
  propEditActions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  propSaveBtn: { backgroundColor: '#6366f1', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 4 },
  propSaveBtnText: { color: 'white', fontSize: 12, fontWeight: '700' },
  propClearBtn: { backgroundColor: '#fef2f2', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 4 },
  propClearBtnText: { color: '#ef4444', fontSize: 12, fontWeight: '600' },
  propCancelText: { color: '#94a3b8', fontSize: 12, fontWeight: '600', paddingVertical: 4 },
  propDivider: { height: 1, backgroundColor: '#eef2f7' },
  overdueDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#ef4444' },

  // Selector sections (Status, Priority, Assignees, Tags)
  selectorSection: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 16 },
  selectorHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  selectorLabel: { fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addBtnText: { fontSize: 13, color: '#6366f1', fontWeight: '600' },
  emptyHint: { fontSize: 13, color: '#cbd5e1', paddingBottom: 4 },

  // Pills
  pill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#e2e8f0', marginRight: 8, gap: 5, backgroundColor: '#f8fafc' },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 13, color: '#64748b', fontWeight: '500' },
  pillTextActive: { color: 'white', fontWeight: '700' },

  // Assignees
  assigneeList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  assigneeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f8fafc', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#e2e8f0' },
  assigneeAvatar: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#6366f1', justifyContent: 'center', alignItems: 'center' },
  assigneeAvatarText: { color: 'white', fontSize: 10, fontWeight: '700' },
  assigneeChipName: { fontSize: 13, color: '#374151', fontWeight: '500' },

  // Tags
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  tagChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ede9fe', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  tagChipText: { fontSize: 12, color: '#6366f1', fontWeight: '600' },
  tagInputRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  tagInput: { flex: 1, borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: '#0f172a', backgroundColor: '#f8fafc' },
  tagAddBtn: { backgroundColor: '#6366f1', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  tagAddBtnDisabled: { backgroundColor: '#c7d2fe' },
  tagAddBtnText: { color: 'white', fontSize: 13, fontWeight: '700' },

  // Comments section
  commentsSection: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 16 },
  commentList: { gap: 14 },
  commentBubble: { flexDirection: 'row', gap: 10 },
  commentAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#e0e7ff', justifyContent: 'center', alignItems: 'center', flexShrink: 0, marginTop: 2 },
  commentAvatarOwn: { backgroundColor: '#6366f1' },
  commentAvatarText: { color: '#4338ca', fontWeight: '700', fontSize: 13 },
  commentBody: { flex: 1, backgroundColor: '#f8fafc', borderRadius: 12, padding: 12 },
  commentBodyOwn: { backgroundColor: '#ede9fe' },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5, flexWrap: 'wrap' },
  commentAuthor: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  commentTime: { fontSize: 11, color: '#94a3b8', flex: 1 },
  deleteCommentBtn: { padding: 2 },
  commentContent: { fontSize: 14, color: '#374151', lineHeight: 20 },
  // legacy aliases kept so CommentRow's JSX compiles:
  commentRow: {},
  commentBubbleOwn: {},
  commentBubbleOther: {},

  // Delete button
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginHorizontal: 20, marginTop: 16, marginBottom: 8, paddingVertical: 13, borderRadius: 10, backgroundColor: '#fff5f5' },
  deleteBtnText: { fontSize: 14, color: '#ef4444', fontWeight: '600' },

  // Comment input bar
  commentInputWrap: { flexDirection: 'row', alignItems: 'flex-end', padding: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9', backgroundColor: 'white', gap: 8 },
  commentInput: { flex: 1, borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 22, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 14, color: '#0f172a', maxHeight: 100, backgroundColor: '#f8fafc' },
  commentSendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#6366f1', justifyContent: 'center', alignItems: 'center', shadowColor: '#6366f1', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 },
  commentSendBtnDisabled: { backgroundColor: '#c7d2fe', shadowOpacity: 0, elevation: 0 },

  // Assignee modal
  modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  assigneeModal: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '70%' },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#e2e8f0', alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, marginBottom: 4 },
  memberRowSelected: { backgroundColor: '#ede9fe' },
  memberAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#e0e7ff', justifyContent: 'center', alignItems: 'center' },
  memberAvatarSelected: { backgroundColor: '#6366f1' },
  memberAvatarText: { color: '#4338ca', fontWeight: '700', fontSize: 14 },
  memberName: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  memberEmail: { fontSize: 12, color: '#94a3b8' },

  // Legacy — referenced by EditableField but no longer visually used
  sectionLabel: { fontSize: 14, fontWeight: '600', color: '#6366f1', marginBottom: 12 },
  noAssigneesText: { fontSize: 13, color: '#cbd5e1' },
})
