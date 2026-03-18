import { useState } from 'react'
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
  FlatList,
} from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RouteProp } from '@react-navigation/native'
import { transcriptsApi, tasksApi } from '../services/api'
import { MainStackParamList } from '../types'

type Props = {
  navigation: NativeStackNavigationProp<MainStackParamList, 'Transcripts'>
  route: RouteProp<MainStackParamList, 'Transcripts'>
}

interface Transcript {
  id: string
  title: string
  content: string
  type: string
  processed: boolean
  createdAt: string
}

interface GeneratedTask {
  title: string
  description?: string
  priority: string
  category?: string
  tags?: string[]
  selected: boolean
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
}

const PRIORITY_BG: Record<string, string> = {
  urgent: '#fef2f2',
  high: '#fff7ed',
  medium: '#fefce8',
  low: '#f0fdf4',
}

function formatDate(str: string) {
  return new Date(str).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

// ─── Add Transcript Modal ─────────────────────────────────────────────────────

function AddTranscriptModal({
  visible,
  workspaceId,
  onClose,
  onSaved,
}: {
  visible: boolean
  workspaceId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [type, setType] = useState('meeting')

  const TYPE_OPTIONS = ['meeting', 'voice_note', 'recording']

  const mutation = useMutation({
    mutationFn: () =>
      transcriptsApi.createText(workspaceId, { title: title.trim(), content: content.trim(), type }),
    onSuccess: () => {
      setTitle('')
      setContent('')
      setType('meeting')
      onSaved()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to save transcript.'
      Alert.alert('Error', msg)
    },
  })

  const canSubmit = title.trim().length > 0 && content.trim().length >= 10 && !mutation.isPending

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.modalCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>New Transcript</Text>
          <TouchableOpacity
            onPress={() => mutation.mutate()}
            disabled={!canSubmit}
          >
            {mutation.isPending
              ? <ActivityIndicator size="small" color="#6366f1" />
              : <Text style={[styles.modalSave, !canSubmit && styles.modalSaveDisabled]}>Save</Text>
            }
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.fieldLabel}>Title</Text>
          <TextInput
            style={styles.fieldInput}
            placeholder="e.g. Q1 Planning Meeting"
            placeholderTextColor="#9ca3af"
            value={title}
            onChangeText={setTitle}
            maxLength={255}
          />

          <Text style={styles.fieldLabel}>Type</Text>
          <View style={styles.typeRow}>
            {TYPE_OPTIONS.map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.typeChip, type === t && styles.typeChipActive]}
                onPress={() => setType(t)}
              >
                <Text style={[styles.typeChipText, type === t && styles.typeChipTextActive]}>
                  {t.replace('_', ' ')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Content</Text>
          <TextInput
            style={[styles.fieldInput, styles.textArea]}
            placeholder="Paste your meeting notes or transcript here (min 10 characters)..."
            placeholderTextColor="#9ca3af"
            value={content}
            onChangeText={setContent}
            multiline
            textAlignVertical="top"
            maxLength={50000}
          />
          <Text style={styles.charCount}>{content.length} characters</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ─── Generated Tasks Modal ────────────────────────────────────────────────────

function GeneratedTasksModal({
  tasks,
  workspaceId,
  transcriptId,
  onClose,
  onSaved,
}: {
  tasks: GeneratedTask[]
  workspaceId: string
  transcriptId: string
  onClose: () => void
  onSaved: (count: number) => void
}) {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<GeneratedTask[]>(tasks)

  const toggle = (idx: number) => {
    setSelected((prev) => prev.map((t, i) => i === idx ? { ...t, selected: !t.selected } : t))
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const toSave = selected.filter((t) => t.selected)
      return transcriptsApi.saveTasks(workspaceId, transcriptId, toSave)
    },
    onSuccess: () => {
      const count = selected.filter((t) => t.selected).length
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      onSaved(count)
    },
    onError: () => Alert.alert('Error', 'Failed to save tasks.'),
  })

  const selectedCount = selected.filter((t) => t.selected).length

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.flex}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.modalCancel}>Discard</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Generated Tasks</Text>
          <TouchableOpacity
            onPress={() => saveMutation.mutate()}
            disabled={selectedCount === 0 || saveMutation.isPending}
          >
            {saveMutation.isPending
              ? <ActivityIndicator size="small" color="#6366f1" />
              : <Text style={[styles.modalSave, selectedCount === 0 && styles.modalSaveDisabled]}>
                  Save {selectedCount > 0 ? `(${selectedCount})` : ''}
                </Text>
            }
          </TouchableOpacity>
        </View>
        <Text style={styles.genSubtitle}>Tap to toggle. Selected tasks will be added to your workspace.</Text>

        <FlatList
          data={selected}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              style={[styles.genTaskCard, !item.selected && styles.genTaskCardOff]}
              onPress={() => toggle(index)}
              activeOpacity={0.8}
            >
              <View style={[styles.genCheckbox, item.selected && styles.genCheckboxOn]}>
                {item.selected && <Ionicons name="checkmark" size={13} color="white" />}
              </View>
              <View style={styles.genTaskInfo}>
                <Text style={[styles.genTaskTitle, !item.selected && styles.genTaskTitleOff]} numberOfLines={2}>
                  {item.title}
                </Text>
                {item.description ? (
                  <Text style={styles.genTaskDesc} numberOfLines={2}>{item.description}</Text>
                ) : null}
                <View style={styles.genTaskMeta}>
                  {item.priority && (
                    <View style={[styles.priorityBadge, { backgroundColor: PRIORITY_BG[item.priority] || '#f3f4f6' }]}>
                      <View style={[styles.priorityDot, { backgroundColor: PRIORITY_COLORS[item.priority] || '#9ca3af' }]} />
                      <Text style={[styles.priorityText, { color: PRIORITY_COLORS[item.priority] || '#6b7280' }]}>
                        {item.priority}
                      </Text>
                    </View>
                  )}
                  {item.category && (
                    <View style={styles.categoryBadge}>
                      <Text style={styles.categoryText}>{item.category}</Text>
                    </View>
                  )}
                  {item.tags?.slice(0, 2).map((tag) => (
                    <View key={tag} style={styles.tagBadge}>
                      <Text style={styles.tagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      </View>
    </Modal>
  )
}

// ─── Transcript Card ──────────────────────────────────────────────────────────

function TranscriptCard({
  transcript,
  onGenerate,
  isGenerating,
}: {
  transcript: Transcript
  onGenerate: () => void
  isGenerating: boolean
}) {
  return (
    <View style={styles.transcriptCard}>
      <View style={styles.transcriptHeader}>
        <View style={[styles.transcriptIcon, { backgroundColor: transcript.type === 'meeting' ? '#ede9fe' : '#e0f2fe' }]}>
          <Ionicons
            name={transcript.type === 'meeting' ? 'people-outline' : 'document-text-outline'}
            size={16}
            color={transcript.type === 'meeting' ? '#6366f1' : '#0ea5e9'}
          />
        </View>
        <View style={styles.transcriptMeta}>
          <Text style={styles.transcriptTitle} numberOfLines={1}>{transcript.title}</Text>
          <View style={styles.transcriptBadgeRow}>
            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>{transcript.type.replace('_', ' ')}</Text>
            </View>
            <Text style={styles.transcriptDate}>{formatDate(transcript.createdAt)}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.transcriptContent} numberOfLines={3}>{transcript.content}</Text>

      <TouchableOpacity
        style={[styles.generateBtn, isGenerating && styles.generateBtnDisabled]}
        onPress={onGenerate}
        disabled={isGenerating}
      >
        {isGenerating ? (
          <>
            <ActivityIndicator size="small" color="#6366f1" />
            <Text style={styles.generateBtnText}>Generating tasks...</Text>
          </>
        ) : (
          <>
            <Ionicons name="sparkles-outline" size={15} color="#6366f1" />
            <Text style={styles.generateBtnText}>Generate Tasks with AI</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  )
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function TranscriptsScreen({ route }: Props) {
  const { workspaceId } = route.params
  const queryClient = useQueryClient()

  const [showAddModal, setShowAddModal] = useState(false)
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [generatedTasks, setGeneratedTasks] = useState<GeneratedTask[] | null>(null)
  const [generatedTranscriptId, setGeneratedTranscriptId] = useState<string | null>(null)

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['transcripts', workspaceId],
    queryFn: () => transcriptsApi.list(workspaceId).then((r) => r.data),
  })

  const transcripts: Transcript[] = (data as { transcripts?: Transcript[] })?.transcripts ?? []

  const handleGenerate = async (transcript: Transcript) => {
    setGeneratingId(transcript.id)
    try {
      const res = await transcriptsApi.generateTasks(workspaceId, transcript.id)
      const raw = (res.data as { extractedTasks?: GeneratedTask[]; tasks?: GeneratedTask[] })?.extractedTasks
        ?? (res.data as { tasks?: GeneratedTask[] })?.tasks
        ?? []
      const tasks: GeneratedTask[] = (raw as Omit<GeneratedTask, 'selected'>[]).map((t) => ({ ...t, selected: true }))
      if (tasks.length === 0) {
        Alert.alert('No tasks found', 'AI could not extract tasks from this transcript.')
        return
      }
      setGeneratedTasks(tasks)
      setGeneratedTranscriptId(transcript.id)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to generate tasks.'
      Alert.alert('Error', msg)
    } finally {
      setGeneratingId(null)
    }
  }

  return (
    <View style={styles.container}>
      {isLoading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color="#6366f1" />
        </View>
      ) : transcripts.length === 0 ? (
        <ScrollView contentContainerStyle={styles.emptyWrap}>
          <View style={styles.emptyIcon}>
            <Ionicons name="document-text-outline" size={44} color="#6366f1" />
          </View>
          <Text style={styles.emptyTitle}>No transcripts yet</Text>
          <Text style={styles.emptyText}>
            Paste meeting notes or transcript text, then let AI extract action items for you.
          </Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowAddModal(true)}>
            <Ionicons name="add" size={18} color="white" />
            <Text style={styles.emptyBtnText}>Add Transcript</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <FlatList
          data={transcripts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onRefresh={refetch}
          refreshing={isFetching && !isLoading}
          renderItem={({ item }) => (
            <TranscriptCard
              transcript={item}
              isGenerating={generatingId === item.id}
              onGenerate={() => handleGenerate(item)}
            />
          )}
          ListFooterComponent={
            <TouchableOpacity style={styles.addMoreBtn} onPress={() => setShowAddModal(true)}>
              <Ionicons name="add-circle-outline" size={18} color="#6366f1" />
              <Text style={styles.addMoreText}>Add Another Transcript</Text>
            </TouchableOpacity>
          }
        />
      )}

      {/* FAB */}
      {transcripts.length > 0 && (
        <TouchableOpacity style={styles.fab} onPress={() => setShowAddModal(true)}>
          <Ionicons name="add" size={24} color="white" />
        </TouchableOpacity>
      )}

      <AddTranscriptModal
        visible={showAddModal}
        workspaceId={workspaceId}
        onClose={() => setShowAddModal(false)}
        onSaved={() => {
          setShowAddModal(false)
          queryClient.invalidateQueries({ queryKey: ['transcripts', workspaceId] })
          Alert.alert('Saved!', 'Transcript saved. Tap "Generate Tasks" to extract action items.')
        }}
      />

      {generatedTasks && generatedTranscriptId && (
        <GeneratedTasksModal
          tasks={generatedTasks}
          workspaceId={workspaceId}
          transcriptId={generatedTranscriptId}
          onClose={() => { setGeneratedTasks(null); setGeneratedTranscriptId(null) }}
          onSaved={(count) => {
            setGeneratedTasks(null)
            setGeneratedTranscriptId(null)
            Alert.alert('Done!', `${count} task${count !== 1 ? 's' : ''} added to your workspace.`)
          }}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: 'white' },
  container: { flex: 1, backgroundColor: '#f5f3ff' },
  loaderWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Empty state
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 20, backgroundColor: '#ede9fe',
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#6366f1', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12,
  },
  emptyBtnText: { color: 'white', fontSize: 15, fontWeight: '700' },

  // List
  listContent: { padding: 16, paddingBottom: 100 },
  addMoreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#c7d2fe',
    borderRadius: 14, marginTop: 4,
  },
  addMoreText: { fontSize: 14, color: '#6366f1', fontWeight: '600' },

  // Transcript card
  transcriptCard: {
    backgroundColor: 'white', borderRadius: 16, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  transcriptHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  transcriptIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  transcriptMeta: { flex: 1 },
  transcriptTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 4 },
  transcriptBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typeBadge: { backgroundColor: '#ede9fe', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  typeBadgeText: { fontSize: 10, color: '#6366f1', fontWeight: '700', textTransform: 'capitalize' },
  transcriptDate: { fontSize: 11, color: '#9ca3af' },
  transcriptContent: { fontSize: 13, color: '#6b7280', lineHeight: 20, marginBottom: 12 },
  generateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderColor: '#c7d2fe', borderRadius: 10,
    paddingVertical: 10, backgroundColor: '#ede9fe',
  },
  generateBtnDisabled: { opacity: 0.6 },
  generateBtnText: { fontSize: 13, color: '#6366f1', fontWeight: '700' },

  // FAB
  fab: {
    position: 'absolute', right: 20, bottom: 24,
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#6366f1', justifyContent: 'center', alignItems: 'center',
    shadowColor: '#6366f1', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 8,
  },

  // Modal
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  modalCancel: { fontSize: 15, color: '#6b7280', fontWeight: '500' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  modalSave: { fontSize: 15, color: '#6366f1', fontWeight: '700' },
  modalSaveDisabled: { color: '#c7d2fe' },
  modalScroll: { flex: 1 },
  modalContent: { padding: 20, paddingBottom: 40 },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 16 },
  fieldInput: {
    borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#111827', backgroundColor: '#f9fafb',
  },
  textArea: { minHeight: 180, textAlignVertical: 'top', paddingTop: 12 },
  charCount: { fontSize: 11, color: '#9ca3af', textAlign: 'right', marginTop: 4 },

  typeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  typeChip: {
    borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7, backgroundColor: 'white',
  },
  typeChipActive: { borderColor: '#6366f1', backgroundColor: '#ede9fe' },
  typeChipText: { fontSize: 13, color: '#6b7280', fontWeight: '500', textTransform: 'capitalize' },
  typeChipTextActive: { color: '#6366f1', fontWeight: '700' },

  // Generated tasks modal
  genSubtitle: { fontSize: 12, color: '#9ca3af', paddingHorizontal: 16, paddingBottom: 4 },
  genTaskCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: 'white', borderRadius: 12, padding: 12, marginBottom: 8,
    borderWidth: 1.5, borderColor: '#c7d2fe',
  },
  genTaskCardOff: { backgroundColor: '#f9fafb', borderColor: '#e5e7eb', opacity: 0.6 },
  genCheckbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: '#d1d5db',
    justifyContent: 'center', alignItems: 'center', flexShrink: 0, marginTop: 1,
  },
  genCheckboxOn: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  genTaskInfo: { flex: 1 },
  genTaskTitle: { fontSize: 14, fontWeight: '600', color: '#111827', lineHeight: 20 },
  genTaskTitleOff: { color: '#9ca3af' },
  genTaskDesc: { fontSize: 12, color: '#6b7280', lineHeight: 18, marginTop: 2 },
  genTaskMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  priorityBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  priorityDot: { width: 5, height: 5, borderRadius: 2.5 },
  priorityText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  categoryBadge: { backgroundColor: '#ede9fe', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  categoryText: { fontSize: 10, color: '#6366f1', fontWeight: '600' },
  tagBadge: { backgroundColor: '#f3f4f6', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  tagText: { fontSize: 10, color: '#6b7280', fontWeight: '500' },
})
