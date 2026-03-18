import { useState, useRef, useEffect } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform, FlatList, Dimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { Audio } from 'expo-av'
import * as DocumentPicker from 'expo-document-picker'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RouteProp } from '@react-navigation/native'
import { transcriptsApi, tasksApi, workspacesApi, importApi } from '../services/api'
import { MainStackParamList, TaskPriority } from '../types'

type Mode = 'manual' | 'transcript' | 'audio' | 'live' | 'excel' | null
type Step = 'pick-mode' | 'pick-transcript' | 'create-transcript' | 'record-audio' | 'record-live' | 'upload-excel' | 'processing' | 'preview' | 'manual-form'

type Props = {
  navigation: NativeStackNavigationProp<MainStackParamList, 'SmartCreate'>
  route: RouteProp<MainStackParamList, 'SmartCreate'>
}

interface ExtractedTask {
  title: string
  description?: string
  priority: TaskPriority
  category?: string
  tags?: string[]
  dueDate?: string | null
}

interface PreviewTask extends ExtractedTask {
  _id: string
  selected: boolean
}

const PRIORITIES: TaskPriority[] = ['urgent', 'high', 'medium', 'low']
const PRIORITY_COLORS: Record<TaskPriority, string> = {
  urgent: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e',
}

function modeFirstStep(m: Mode): Step {
  if (m === 'manual') return 'manual-form'
  if (m === 'transcript') return 'pick-transcript'
  if (m === 'audio') return 'record-audio'
  if (m === 'live') return 'record-live'
  if (m === 'excel') return 'upload-excel'
  return 'pick-mode'
}

export default function SmartCreateScreen({ navigation, route }: Props) {
  const { workspaceId, initialMode = null } = route.params
  const queryClient = useQueryClient()
  const insets = useSafeAreaInsets()

  const [mode, setMode] = useState<Mode>(initialMode)
  const [step, setStep] = useState<Step>(initialMode ? modeFirstStep(initialMode) : 'pick-mode')
  const [processingLabel, setProcessingLabel] = useState('')

  // Transcript mode
  const [selectedTranscriptId, setSelectedTranscriptId] = useState('')
  const [newTxTitle, setNewTxTitle] = useState('')
  const [newTxContent, setNewTxContent] = useState('')

  // Audio mode
  const [audioUri, setAudioUri] = useState<string | null>(null)
  const [audioName, setAudioName] = useState('')
  const [audioMime, setAudioMime] = useState('audio/mpeg')

  // Excel mode
  const [excelUri, setExcelUri] = useState<string | null>(null)
  const [excelName, setExcelName] = useState('')
  const [excelMime, setExcelMime] = useState('')
  const [savedTranscriptId, setSavedTranscriptId] = useState('')

  // Live recording mode
  const [isRecording, setIsRecording] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [liveRecordingUri, setLiveRecordingUri] = useState<string | null>(null)
  const recordingRef = useRef<Audio.Recording | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Preview
  const [previewTasks, setPreviewTasks] = useState<PreviewTask[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)

  // Manual form
  const [mTitle, setMTitle] = useState('')
  const [mDescription, setMDescription] = useState('')
  const [mPriority, setMPriority] = useState<TaskPriority>('medium')
  const [mCategory, setMCategory] = useState('')
  const [mDueDate, setMDueDate] = useState('')
  const [mTagInput, setMTagInput] = useState('')
  const [mTags, setMTags] = useState<string[]>([])
  const [mAssigneeIds, setMAssigneeIds] = useState<string[]>([])

  const { data: transcriptsData } = useQuery({
    queryKey: ['transcripts', workspaceId],
    queryFn: () => transcriptsApi.list(workspaceId).then((r) => r.data),
    enabled: step === 'pick-transcript',
  })
  const transcripts = transcriptsData?.transcripts || []

  const { data: membersData } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => workspacesApi.getMembers(workspaceId).then((r) => r.data),
    enabled: step === 'manual-form',
  })
  const workspaceMembers = membersData?.members || []

  // ── Audio permission ────────────────────────────────────────────────────────
  useEffect(() => {
    Audio.requestPermissionsAsync()
    return () => {
      stopRecording()
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // ── AI task extraction ──────────────────────────────────────────────────────
  const generateFromTranscriptId = async (transcriptId: string) => {
    setStep('processing')
    setProcessingLabel('Analyzing with AI...')
    try {
      const res = await transcriptsApi.generateTasks(workspaceId, transcriptId)
      const extracted = res.data.extractedTasks || []
      if (extracted.length === 0) {
        Alert.alert('No tasks found', 'The AI could not identify tasks in this content.')
        setStep(mode === 'transcript' ? 'pick-transcript' : mode === 'audio' ? 'record-audio' : 'record-live')
        return
      }
      navigation.navigate('AITasksPreview', {
        tasks: extracted,
        workspaceId,
        sourceType: mode || 'transcript',
        sourceId: transcriptId || undefined,
      })
      // Reset step so pressing back from preview returns to the right screen (not the spinner)
      setStep(mode === 'transcript' ? 'pick-transcript' : mode === 'audio' ? 'record-audio' : 'record-live')
    } catch {
      Alert.alert('Error', 'Failed to generate tasks from this content.')
      setStep(mode === 'transcript' ? 'pick-transcript' : mode === 'audio' ? 'record-audio' : 'record-live')
    }
  }

  // ── Create new transcript inline then generate ─────────────────────────────
  const createTranscriptMutation = useMutation({
    mutationFn: () =>
      transcriptsApi.createText(workspaceId, {
        title: newTxTitle.trim() || `Transcript — ${new Date().toLocaleString()}`,
        content: newTxContent.trim(),
        type: 'meeting',
      }),
    onSuccess: (res) => {
      setSavedTranscriptId(res.data.transcript.id)
      generateFromTranscriptId(res.data.transcript.id)
    },
    onError: () => Alert.alert('Error', 'Failed to save transcript.'),
  })

  // ── Transcript mode ─────────────────────────────────────────────────────────
  const handleGenerateFromTranscript = () => {
    if (!selectedTranscriptId) return
    setSavedTranscriptId(selectedTranscriptId)
    generateFromTranscriptId(selectedTranscriptId)
  }

  // ── Audio file mode ─────────────────────────────────────────────────────────
  const handlePickAudio = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'audio/*',
      copyToCacheDirectory: true,
    })
    if (result.canceled || !result.assets?.[0]) return
    const asset = result.assets[0]
    setAudioUri(asset.uri)
    setAudioName(asset.name)
    setAudioMime(asset.mimeType || 'audio/mpeg')
  }

  const handleUploadAudio = async () => {
    if (!audioUri) return
    setStep('processing')
    setProcessingLabel('Uploading & transcribing...')
    try {
      const res = await transcriptsApi.uploadAudio(workspaceId, audioUri, audioName, audioMime)
      const transcriptId = res.data.transcript.id
      setSavedTranscriptId(transcriptId)
      setProcessingLabel('Extracting tasks...')
      await generateFromTranscriptId(transcriptId)
    } catch {
      Alert.alert('Error', 'Failed to process the audio file.')
      setStep('record-audio')
    }
  }

  // ── Excel import mode ───────────────────────────────────────────────────────
  const handlePickExcel = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv',
        'application/csv',
        '*/*', // fallback — some devices don't expose exact MIME
      ],
      copyToCacheDirectory: true,
    })
    if (result.canceled || !result.assets?.[0]) return
    const asset = result.assets[0]
    const name = asset.name || 'spreadsheet'
    const ext = name.split('.').pop()?.toLowerCase()
    if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
      Alert.alert('Unsupported file', 'Please select an .xlsx, .xls, or .csv file.')
      return
    }
    setExcelUri(asset.uri)
    setExcelName(name)
    setExcelMime(asset.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  }

  const handleUploadExcel = async () => {
    if (!excelUri) return
    setStep('processing')
    setProcessingLabel('Reading spreadsheet & extracting tasks with AI...')
    try {
      const res = await importApi.uploadExcel(workspaceId, excelUri, excelName, excelMime)
      const extracted = res.data.extractedTasks
      if (!extracted.length) {
        Alert.alert('No tasks found', 'The AI could not identify any tasks in this file.')
        setStep('upload-excel')
        return
      }
      navigation.navigate('AITasksPreview', {
        tasks: extracted,
        workspaceId,
        sourceType: 'excel',
      })
      setStep('upload-excel')
    } catch {
      Alert.alert('Error', 'Failed to process the spreadsheet.')
      setStep('upload-excel')
    }
  }

  // ── Live recording mode ─────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true })
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      )
      recordingRef.current = recording
      setIsRecording(true)
      setRecordingDuration(0)
      setLiveRecordingUri(null)
      timerRef.current = setInterval(() => setRecordingDuration((d) => d + 1), 1000)
    } catch {
      Alert.alert('Error', 'Could not start recording. Check microphone permissions.')
    }
  }

  const stopRecording = async () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (!recordingRef.current) return null
    setIsRecording(false)
    try {
      await recordingRef.current.stopAndUnloadAsync()
      const uri = recordingRef.current.getURI()
      recordingRef.current = null
      if (uri) setLiveRecordingUri(uri)
      return uri
    } catch {
      recordingRef.current = null
      return null
    }
  }

  const handleLiveDone = async () => {
    // If still recording, stop first and get URI from that
    // Otherwise use the URI saved when stop button was pressed
    let uri: string | null | undefined = liveRecordingUri
    if (isRecording) {
      uri = await stopRecording()
    }
    if (!uri) {
      Alert.alert('Nothing recorded', 'Please record something before submitting.')
      return
    }
    setStep('processing')
    setProcessingLabel('Uploading & transcribing...')
    try {
      const res = await transcriptsApi.uploadAudio(workspaceId, uri, `live-${Date.now()}.m4a`, 'audio/m4a')
      const transcriptId = res.data.transcript.id
      setSavedTranscriptId(transcriptId)
      setProcessingLabel('Extracting tasks...')
      await generateFromTranscriptId(transcriptId)
    } catch {
      Alert.alert('Error', 'Failed to process the recording.')
      setStep('record-live')
    }
  }

  // ── Create tasks from preview ───────────────────────────────────────────────
  const createFromPreviewMutation = useMutation({
    mutationFn: async () => {
      const selected = previewTasks.filter((t) => t.selected)
      if (savedTranscriptId) {
        await transcriptsApi.saveTasks(workspaceId, savedTranscriptId, selected)
      } else {
        await Promise.all(
          selected.map((t) =>
            tasksApi.create(workspaceId, { title: t.title, description: t.description, priority: t.priority, category: t.category, tags: t.tags })
          )
        )
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', workspaceId] })
      const count = previewTasks.filter((t) => t.selected).length
      Alert.alert('Done!', `${count} task${count !== 1 ? 's' : ''} created.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ])
    },
    onError: () => Alert.alert('Error', 'Failed to create tasks.'),
  })

  // ── Manual create ───────────────────────────────────────────────────────────
  const manualCreateMutation = useMutation({
    mutationFn: () =>
      tasksApi.create(workspaceId, {
        title: mTitle.trim(),
        description: mDescription.trim() || undefined,
        priority: mPriority,
        category: mCategory.trim() || undefined,
        tags: mTags,
        dueDate: mDueDate ? new Date(mDueDate).toISOString() : undefined,
        assigneeIds: mAssigneeIds.length > 0 ? mAssigneeIds : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', workspaceId] })
      Alert.alert('Done!', `"${mTitle}" created.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ])
    },
    onError: () => Alert.alert('Error', 'Failed to create task.'),
  })

  const formatDuration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  const selectedCount = previewTasks.filter((t) => t.selected).length

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  const renderHeader = () => (
    <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
      <TouchableOpacity onPress={() => {
        if (step === 'create-transcript') { setStep('pick-transcript'); return }
        // If we're at the first step of the initial mode (opened directly), go back to previous screen
        if (initialMode && step === modeFirstStep(initialMode)) { navigation.goBack(); return }
        if (step === 'pick-mode' || step === 'manual-form') { navigation.goBack(); return }
        setMode(null); setStep('pick-mode')
      }} style={styles.headerBtn}>
        <Ionicons
          name={(step === 'pick-mode' || step === 'manual-form' || (!!initialMode && step === modeFirstStep(initialMode))) ? 'close' : 'chevron-back'}
          size={22}
          color="#6b7280"
        />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>
        {step === 'pick-mode' ? 'Create Tasks' :
          step === 'manual-form' ? 'New Task' :
          step === 'create-transcript' ? 'New Transcript' :
          step === 'preview' ? 'Preview Tasks' :
          step === 'processing' ? 'Processing...' :
          mode === 'transcript' ? 'From Transcript' :
          mode === 'audio' ? 'Audio File' :
          'Live Recording'}
      </Text>
      <View style={styles.headerBtn} />
    </View>
  )

  // ── Pick mode ───────────────────────────────────────────────────────────────
  if (step === 'pick-mode') {
    return (
      <View style={styles.container}>
        {renderHeader()}
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.sectionLabel}>Generate tasks using AI</Text>
          <View style={styles.modeGrid}>
            <ModeCard icon="document-text" label="Transcript" desc="From saved transcript" color="#6366f1" onPress={() => { setMode('transcript'); setStep('pick-transcript') }} />
            <ModeCard icon="cloud-upload" label="Audio File" desc="Upload a recording" color="#8b5cf6" onPress={() => { setMode('audio'); setStep('record-audio') }} />
            <ModeCard icon="mic" label="Live Record" desc="Speak to generate" color="#ec4899" onPress={() => { setMode('live'); setStep('record-live') }} />
            <ModeCard icon="grid" label="Excel / CSV" desc="Import spreadsheet" color="#10b981" onPress={() => { setMode('excel'); setStep('upload-excel') }} />
          </View>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} /><Text style={styles.dividerText}>or</Text><View style={styles.dividerLine} />
          </View>

          <TouchableOpacity style={styles.manualRow} onPress={() => { setMode('manual'); setStep('manual-form') }}>
            <View style={styles.manualIcon}><Ionicons name="pencil" size={20} color="#6b7280" /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.manualLabel}>Manual Entry</Text>
              <Text style={styles.manualDesc}>Fill in task details by hand</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
          </TouchableOpacity>
        </ScrollView>
      </View>
    )
  }

  // ── Pick transcript ─────────────────────────────────────────────────────────
  if (step === 'pick-transcript') {
    return (
      <View style={styles.container}>
        {renderHeader()}
        {/* Sub-header row with New Transcript button */}
        <View style={styles.listHeaderRow}>
          <Text style={styles.listHeaderText}>
            {transcripts.length === 0 ? 'No saved transcripts' : `${transcripts.length} transcript${transcripts.length !== 1 ? 's' : ''}`}
          </Text>
          <TouchableOpacity style={styles.newTxBtn} onPress={() => setStep('create-transcript')}>
            <Ionicons name="add" size={16} color="#6366f1" />
            <Text style={styles.newTxBtnText}>New</Text>
          </TouchableOpacity>
        </View>
        {transcripts.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="document-text-outline" size={48} color="#d1d5db" />
            <Text style={styles.emptyTitle}>No transcripts yet</Text>
            <Text style={styles.emptyText}>Paste your meeting notes to create one now.</Text>
            <TouchableOpacity style={styles.emptyActionBtn} onPress={() => setStep('create-transcript')}>
              <Ionicons name="add" size={16} color="white" />
              <Text style={styles.emptyActionBtnText}>Create Transcript</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={transcripts}
            keyExtractor={(t) => t.id}
            contentContainerStyle={styles.content}
            renderItem={({ item: t }) => (
              <TouchableOpacity
                style={[styles.transcriptRow, selectedTranscriptId === t.id && styles.transcriptRowSelected]}
                onPress={() => setSelectedTranscriptId(t.id)}
              >
                <View style={styles.transcriptCheck}>
                  <Ionicons
                    name={selectedTranscriptId === t.id ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={selectedTranscriptId === t.id ? '#6366f1' : '#d1d5db'}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.transcriptTitle} numberOfLines={1}>{t.title}</Text>
                  <Text style={styles.transcriptPreview} numberOfLines={2}>{t.content}</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        )}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.footerBtn, !selectedTranscriptId && styles.footerBtnDisabled]}
            onPress={handleGenerateFromTranscript}
            disabled={!selectedTranscriptId}
          >
            <Text style={styles.footerBtnText}>Generate Tasks</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  // ── Create new transcript ───────────────────────────────────────────────────
  if (step === 'create-transcript') {
    return (
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {renderHeader()}
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionLabel}>Paste or type your meeting notes and we'll extract tasks automatically.</Text>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Title <Text style={{ color: '#9ca3af', fontWeight: '400' }}>(optional)</Text></Text>
            <TextInput
              style={styles.input}
              placeholder={`Meeting notes — ${new Date().toLocaleDateString()}`}
              value={newTxTitle}
              onChangeText={setNewTxTitle}
              placeholderTextColor="#9ca3af"
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Content *</Text>
            <TextInput
              style={[styles.input, styles.multilineInput, { minHeight: 180 }]}
              placeholder="Paste or type transcript content here…"
              value={newTxContent}
              onChangeText={setNewTxContent}
              multiline
              textAlignVertical="top"
              autoFocus
              placeholderTextColor="#9ca3af"
            />
          </View>
        </ScrollView>
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.footerBtn, (!newTxContent.trim() || createTranscriptMutation.isPending) && styles.footerBtnDisabled]}
            onPress={() => { if (newTxContent.trim()) createTranscriptMutation.mutate() }}
            disabled={!newTxContent.trim() || createTranscriptMutation.isPending}
          >
            {createTranscriptMutation.isPending
              ? <ActivityIndicator color="white" size="small" />
              : <Text style={styles.footerBtnText}>Save & Extract Tasks</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    )
  }

  // ── Record audio (file) ─────────────────────────────────────────────────────
  if (step === 'record-audio') {
    return (
      <View style={styles.container}>
        {renderHeader()}
        <View style={styles.content}>
          <Text style={styles.sectionLabel}>Select an audio file from your device</Text>
          <TouchableOpacity style={styles.uploadBox} onPress={handlePickAudio}>
            <Ionicons name={audioUri ? 'musical-notes' : 'cloud-upload-outline'} size={40} color={audioUri ? '#6366f1' : '#9ca3af'} />
            <Text style={[styles.uploadBoxTitle, audioUri && { color: '#6366f1' }]}>
              {audioUri ? audioName : 'Tap to pick audio file'}
            </Text>
            <Text style={styles.uploadBoxSubtitle}>MP3, M4A, WAV, OGG, MP4</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.footerBtn, !audioUri && styles.footerBtnDisabled]}
            onPress={handleUploadAudio}
            disabled={!audioUri}
          >
            <Text style={styles.footerBtnText}>Transcribe & Extract Tasks</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  // ── Excel upload ────────────────────────────────────────────────────────────
  if (step === 'upload-excel') {
    return (
      <View style={styles.container}>
        {renderHeader()}
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.sectionLabel}>Upload a spreadsheet — AI will read the columns and extract tasks automatically</Text>
          <TouchableOpacity style={[styles.uploadBox, excelUri && styles.uploadBoxActive]} onPress={handlePickExcel}>
            <Ionicons name="grid-outline" size={40} color={excelUri ? '#10b981' : '#9ca3af'} />
            <Text style={[styles.uploadBoxTitle, excelUri && { color: '#10b981' }]}>
              {excelUri ? excelName : 'Tap to pick spreadsheet'}
            </Text>
            <Text style={styles.uploadBoxSubtitle}>.xlsx, .xls, .csv supported</Text>
          </TouchableOpacity>
          {excelUri && (
            <View style={styles.excelHint}>
              <Ionicons name="sparkles-outline" size={15} color="#10b981" />
              <Text style={styles.excelHintText}>
                AI will understand your column structure automatically — no template needed.
              </Text>
            </View>
          )}
        </ScrollView>
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.footerBtn, (!excelUri) && styles.footerBtnDisabled, excelUri && { backgroundColor: '#10b981' }]}
            onPress={handleUploadExcel}
            disabled={!excelUri}
          >
            <Text style={styles.footerBtnText}>Extract Tasks with AI</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  // ── Live recording ──────────────────────────────────────────────────────────
  if (step === 'record-live') {
    return (
      <View style={styles.container}>
        {renderHeader()}
        <View style={[styles.content, styles.centeredContent]}>
          <Text style={styles.sectionLabel}>Speak your meeting notes or task list</Text>
          <Text style={styles.recordHint}>Your audio will be transcribed and tasks extracted automatically</Text>
          <TouchableOpacity
            style={[styles.recordBtn, isRecording && styles.recordBtnActive]}
            onPress={isRecording ? stopRecording : startRecording}
          >
            <Ionicons name={isRecording ? 'stop' : 'mic'} size={40} color="white" />
          </TouchableOpacity>
          {isRecording ? (
            <View style={styles.recordingInfo}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingText}>Recording... {formatDuration(recordingDuration)}</Text>
            </View>
          ) : recordingDuration > 0 ? (
            <Text style={styles.recordStopped}>Recorded {formatDuration(recordingDuration)} — ready to submit</Text>
          ) : (
            <Text style={styles.recordTip}>Tap the microphone to start</Text>
          )}
        </View>
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.footerBtn, (recordingDuration === 0 || isRecording) && styles.footerBtnDisabled]}
            onPress={handleLiveDone}
            disabled={recordingDuration === 0 || isRecording}
          >
            <Text style={styles.footerBtnText}>Extract Tasks from Recording</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  // ── Processing ──────────────────────────────────────────────────────────────
  if (step === 'processing') {
    return (
      <View style={[styles.container, styles.centeredContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.processingLabel}>{processingLabel}</Text>
      </View>
    )
  }

  // ── Preview tasks ───────────────────────────────────────────────────────────
  if (step === 'preview') {
    return (
      <View style={styles.container}>
        {renderHeader()}
        <View style={styles.previewCountRow}>
          <Text style={styles.previewCountText}>
            AI found <Text style={{ fontWeight: '700', color: '#111827' }}>{previewTasks.length}</Text> tasks — select which to create
          </Text>
          <View style={styles.previewSelectBtns}>
            <TouchableOpacity onPress={() => setPreviewTasks((p) => p.map((t) => ({ ...t, selected: true })))}>
              <Text style={styles.selectAllBtn}>All</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPreviewTasks((p) => p.map((t) => ({ ...t, selected: false })))}>
              <Text style={styles.selectNoneBtn}>None</Text>
            </TouchableOpacity>
          </View>
        </View>
        <FlatList
          data={previewTasks}
          keyExtractor={(t) => t._id}
          contentContainerStyle={styles.previewList}
          renderItem={({ item: task }) => (
            <View style={[styles.previewCard, !task.selected && styles.previewCardDeselected]}>
              <TouchableOpacity onPress={() => setPreviewTasks((p) => p.map((t) => t._id === task._id ? { ...t, selected: !t.selected } : t))} style={styles.previewCheck}>
                <Ionicons name={task.selected ? 'checkbox' : 'square-outline'} size={22} color={task.selected ? '#6366f1' : '#9ca3af'} />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                {editingId === task._id ? (
                  <TextInput
                    style={styles.previewTitleEdit}
                    value={task.title}
                    onChangeText={(v) => setPreviewTasks((p) => p.map((t) => t._id === task._id ? { ...t, title: v } : t))}
                    onBlur={() => setEditingId(null)}
                    autoFocus
                  />
                ) : (
                  <TouchableOpacity onPress={() => setEditingId(task._id)}>
                    <Text style={styles.previewTitle}>{task.title}</Text>
                  </TouchableOpacity>
                )}
                {task.description ? <Text style={styles.previewDesc} numberOfLines={2}>{task.description}</Text> : null}
                <View style={styles.previewMeta}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {PRIORITIES.map((p) => (
                      <TouchableOpacity
                        key={p}
                        onPress={() => setPreviewTasks((prev) => prev.map((t) => t._id === task._id ? { ...t, priority: p } : t))}
                        style={[styles.priorityChip, task.priority === p && { backgroundColor: PRIORITY_COLORS[p] + '22', borderColor: PRIORITY_COLORS[p] }]}
                      >
                        <Text style={[styles.priorityChipText, task.priority === p && { color: PRIORITY_COLORS[p], fontWeight: '700' }]}>{p}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
                {task.category ? <Text style={styles.previewCategory}>{task.category}</Text> : null}
              </View>
            </View>
          )}
        />
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.footerBtn, (selectedCount === 0 || createFromPreviewMutation.isPending) && styles.footerBtnDisabled]}
            onPress={() => createFromPreviewMutation.mutate()}
            disabled={selectedCount === 0 || createFromPreviewMutation.isPending}
          >
            {createFromPreviewMutation.isPending
              ? <ActivityIndicator color="white" size="small" />
              : <Text style={styles.footerBtnText}>Create {selectedCount} Task{selectedCount !== 1 ? 's' : ''}</Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  // ── Manual form ─────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {renderHeader()}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Title *</Text>
          <TextInput style={styles.input} placeholder="What needs to be done?" value={mTitle} onChangeText={setMTitle} autoFocus />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Description</Text>
          <TextInput style={[styles.input, styles.multilineInput]} placeholder="Add details..." value={mDescription} onChangeText={setMDescription} multiline textAlignVertical="top" />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Priority</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {PRIORITIES.map((p) => (
              <TouchableOpacity key={p} style={[styles.pill, mPriority === p && { backgroundColor: PRIORITY_COLORS[p] + '22', borderColor: PRIORITY_COLORS[p] }]} onPress={() => setMPriority(p)}>
                <View style={[styles.pillDot, { backgroundColor: PRIORITY_COLORS[p] }]} />
                <Text style={[styles.pillText, mPriority === p && { color: PRIORITY_COLORS[p], fontWeight: '700' }]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Category</Text>
          <TextInput style={styles.input} placeholder="e.g. Frontend, Backend" value={mCategory} onChangeText={setMCategory} />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Due Date (YYYY-MM-DD)</Text>
          <TextInput style={styles.input} placeholder="2024-12-31" value={mDueDate} onChangeText={setMDueDate} keyboardType="numbers-and-punctuation" />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Tags</Text>
          <View style={styles.tagRow}>
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="Add tag..." value={mTagInput} onChangeText={setMTagInput} onSubmitEditing={() => { if (mTagInput.trim() && !mTags.includes(mTagInput.trim())) { setMTags([...mTags, mTagInput.trim()]); setMTagInput('') } }} returnKeyType="done" />
            <TouchableOpacity style={styles.tagAddBtn} onPress={() => { if (mTagInput.trim() && !mTags.includes(mTagInput.trim())) { setMTags([...mTags, mTagInput.trim()]); setMTagInput('') } }}>
              <Ionicons name="add" size={20} color="white" />
            </TouchableOpacity>
          </View>
          {mTags.length > 0 && (
            <View style={styles.tagsWrap}>
              {mTags.map((tag) => (
                <TouchableOpacity key={tag} style={styles.tagChip} onPress={() => setMTags(mTags.filter((t) => t !== tag))}>
                  <Text style={styles.tagChipText}>{tag}</Text>
                  <Ionicons name="close" size={12} color="#6366f1" />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {workspaceMembers.length > 0 && (
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Assignees</Text>
            <View style={styles.membersGrid}>
              {workspaceMembers.map((m) => {
                const isSelected = mAssigneeIds.includes(m.userId)
                return (
                  <TouchableOpacity
                    key={m.userId}
                    style={[styles.memberChip, isSelected && styles.memberChipSelected]}
                    onPress={() => setMAssigneeIds(
                      isSelected ? mAssigneeIds.filter((id) => id !== m.userId) : [...mAssigneeIds, m.userId]
                    )}
                  >
                    <View style={[styles.memberAvatar, isSelected && styles.memberAvatarSelected]}>
                      <Text style={styles.memberAvatarText}>{m.user.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <Text style={[styles.memberChipName, isSelected && styles.memberChipNameSelected]} numberOfLines={1}>
                      {m.user.name}
                    </Text>
                    {isSelected && <Ionicons name="checkmark-circle" size={14} color="#6366f1" />}
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
        )}
      </ScrollView>
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.footerBtn, (!mTitle.trim() || manualCreateMutation.isPending) && styles.footerBtnDisabled]}
          onPress={() => { if (mTitle.trim()) manualCreateMutation.mutate() }}
          disabled={!mTitle.trim() || manualCreateMutation.isPending}
        >
          {manualCreateMutation.isPending
            ? <ActivityIndicator color="white" size="small" />
            : <Text style={styles.footerBtnText}>Create Task</Text>
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

function ModeCard({ icon, label, desc, color, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; desc: string; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.modeCard} onPress={onPress}>
      <View style={[styles.modeIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={28} color={color} />
      </View>
      <Text style={styles.modeLabel}>{label}</Text>
      <Text style={styles.modeDesc}>{desc}</Text>
    </TouchableOpacity>
  )
}

const SCREEN_WIDTH = Dimensions.get('window').width
const CARD_WIDTH = (SCREEN_WIDTH - 40 - 10) / 2 // 40 = content padding (20 each side), 10 = gap between cards

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f3ff' },
  centeredContainer: { flex: 1, backgroundColor: '#f5f3ff', justifyContent: 'center', alignItems: 'center', gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 14, paddingTop: 14, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  headerBtn: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  content: { padding: 20, paddingBottom: 16 },
  centeredContent: { flex: 1, alignItems: 'center', paddingTop: 40 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#6b7280', marginBottom: 16, textAlign: 'center' },
  modeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  modeCard: { width: CARD_WIDTH, alignItems: 'center', backgroundColor: 'white', borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: '#e5e7eb', gap: 6 },
  modeIcon: { width: 52, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  modeLabel: { fontSize: 13, fontWeight: '700', color: '#111827' },
  modeDesc: { fontSize: 11, color: '#9ca3af', textAlign: 'center' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#e5e7eb' },
  dividerText: { fontSize: 12, color: '#9ca3af', fontWeight: '600' },
  manualRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'white', borderRadius: 12, padding: 14, borderWidth: 1.5, borderColor: '#e5e7eb' },
  manualIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
  manualLabel: { fontSize: 14, fontWeight: '600', color: '#111827' },
  manualDesc: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  listHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', backgroundColor: 'white' },
  listHeaderText: { fontSize: 13, color: '#9ca3af', fontWeight: '500' },
  newTxBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, borderColor: '#6366f1' },
  newTxBtnText: { fontSize: 13, color: '#6366f1', fontWeight: '600' },
  emptyActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#6366f1', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, marginTop: 4 },
  emptyActionBtnText: { color: 'white', fontSize: 14, fontWeight: '700' },
  transcriptRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: 'white', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1.5, borderColor: '#e5e7eb' },
  transcriptRowSelected: { borderColor: '#6366f1', backgroundColor: '#ede9fe20' },
  transcriptCheck: { paddingTop: 1 },
  transcriptTitle: { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 4 },
  transcriptPreview: { fontSize: 12, color: '#6b7280', lineHeight: 17 },
  uploadBox: { borderWidth: 2, borderColor: '#e5e7eb', borderStyle: 'dashed', borderRadius: 16, padding: 32, alignItems: 'center', gap: 8, backgroundColor: 'white' },
  uploadBoxActive: { borderColor: '#10b981', backgroundColor: '#f0fdf4' },
  uploadBoxTitle: { fontSize: 15, fontWeight: '600', color: '#6b7280' },
  uploadBoxSubtitle: { fontSize: 12, color: '#9ca3af' },
  excelHint: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#f0fdf4', borderRadius: 10, padding: 12, marginTop: 4, borderWidth: 1, borderColor: '#bbf7d0' },
  excelHintText: { flex: 1, fontSize: 13, color: '#065f46', lineHeight: 19 },
  recordHint: { fontSize: 13, color: '#9ca3af', textAlign: 'center', marginBottom: 32, paddingHorizontal: 20 },
  recordBtn: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#6366f1', justifyContent: 'center', alignItems: 'center', shadowColor: '#6366f1', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  recordBtnActive: { backgroundColor: '#ef4444', shadowColor: '#ef4444' },
  recordingInfo: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20 },
  recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444' },
  recordingText: { fontSize: 14, color: '#ef4444', fontWeight: '600' },
  recordStopped: { marginTop: 20, fontSize: 13, color: '#6366f1', fontWeight: '600' },
  recordTip: { marginTop: 20, fontSize: 13, color: '#9ca3af' },
  processingLabel: { fontSize: 14, color: '#6b7280', fontWeight: '500' },
  previewCountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  previewCountText: { fontSize: 13, color: '#6b7280', flex: 1 },
  previewSelectBtns: { flexDirection: 'row', gap: 12 },
  selectAllBtn: { fontSize: 13, color: '#6366f1', fontWeight: '600' },
  selectNoneBtn: { fontSize: 13, color: '#9ca3af', fontWeight: '600' },
  previewList: { padding: 14, paddingBottom: 8 },
  previewCard: { flexDirection: 'row', gap: 12, backgroundColor: 'white', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1.5, borderColor: '#e5e7eb' },
  previewCardDeselected: { opacity: 0.45, backgroundColor: '#f9fafb' },
  previewCheck: { paddingTop: 2 },
  previewTitle: { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 4 },
  previewTitleEdit: { fontSize: 14, fontWeight: '600', color: '#111827', borderBottomWidth: 1.5, borderColor: '#6366f1', marginBottom: 4, paddingVertical: 2 },
  previewDesc: { fontSize: 12, color: '#6b7280', lineHeight: 17, marginBottom: 8 },
  previewMeta: { marginBottom: 4 },
  priorityChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1.5, borderColor: '#e5e7eb', marginRight: 6, backgroundColor: 'white' },
  priorityChipText: { fontSize: 11, color: '#6b7280', fontWeight: '500' },
  previewCategory: { fontSize: 11, color: '#6366f1', backgroundColor: '#ede9fe', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start', marginTop: 4 },
  footer: { padding: 16, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  footerBtn: { backgroundColor: '#6366f1', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  footerBtnDisabled: { backgroundColor: '#c7d2fe' },
  footerBtnText: { color: 'white', fontSize: 15, fontWeight: '700' },
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#374151' },
  emptyText: { fontSize: 13, color: '#9ca3af', textAlign: 'center' },
  fieldGroup: { marginBottom: 20 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  input: { borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#111827', backgroundColor: 'white' },
  multilineInput: { minHeight: 80, paddingTop: 12, textAlignVertical: 'top' },
  pill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: '#e5e7eb', marginRight: 7, backgroundColor: 'white', gap: 5 },
  pillDot: { width: 7, height: 7, borderRadius: 3.5 },
  pillText: { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  tagRow: { flexDirection: 'row', gap: 8 },
  tagAddBtn: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#6366f1', justifyContent: 'center', alignItems: 'center' },
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  tagChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ede9fe', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5, gap: 4 },
  tagChipText: { fontSize: 12, color: '#6366f1', fontWeight: '600' },
  membersGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  memberChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1.5, borderColor: '#e5e7eb', backgroundColor: 'white',
  },
  memberChipSelected: { borderColor: '#6366f1', backgroundColor: '#ede9fe' },
  memberAvatar: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#d1d5db', justifyContent: 'center', alignItems: 'center' },
  memberAvatarSelected: { backgroundColor: '#6366f1' },
  memberAvatarText: { fontSize: 10, fontWeight: '700', color: 'white' },
  memberChipName: { fontSize: 12, color: '#6b7280', fontWeight: '500', maxWidth: 90 },
  memberChipNameSelected: { color: '#4f46e5', fontWeight: '600' },
})
