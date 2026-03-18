import { useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, Alert, ScrollView,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RouteProp } from '@react-navigation/native'
import { tasksApi, workspacesApi } from '../services/api'
import { MainStackParamList, TaskPriority, TaskStatus } from '../types'

type Props = {
  navigation: NativeStackNavigationProp<MainStackParamList, 'AITasksPreview'>
  route: RouteProp<MainStackParamList, 'AITasksPreview'>
}

interface PreviewTask {
  _id: string
  title: string
  description: string
  priority: TaskPriority
  status: TaskStatus
  category: string
  tags: string[]
  dueDate: string
  assigneeIds: string[]
  selected: boolean
  expanded: boolean
}

const PRIORITIES: TaskPriority[] = ['urgent', 'high', 'medium', 'low']
const STATUSES: TaskStatus[] = ['todo', 'in-progress', 'in-review', 'completed']
const PRIORITY_COLORS: Record<TaskPriority, string> = {
  urgent: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e',
}
const STATUS_COLORS: Record<string, string> = {
  todo: '#6b7280', 'in-progress': '#3b82f6', 'in-review': '#a855f7', completed: '#22c55e',
}
const STATUS_LABELS: Record<string, string> = {
  todo: 'To Do', 'in-progress': 'In Progress', 'in-review': 'In Review', completed: 'Completed',
}

export default function AITasksPreviewScreen({ navigation, route }: Props) {
  const { tasks: initialTasks, workspaceId, sourceType } = route.params
  const queryClient = useQueryClient()
  const insets = useSafeAreaInsets()

  const [previewTasks, setPreviewTasks] = useState<PreviewTask[]>(
    initialTasks.map((t, i) => ({
      _id: `${i}-${Date.now()}`,
      title: t.title,
      description: t.description || '',
      priority: (t.priority as TaskPriority) || 'medium',
      status: ((t as any).status as TaskStatus) || 'todo',
      category: t.category || '',
      tags: t.tags || [],
      dueDate: (t as any).dueDate || '',
      assigneeIds: (t as any).assigneeIds || [],
      selected: true,
      expanded: false,
    }))
  )
  const [tagInputs, setTagInputs] = useState<Record<string, string>>({})

  const { data: membersData } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => workspacesApi.getMembers(workspaceId).then((r) => r.data),
  })
  const members = membersData?.members || []

  const selectedCount = previewTasks.filter((t) => t.selected).length

  const update = (id: string, updates: Partial<PreviewTask>) =>
    setPreviewTasks((p) => p.map((t) => (t._id === id ? { ...t, ...updates } : t)))

  const createMutation = useMutation({
    mutationFn: async () => {
      const selected = previewTasks.filter((t) => t.selected)
      await Promise.all(
        selected.map((t) =>
          tasksApi.create(workspaceId, {
            title: t.title,
            description: t.description || undefined,
            priority: t.priority,
            status: t.status,
            category: t.category || undefined,
            tags: t.tags,
            dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : undefined,
            assigneeIds: t.assigneeIds.length > 0 ? t.assigneeIds : undefined,
          })
        )
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', workspaceId] })
      const count = previewTasks.filter((t) => t.selected).length
      Alert.alert('Done!', `${count} task${count !== 1 ? 's' : ''} created.`, [
        { text: 'OK', onPress: () => navigation.navigate('Main', { workspaceId } as never) },
      ])
    },
    onError: () => Alert.alert('Error', 'Failed to create tasks.'),
  })

  const renderTask = ({ item: task }: { item: PreviewTask }) => {
    const tagInput = tagInputs[task._id] || ''
    const setTagInput = (v: string) => setTagInputs((prev) => ({ ...prev, [task._id]: v }))
    const addTag = () => {
      const trimmed = tagInput.trim()
      if (trimmed && !task.tags.includes(trimmed)) {
        update(task._id, { tags: [...task.tags, trimmed] })
      }
      setTagInput('')
    }
    const removeTag = (tag: string) => update(task._id, { tags: task.tags.filter((t) => t !== tag) })
    const toggleAssignee = (uid: string) => {
      const ids = task.assigneeIds.includes(uid)
        ? task.assigneeIds.filter((id) => id !== uid)
        : [...task.assigneeIds, uid]
      update(task._id, { assigneeIds: ids })
    }

    return (
      <View style={[styles.card, !task.selected && styles.cardDeselected]}>
        {/* Top row: checkbox + title + expand */}
        <View style={styles.cardTopRow}>
          <TouchableOpacity
            onPress={() => update(task._id, { selected: !task.selected })}
            style={styles.checkBtn}
          >
            <Ionicons
              name={task.selected ? 'checkbox' : 'square-outline'}
              size={24}
              color={task.selected ? '#6366f1' : '#9ca3af'}
            />
          </TouchableOpacity>
          <TextInput
            style={styles.titleInput}
            value={task.title}
            onChangeText={(v) => update(task._id, { title: v })}
            placeholder="Task title"
            placeholderTextColor="#9ca3af"
          />
          <TouchableOpacity
            onPress={() => update(task._id, { expanded: !task.expanded })}
            style={styles.expandBtn}
          >
            <Ionicons
              name={task.expanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={task.expanded ? '#6366f1' : '#9ca3af'}
            />
          </TouchableOpacity>
        </View>

        {/* Priority row — always visible */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.priorityScroll}>
          {PRIORITIES.map((p) => (
            <TouchableOpacity
              key={p}
              onPress={() => update(task._id, { priority: p })}
              style={[
                styles.priorityPill,
                task.priority === p && { backgroundColor: PRIORITY_COLORS[p] + '22', borderColor: PRIORITY_COLORS[p] },
              ]}
            >
              <View style={[styles.priorityDot, { backgroundColor: PRIORITY_COLORS[p] }]} />
              <Text style={[styles.priorityPillText, task.priority === p && { color: PRIORITY_COLORS[p], fontWeight: '700' }]}>
                {p}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Collapsed summary */}
        {!task.expanded && (
          <View style={styles.summaryRow}>
            {task.description ? (
              <Text style={styles.summaryDesc} numberOfLines={1}>{task.description}</Text>
            ) : null}
            <View style={styles.summaryMeta}>
              {task.status !== 'todo' && (
                <View style={[styles.statusPill, { backgroundColor: STATUS_COLORS[task.status] + '18' }]}>
                  <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[task.status] }]} />
                  <Text style={[styles.statusPillText, { color: STATUS_COLORS[task.status] }]}>
                    {STATUS_LABELS[task.status]}
                  </Text>
                </View>
              )}
              {task.dueDate ? (
                <View style={styles.dueBadge}>
                  <Ionicons name="calendar-outline" size={12} color="#9ca3af" />
                  <Text style={styles.dueText}>{task.dueDate}</Text>
                </View>
              ) : null}
              {task.assigneeIds.length > 0 && (
                <View style={styles.assigneeBadge}>
                  <Ionicons name="people-outline" size={12} color="#6366f1" />
                  <Text style={styles.assigneeBadgeText}>{task.assigneeIds.length} assigned</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Expanded editing */}
        {task.expanded && (
          <View style={styles.expandedSection}>
            <View style={styles.expandedDivider} />

            {/* Description */}
            <View style={styles.editField}>
              <Text style={styles.editLabel}>Description</Text>
              <TextInput
                style={[styles.editInput, styles.editMultiline]}
                value={task.description}
                onChangeText={(v) => update(task._id, { description: v })}
                placeholder="Add a description..."
                placeholderTextColor="#9ca3af"
                multiline
                textAlignVertical="top"
              />
            </View>

            {/* Status */}
            <View style={styles.editField}>
              <Text style={styles.editLabel}>Status</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {STATUSES.map((s) => (
                  <TouchableOpacity
                    key={s}
                    onPress={() => update(task._id, { status: s })}
                    style={[
                      styles.statusChip,
                      task.status === s && { backgroundColor: STATUS_COLORS[s] + '22', borderColor: STATUS_COLORS[s] },
                    ]}
                  >
                    <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[s] }]} />
                    <Text style={[styles.statusChipText, task.status === s && { color: STATUS_COLORS[s], fontWeight: '700' }]}>
                      {STATUS_LABELS[s]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Due Date */}
            <View style={styles.editField}>
              <Text style={styles.editLabel}>Due Date</Text>
              <TextInput
                style={styles.editInput}
                value={task.dueDate}
                onChangeText={(v) => update(task._id, { dueDate: v })}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#9ca3af"
                keyboardType="numbers-and-punctuation"
              />
            </View>

            {/* Category */}
            <View style={styles.editField}>
              <Text style={styles.editLabel}>Category</Text>
              <TextInput
                style={styles.editInput}
                value={task.category}
                onChangeText={(v) => update(task._id, { category: v })}
                placeholder="e.g. Frontend, Design"
                placeholderTextColor="#9ca3af"
              />
            </View>

            {/* Tags */}
            <View style={styles.editField}>
              <Text style={styles.editLabel}>Tags</Text>
              <View style={styles.tagInputRow}>
                <TextInput
                  style={[styles.editInput, { flex: 1 }]}
                  value={tagInput}
                  onChangeText={setTagInput}
                  placeholder="Add tag..."
                  placeholderTextColor="#9ca3af"
                  onSubmitEditing={addTag}
                  returnKeyType="done"
                />
                <TouchableOpacity style={styles.tagAddBtn} onPress={addTag}>
                  <Ionicons name="add" size={18} color="white" />
                </TouchableOpacity>
              </View>
              {task.tags.length > 0 && (
                <View style={styles.tagsWrap}>
                  {task.tags.map((tag) => (
                    <TouchableOpacity key={tag} style={styles.tagChip} onPress={() => removeTag(tag)}>
                      <Text style={styles.tagChipText}>{tag}</Text>
                      <Ionicons name="close" size={11} color="#6366f1" />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Assignees */}
            {members.length > 0 && (
              <View style={styles.editField}>
                <Text style={styles.editLabel}>Assignees</Text>
                <View style={styles.membersWrap}>
                  {members.map((m) => {
                    const isSelected = task.assigneeIds.includes(m.userId)
                    return (
                      <TouchableOpacity
                        key={m.userId}
                        style={[styles.memberChip, isSelected && styles.memberChipSelected]}
                        onPress={() => toggleAssignee(m.userId)}
                      >
                        <View style={[styles.memberAvatar, isSelected && styles.memberAvatarSelected]}>
                          <Text style={styles.memberAvatarText}>
                            {m.user.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <Text
                          style={[styles.memberChipName, isSelected && styles.memberChipNameSelected]}
                          numberOfLines={1}
                        >
                          {m.user.name}
                        </Text>
                        {isSelected && <Ionicons name="checkmark-circle" size={14} color="#6366f1" />}
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </View>
            )}
          </View>
        )}
      </View>
    )
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={22} color="#6b7280" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>AI Generated Tasks</Text>
          <Text style={styles.headerSub}>
            {sourceType === 'transcript' ? '📄 From transcript' :
             sourceType === 'audio' ? '🎙 From audio' :
             sourceType === 'live' ? '🔴 From live recording' :
             sourceType === 'excel' ? '📊 From spreadsheet' : 'Review & create'}
          </Text>
        </View>
        <View style={styles.selectBtns}>
          <TouchableOpacity onPress={() => setPreviewTasks((p) => p.map((t) => ({ ...t, selected: true })))}>
            <Text style={styles.selectAllBtn}>All</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setPreviewTasks((p) => p.map((t) => ({ ...t, selected: false })))}>
            <Text style={styles.selectNoneBtn}>None</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Count bar */}
      <View style={styles.countBar}>
        <Text style={styles.countText}>
          <Text style={styles.countNum}>{previewTasks.length}</Text> tasks ·{' '}
          <Text style={styles.countNum}>{selectedCount}</Text> selected
        </Text>
        <Text style={styles.countHint}>Tap ↓ to edit all fields</Text>
      </View>

      <FlatList
        data={previewTasks}
        keyExtractor={(t) => t._id}
        contentContainerStyle={styles.list}
        renderItem={renderTask}
        keyboardShouldPersistTaps="handled"
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
        <TouchableOpacity
          style={[styles.createBtn, (selectedCount === 0 || createMutation.isPending) && styles.createBtnDisabled]}
          onPress={() => createMutation.mutate()}
          disabled={selectedCount === 0 || createMutation.isPending}
        >
          {createMutation.isPending ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <Text style={styles.createBtnText}>
              Create {selectedCount} Task{selectedCount !== 1 ? 's' : ''}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f3ff' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  headerBtn: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  headerSub: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  selectBtns: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  selectAllBtn: { fontSize: 13, color: '#6366f1', fontWeight: '600' },
  selectNoneBtn: { fontSize: 13, color: '#9ca3af', fontWeight: '600' },
  countBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: '#ede9fe', borderBottomWidth: 1, borderBottomColor: '#ddd6fe',
  },
  countText: { fontSize: 13, color: '#6b7280' },
  countNum: { fontWeight: '700', color: '#4f46e5' },
  countHint: { fontSize: 11, color: '#a5b4fc' },
  list: { padding: 14, paddingBottom: 8 },

  // Card
  card: {
    backgroundColor: 'white', borderRadius: 14, padding: 14,
    marginBottom: 10, borderWidth: 1.5, borderColor: '#e5e7eb',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  cardDeselected: { opacity: 0.4, backgroundColor: '#f9fafb' },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  checkBtn: { flexShrink: 0 },
  titleInput: {
    flex: 1, fontSize: 15, fontWeight: '700', color: '#111827',
    borderBottomWidth: 1.5, borderBottomColor: '#e5e7eb', paddingBottom: 3,
  },
  expandBtn: { width: 28, height: 28, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },

  // Priority row
  priorityScroll: { marginBottom: 8 },
  priorityPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
    borderWidth: 1.5, borderColor: '#e5e7eb', marginRight: 6, backgroundColor: 'white',
  },
  priorityDot: { width: 7, height: 7, borderRadius: 3.5 },
  priorityPillText: { fontSize: 12, color: '#6b7280', fontWeight: '500' },

  // Collapsed summary
  summaryRow: { gap: 4 },
  summaryDesc: { fontSize: 12, color: '#9ca3af', lineHeight: 17 },
  summaryMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusPillText: { fontSize: 11, fontWeight: '600' },
  dueBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dueText: { fontSize: 11, color: '#9ca3af' },
  assigneeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  assigneeBadgeText: { fontSize: 11, color: '#6366f1', fontWeight: '600' },

  // Expanded section
  expandedSection: { marginTop: 4 },
  expandedDivider: { height: 1, backgroundColor: '#f3f4f6', marginBottom: 14 },
  editField: { marginBottom: 14 },
  editLabel: { fontSize: 11, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  editInput: {
    borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: '#111827', backgroundColor: '#fafafa',
  },
  editMultiline: { minHeight: 64, textAlignVertical: 'top', paddingTop: 8 },

  // Status chips
  statusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
    borderWidth: 1.5, borderColor: '#e5e7eb', marginRight: 6, backgroundColor: 'white',
  },
  statusChipText: { fontSize: 12, color: '#6b7280', fontWeight: '500' },

  // Tags
  tagInputRow: { flexDirection: 'row', gap: 8 },
  tagAddBtn: { width: 38, height: 38, borderRadius: 8, backgroundColor: '#6366f1', justifyContent: 'center', alignItems: 'center' },
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  tagChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#ede9fe', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
  },
  tagChipText: { fontSize: 12, color: '#6366f1', fontWeight: '600' },

  // Members
  membersWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  memberChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1.5, borderColor: '#e5e7eb', backgroundColor: 'white',
  },
  memberChipSelected: { borderColor: '#6366f1', backgroundColor: '#ede9fe' },
  memberAvatar: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#d1d5db', justifyContent: 'center', alignItems: 'center',
  },
  memberAvatarSelected: { backgroundColor: '#6366f1' },
  memberAvatarText: { fontSize: 10, fontWeight: '700', color: 'white' },
  memberChipName: { fontSize: 12, color: '#6b7280', fontWeight: '500', maxWidth: 90 },
  memberChipNameSelected: { color: '#4f46e5', fontWeight: '600' },

  // Footer
  footer: { padding: 16, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  createBtn: {
    backgroundColor: '#6366f1', borderRadius: 12, paddingVertical: 15,
    alignItems: 'center', shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 3,
  },
  createBtnDisabled: { backgroundColor: '#c7d2fe', shadowOpacity: 0 },
  createBtnText: { color: 'white', fontSize: 16, fontWeight: '700' },
})
