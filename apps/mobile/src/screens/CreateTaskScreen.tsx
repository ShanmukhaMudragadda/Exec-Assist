import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RouteProp } from '@react-navigation/native'
import { tasksApi } from '../services/api'
import { MainStackParamList, TaskStatus, TaskPriority, CreateTaskInput } from '../types'
import { PRIORITY_COLORS, STATUS_COLORS, STATUS_LABELS } from '../components/TaskCard'

type Props = {
  navigation: NativeStackNavigationProp<MainStackParamList, 'CreateTask'>
  route: RouteProp<MainStackParamList, 'CreateTask'>
}

const PRIORITIES: TaskPriority[] = ['urgent', 'high', 'medium', 'low']
const STATUSES: TaskStatus[] = ['todo', 'in-progress', 'review', 'completed']
const CATEGORIES = ['Development', 'Design', 'Marketing', 'Operations', 'Finance', 'HR', 'Legal', 'Other']

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

function OptionPill<T extends string>({
  label,
  color,
  selected,
  onPress,
}: {
  label: string
  color: string
  selected: boolean
  onPress: () => void
}) {
  return (
    <TouchableOpacity
      style={[
        styles.pill,
        selected && { backgroundColor: color + '22', borderColor: color },
      ]}
      onPress={onPress}
    >
      <View style={[styles.pillDot, { backgroundColor: color }]} />
      <Text style={[styles.pillText, selected && { color, fontWeight: '700' }]}>{label}</Text>
    </TouchableOpacity>
  )
}

export default function CreateTaskScreen({ navigation, route }: Props) {
  const { workspaceId } = route.params
  const queryClient = useQueryClient()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<TaskStatus>('todo')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [category, setCategory] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])

  const createMutation = useMutation({
    mutationFn: (data: CreateTaskInput) =>
      tasksApi.create(workspaceId, data).then((r) => r.data.task),
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', workspaceId] })
      queryClient.invalidateQueries({ queryKey: ['analytics', workspaceId] })
      Alert.alert('Success', `Task "${task.title}" created!`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ])
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to create task.'
      Alert.alert('Error', msg)
    },
  })

  const addTag = () => {
    const trimmed = tagInput.trim().toLowerCase()
    if (trimmed && !tags.includes(trimmed) && tags.length < 10) {
      setTags((prev) => [...prev, trimmed])
      setTagInput('')
    }
  }

  const removeTag = (tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag))
  }

  const parseDueDate = (raw: string): string | undefined => {
    if (!raw.trim()) return undefined
    const d = new Date(raw.trim())
    if (isNaN(d.getTime())) return undefined
    return d.toISOString()
  }

  const handleCreate = () => {
    if (!title.trim()) {
      Alert.alert('Validation', 'Task title is required.')
      return
    }

    const parsedDate = parseDueDate(dueDate)
    if (dueDate.trim() && !parsedDate) {
      Alert.alert('Validation', 'Invalid due date. Use format: YYYY-MM-DD')
      return
    }

    createMutation.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      status,
      priority,
      category: category || undefined,
      tags,
      dueDate: parsedDate,
    })
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.modalHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.cancelBtn}>
          <Ionicons name="close" size={22} color="#6b7280" />
        </TouchableOpacity>
        <Text style={styles.modalTitle}>New Task</Text>
        <TouchableOpacity
          style={[styles.createBtn, createMutation.isPending && styles.createBtnDisabled]}
          onPress={handleCreate}
          disabled={createMutation.isPending || !title.trim()}
        >
          {createMutation.isPending ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text style={styles.createBtnText}>Create</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Title */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>
            Title <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={[styles.input, styles.titleInput]}
            placeholder="What needs to be done?"
            value={title}
            onChangeText={setTitle}
            placeholderTextColor="#9ca3af"
            multiline
            maxLength={200}
          />
        </View>

        {/* Description */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.descInput]}
            placeholder="Add details, context, or acceptance criteria..."
            value={description}
            onChangeText={setDescription}
            placeholderTextColor="#9ca3af"
            multiline
            maxLength={2000}
            textAlignVertical="top"
          />
        </View>

        {/* Priority */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Priority</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillRow}>
            {PRIORITIES.map((p) => (
              <OptionPill
                key={p}
                label={PRIORITY_LABELS[p]}
                color={PRIORITY_COLORS[p]}
                selected={priority === p}
                onPress={() => setPriority(p)}
              />
            ))}
          </ScrollView>
        </View>

        {/* Status */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Status</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillRow}>
            {STATUSES.map((s) => (
              <OptionPill
                key={s}
                label={STATUS_LABELS[s]}
                color={STATUS_COLORS[s]}
                selected={status === s}
                onPress={() => setStatus(s)}
              />
            ))}
          </ScrollView>
        </View>

        {/* Category */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillRow}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.categoryChip,
                  category === cat && styles.categoryChipActive,
                ]}
                onPress={() => setCategory(category === cat ? '' : cat)}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    category === cat && styles.categoryChipTextActive,
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Due Date */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Due Date</Text>
          <View style={styles.dueDateRow}>
            <Ionicons name="calendar-outline" size={16} color="#9ca3af" style={styles.dueDateIcon} />
            <TextInput
              style={[styles.input, styles.dueDateInput]}
              placeholder="YYYY-MM-DD  (e.g. 2024-12-31)"
              value={dueDate}
              onChangeText={setDueDate}
              placeholderTextColor="#9ca3af"
              keyboardType="numbers-and-punctuation"
              maxLength={10}
            />
          </View>
        </View>

        {/* Tags */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Tags</Text>
          <View style={styles.tagInputRow}>
            <TextInput
              style={[styles.input, styles.tagInput]}
              placeholder="Add tag and press +"
              value={tagInput}
              onChangeText={setTagInput}
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              onSubmitEditing={addTag}
              returnKeyType="done"
              maxLength={30}
            />
            <TouchableOpacity
              style={[styles.tagAddBtn, !tagInput.trim() && styles.tagAddBtnDisabled]}
              onPress={addTag}
              disabled={!tagInput.trim()}
            >
              <Ionicons name="add" size={20} color="white" />
            </TouchableOpacity>
          </View>
          {tags.length > 0 && (
            <View style={styles.tagsWrap}>
              {tags.map((tag) => (
                <TouchableOpacity
                  key={tag}
                  style={styles.tagChip}
                  onPress={() => removeTag(tag)}
                >
                  <Text style={styles.tagChipText}>{tag}</Text>
                  <Ionicons name="close" size={12} color="#6366f1" />
                </TouchableOpacity>
              ))}
            </View>
          )}
          <Text style={styles.tagHint}>Tap a tag to remove it. Max 10 tags.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f5f3ff' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  cancelBtn: { padding: 4 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  createBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 72,
    alignItems: 'center',
  },
  createBtnDisabled: { backgroundColor: '#c7d2fe' },
  createBtnText: { color: 'white', fontWeight: '700', fontSize: 14 },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 60 },
  fieldGroup: { marginBottom: 22 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  required: { color: '#ef4444' },
  input: {
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: '#111827',
    backgroundColor: 'white',
  },
  titleInput: { fontSize: 16, fontWeight: '500', minHeight: 50 },
  descInput: { minHeight: 100, paddingTop: 12 },
  pillRow: { flexDirection: 'row' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    marginRight: 7,
    backgroundColor: 'white',
    gap: 5,
  },
  pillDot: { width: 7, height: 7, borderRadius: 3.5 },
  pillText: { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    marginRight: 7,
    backgroundColor: 'white',
  },
  categoryChipActive: { backgroundColor: '#ede9fe', borderColor: '#6366f1' },
  categoryChipText: { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  categoryChipTextActive: { color: '#6366f1', fontWeight: '700' },
  dueDateRow: { flexDirection: 'row', alignItems: 'center' },
  dueDateIcon: { position: 'absolute', left: 12, zIndex: 1 },
  dueDateInput: { flex: 1, paddingLeft: 36 },
  tagInputRow: { flexDirection: 'row', gap: 8 },
  tagInput: { flex: 1 },
  tagAddBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tagAddBtnDisabled: { backgroundColor: '#c7d2fe' },
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ede9fe',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    gap: 4,
  },
  tagChipText: { fontSize: 12, color: '#6366f1', fontWeight: '600' },
  tagHint: { fontSize: 11, color: '#9ca3af', marginTop: 8 },
})
