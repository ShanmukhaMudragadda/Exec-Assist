import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import AppLayout from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { transcriptsApi, tasksApi, workspacesApi, importApi } from '@/services/api'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import {
  FileText, Mic, Upload, PenLine, ChevronLeft,
  Loader2, CheckSquare, Square, Flag, X, Plus,
  StopCircle, Radio, CalendarDays, Tag, Users,
  AlignLeft, ChevronDown, ChevronUp, Wand2, Sheet,
} from 'lucide-react'

type Mode = 'manual' | 'transcript' | 'audio' | 'live' | 'excel' | null
type Step = 'pick-mode' | 'pick-transcript' | 'create-transcript' | 'record-audio' | 'record-live' | 'upload-excel' | 'processing' | 'preview' | 'manual-form'

function modeFirstStep(m: Mode): Step {
  if (m === 'manual') return 'manual-form'
  if (m === 'transcript') return 'pick-transcript'
  if (m === 'audio') return 'record-audio'
  if (m === 'live') return 'record-live'
  if (m === 'excel') return 'upload-excel'
  return 'pick-mode'
}

interface ExtractedTask {
  title: string
  description?: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status?: string
  category?: string
  tags?: string[]
  dueDate?: string | null
}

interface PreviewTask extends ExtractedTask {
  _id: string
  selected: boolean
  expanded: boolean
  assigneeIds: string[]
}

const PRIORITY_OPTIONS = ['urgent', 'high', 'medium', 'low'] as const

export default function SmartCreatePage() {
  const { id: workspaceId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()

  const initialMode = (searchParams.get('mode') as Mode) || null
  const [mode, setMode] = useState<Mode>(initialMode)
  const [step, setStep] = useState<Step>(initialMode ? modeFirstStep(initialMode) : 'pick-mode')

  // Transcript state
  const [selectedTranscriptId, setSelectedTranscriptId] = useState('')
  const [newTxTitle, setNewTxTitle] = useState('')
  const [newTxContent, setNewTxContent] = useState('')
  const [newTxType, setNewTxType] = useState<'meeting' | 'notes' | 'interview' | 'other'>('meeting')

  // Audio state
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [savedTranscriptId, setSavedTranscriptId] = useState('')
  const [processingLabel, setProcessingLabel] = useState('')

  // Excel state
  const [excelFile, setExcelFile] = useState<File | null>(null)

  // Live recording state
  const [liveText, setLiveText] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const liveTextRef = useRef('')

  // Preview state
  const [previewTasks, setPreviewTasks] = useState<PreviewTask[]>([])
  const [previewTagInputs, setPreviewTagInputs] = useState<Record<string, string>>({})

  // Manual form state
  const [mTitle, setMTitle] = useState('')
  const [mDescription, setMDescription] = useState('')
  const [mStatus, setMStatus] = useState('todo')
  const [mPriority, setMPriority] = useState('medium')
  const [mCategory, setMCategory] = useState('')
  const [mDueDate, setMDueDate] = useState('')
  const [mTagInput, setMTagInput] = useState('')
  const [mTags, setMTags] = useState<string[]>([])
  const [mAssignees, setMAssignees] = useState<string[]>([])

  const { data: transcriptsData } = useQuery({
    queryKey: ['transcripts', workspaceId],
    queryFn: () => transcriptsApi.list(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId && mode === 'transcript',
  })
  const transcripts: { id: string; title: string; content: string; processed: boolean }[] =
    transcriptsData?.transcripts || []

  const { data: membersData } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => workspacesApi.getMembers(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId && (step === 'manual-form' || step === 'preview'),
  })
  const members: { id: string; userId: string; name: string }[] =
    membersData?.members?.map((m: { userId: string; user: { id: string; name: string } }) => ({
      id: m.user.id,
      userId: m.userId,
      name: m.user.name,
    })) || []

  const goBack = () => navigate(`/workspace/${workspaceId}`)

  const stopLiveRecording = () => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setIsRecording(false)
  }

  useEffect(() => {
    return () => stopLiveRecording()
  }, [])

  // ── AI extraction ──────────────────────────────────────────────────────────
  const generateFromTranscriptId = async (transcriptId: string) => {
    setStep('processing')
    setProcessingLabel('Analyzing with AI...')
    try {
      const res = await transcriptsApi.generateTasks(workspaceId!, transcriptId)
      const extracted: ExtractedTask[] = res.data.extractedTasks || []
      if (extracted.length === 0) {
        toast({ title: 'No tasks found', description: 'The AI could not identify any tasks in this content.' })
        setStep(mode === 'transcript' ? 'pick-transcript' : mode === 'audio' ? 'record-audio' : 'record-live')
        return
      }
      setPreviewTasks(extracted.map((t, i) => ({
        ...t,
        _id: `${i}-${Date.now()}`,
        selected: true,
        expanded: false,
        assigneeIds: (t as any).assigneeIds || [],
        status: t.status || 'todo',
      })))
      setStep('preview')
    } catch {
      toast({ title: 'AI extraction failed', variant: 'destructive' })
      setStep(mode === 'transcript' ? 'pick-transcript' : mode === 'audio' ? 'record-audio' : 'record-live')
    }
  }

  const createTranscriptMutation = useMutation({
    mutationFn: () =>
      transcriptsApi.createText(workspaceId!, {
        title: newTxTitle.trim() || `Transcript — ${new Date().toLocaleString()}`,
        content: newTxContent.trim(),
        type: newTxType,
      }),
    onSuccess: (res) => {
      const id = res.data.transcript.id
      setSavedTranscriptId(id)
      queryClient.invalidateQueries({ queryKey: ['transcripts', workspaceId] })
      generateFromTranscriptId(id)
    },
    onError: () => toast({ title: 'Error', description: 'Failed to save transcript.', variant: 'destructive' }),
  })

  const handleAudioUpload = async () => {
    if (!audioFile) return
    setStep('processing')
    setProcessingLabel('Uploading & transcribing audio...')
    try {
      const res = await transcriptsApi.uploadAudio(workspaceId!, audioFile)
      const { transcript } = res.data
      setSavedTranscriptId(transcript.id)
      setProcessingLabel('Extracting tasks with AI...')
      await generateFromTranscriptId(transcript.id)
    } catch {
      toast({ title: 'Upload failed', variant: 'destructive' })
      setStep('record-audio')
    }
  }

  const handleExcelUpload = async () => {
    if (!excelFile) return
    setStep('processing')
    setProcessingLabel('Reading spreadsheet & extracting tasks with AI...')
    try {
      const res = await importApi.uploadExcel(workspaceId!, excelFile)
      const extracted = res.data.extractedTasks
      if (!extracted.length) {
        toast({ title: 'No tasks found', description: 'The AI could not identify any tasks in this file.' })
        setStep('upload-excel')
        return
      }
      setPreviewTasks(extracted.map((t, i) => ({
        ...t,
        _id: `${i}-${Date.now()}`,
        priority: (t.priority as PreviewTask['priority']) || 'medium',
        selected: true,
        expanded: false,
        assigneeIds: t.assigneeIds || [],
        status: t.status || 'todo',
      })))
      setStep('preview')
    } catch {
      toast({ title: 'Failed to process file', description: 'Check that the file is a valid Excel or CSV.', variant: 'destructive' })
      setStep('upload-excel')
    }
  }

  const startLiveRecording = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      toast({ title: 'Not supported', description: 'Try Chrome for live recording.', variant: 'destructive' })
      return
    }
    const recognition = new SR()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognitionRef.current = recognition
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = ''
      let final = liveTextRef.current
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript
        if (event.results[i].isFinal) { final += t + ' '; liveTextRef.current = final }
        else interim = t
      }
      setLiveText(final + interim)
    }
    recognition.onerror = () => setIsRecording(false)
    recognition.start()
    setIsRecording(true)
  }

  const handleLiveDone = async () => {
    stopLiveRecording()
    const text = liveTextRef.current.trim() || liveText.trim()
    if (!text) { toast({ title: 'Nothing recorded' }); return }
    setStep('processing')
    setProcessingLabel('Saving transcript...')
    try {
      const res = await transcriptsApi.createText(workspaceId!, {
        title: `Live recording — ${new Date().toLocaleString()}`,
        content: text,
        type: 'meeting',
      })
      const id = res.data.transcript.id
      setSavedTranscriptId(id)
      await generateFromTranscriptId(id)
    } catch {
      toast({ title: 'Failed', variant: 'destructive' })
      setStep('record-live')
    }
  }

  // ── Preview helpers ────────────────────────────────────────────────────────
  const updateTask = (id: string, updates: Partial<PreviewTask>) =>
    setPreviewTasks((p) => p.map((t) => (t._id === id ? { ...t, ...updates } : t)))

  const toggleAssignee = (taskId: string, userId: string) =>
    setPreviewTasks((p) => p.map((t) => {
      if (t._id !== taskId) return t
      const ids = t.assigneeIds.includes(userId)
        ? t.assigneeIds.filter((id) => id !== userId)
        : [...t.assigneeIds, userId]
      return { ...t, assigneeIds: ids }
    }))

  const addTag = (taskId: string) => {
    const v = previewTagInputs[taskId]?.trim()
    if (!v) return
    setPreviewTasks((p) => p.map((t) =>
      t._id === taskId && !t.tags?.includes(v) ? { ...t, tags: [...(t.tags || []), v] } : t
    ))
    setPreviewTagInputs((prev) => ({ ...prev, [taskId]: '' }))
  }

  const removeTag = (taskId: string, tag: string) =>
    setPreviewTasks((p) => p.map((t) =>
      t._id === taskId ? { ...t, tags: t.tags?.filter((tg) => tg !== tag) } : t
    ))

  // ── Save preview tasks ─────────────────────────────────────────────────────
  const createPreviewMutation = useMutation({
    mutationFn: async () => {
      const selected = previewTasks.filter((t) => t.selected)
      await Promise.all(selected.map((t) =>
        tasksApi.create(workspaceId!, {
          title: t.title,
          description: t.description || undefined,
          priority: t.priority,
          status: t.status || 'todo',
          category: t.category || undefined,
          tags: t.tags,
          dueDate: t.dueDate || null,
          assigneeIds: t.assigneeIds?.length ? t.assigneeIds : undefined,
        })
      ))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', workspaceId] })
      const count = previewTasks.filter((t) => t.selected).length
      toast({ title: 'Tasks created!', description: `${count} task${count !== 1 ? 's' : ''} added to the board.` })
      goBack()
    },
    onError: () => toast({ title: 'Error', description: 'Failed to create tasks.', variant: 'destructive' }),
  })

  // ── Manual create ──────────────────────────────────────────────────────────
  const manualMutation = useMutation({
    mutationFn: () =>
      tasksApi.create(workspaceId!, {
        title: mTitle.trim(),
        description: mDescription.trim() || undefined,
        status: mStatus,
        priority: mPriority,
        category: mCategory.trim() || undefined,
        tags: mTags,
        dueDate: mDueDate || null,
        assigneeIds: mAssignees.length ? mAssignees : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', workspaceId] })
      toast({ title: 'Task created!', description: `"${mTitle}" has been added.` })
      goBack()
    },
    onError: () => toast({ title: 'Error', description: 'Failed to create task.', variant: 'destructive' }),
  })

  const addManualTag = () => {
    const t = mTagInput.trim()
    if (t && !mTags.includes(t)) setMTags([...mTags, t])
    setMTagInput('')
  }

  const selectedCount = previewTasks.filter((t) => t.selected).length

  // ── Header ─────────────────────────────────────────────────────────────────
  const getTitle = () => {
    if (step === 'manual-form') return 'New Task'
    if (step === 'preview') return 'Review AI Tasks'
    if (step === 'processing') return 'Processing...'
    if (step === 'create-transcript') return 'New Transcript'
    if (step === 'upload-excel') return 'Import from Excel'
    if (mode === 'transcript') return 'Tasks from Transcript'
    if (mode === 'audio') return 'Tasks from Audio'
    if (mode === 'live') return 'Live Recording'
    if (mode === 'excel') return 'Import from Excel'
    return 'Create Tasks'
  }

  const handleBack = () => {
    if (step === 'processing') { goBack(); return }
    if (step === 'create-transcript') { setStep('pick-transcript'); return }
    if (step === 'pick-mode' || step === 'manual-form' || (!!initialMode && step === modeFirstStep(initialMode))) {
      goBack(); return
    }
    setMode(null); setStep('pick-mode')
  }

  return (
    <AppLayout>
      <div className="min-h-[calc(100vh-56px)] bg-gradient-to-b from-slate-50 to-white">
        {/* ── Page header ──────────────────────────────────────────────── */}
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b px-6 py-4 flex items-center gap-3">
          <button
            onClick={handleBack}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-accent transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-foreground">{getTitle()}</h1>
            {step === 'preview' && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {previewTasks.length} tasks generated · {selectedCount} selected
              </p>
            )}
          </div>
          {step === 'preview' && (
            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" size="sm" className="text-xs"
                onClick={() => setPreviewTasks((p) => p.map((t) => ({ ...t, selected: true })))}>
                Select All
              </Button>
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground"
                onClick={() => setPreviewTasks((p) => p.map((t) => ({ ...t, selected: false })))}>
                Select None
              </Button>
              <Button
                onClick={() => createPreviewMutation.mutate()}
                disabled={selectedCount === 0 || createPreviewMutation.isPending}
                size="sm"
              >
                {createPreviewMutation.isPending
                  ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Creating...</>
                  : `Create ${selectedCount} Task${selectedCount !== 1 ? 's' : ''}`}
              </Button>
            </div>
          )}
        </div>

        <div className="max-w-3xl mx-auto px-6 py-8">

          {/* ── Pick mode ──────────────────────────────────────────────── */}
          {step === 'pick-mode' && (
            <div className="space-y-8">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                  <Wand2 className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-xl font-semibold">How do you want to create tasks?</h2>
                <p className="text-muted-foreground text-sm">Choose a method to get started</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { mode: 'transcript' as Mode, icon: <FileText className="w-7 h-7" />, label: 'From Transcript', desc: 'Use saved meeting notes', color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'hover:border-indigo-300' },
                  { mode: 'audio' as Mode, icon: <Upload className="w-7 h-7" />, label: 'Upload Audio', desc: 'Upload a recording file', color: 'text-purple-600', bg: 'bg-purple-50', border: 'hover:border-purple-300' },
                  { mode: 'live' as Mode, icon: <Mic className="w-7 h-7" />, label: 'Live Recording', desc: 'Speak to generate tasks', color: 'text-rose-600', bg: 'bg-rose-50', border: 'hover:border-rose-300' },
                  { mode: 'excel' as Mode, icon: <Sheet className="w-7 h-7" />, label: 'Import Excel', desc: 'Upload .xlsx, .xls or .csv', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'hover:border-emerald-300' },
                ].map(({ mode: m, icon, label, desc, color, bg, border }) => (
                  <button
                    key={m}
                    onClick={() => { setMode(m); setStep(modeFirstStep(m)) }}
                    className={cn('flex flex-col items-center gap-3 p-6 border-2 rounded-2xl hover:shadow-md transition-all text-center group', border)}
                  >
                    <div className={cn('w-14 h-14 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110', bg, color)}>
                      {icon}
                    </div>
                    <div>
                      <div className="font-semibold text-sm">{label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-gradient-to-b from-slate-50 to-white px-3 text-muted-foreground font-medium">or create manually</span>
                </div>
              </div>

              <button
                onClick={() => { setMode('manual'); setStep('manual-form') }}
                className="w-full flex items-center gap-4 px-5 py-4 border-2 rounded-2xl hover:border-primary/30 hover:bg-accent/50 transition-all text-left group"
              >
                <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 group-hover:bg-primary/10 group-hover:text-primary transition-colors shrink-0">
                  <PenLine className="w-6 h-6" />
                </div>
                <div>
                  <div className="font-semibold">Manual Entry</div>
                  <div className="text-sm text-muted-foreground">Fill in task details by hand</div>
                </div>
                <ChevronLeft className="w-5 h-5 rotate-180 ml-auto text-muted-foreground group-hover:text-primary transition-colors" />
              </button>
            </div>
          )}

          {/* ── Pick transcript ──────────────────────────────────────────── */}
          {step === 'pick-transcript' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Select a transcript or create a new one:</p>
                <Button variant="outline" size="sm" onClick={() => setStep('create-transcript')}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" />New
                </Button>
              </div>
              {transcripts.length === 0 ? (
                <div className="border-2 border-dashed rounded-2xl p-12 text-center space-y-3">
                  <FileText className="w-12 h-12 text-muted-foreground mx-auto" />
                  <p className="font-medium">No transcripts yet</p>
                  <p className="text-sm text-muted-foreground">Paste your meeting notes to create one.</p>
                  <Button size="sm" onClick={() => setStep('create-transcript')}>
                    <Plus className="w-3.5 h-3.5 mr-1.5" />Create Transcript
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {transcripts.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTranscriptId(t.id)}
                      className={cn(
                        'w-full flex items-start gap-3 px-4 py-4 border-2 rounded-xl text-left transition-colors',
                        selectedTranscriptId === t.id ? 'border-primary bg-primary/5' : 'hover:bg-accent border-transparent bg-white shadow-sm'
                      )}
                    >
                      <FileText className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{t.title}</div>
                        <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{t.content.slice(0, 120)}…</div>
                      </div>
                      {t.processed && <Badge variant="secondary" className="text-xs shrink-0">Used</Badge>}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={goBack}>Cancel</Button>
                <Button onClick={() => { if (selectedTranscriptId) { setSavedTranscriptId(selectedTranscriptId); generateFromTranscriptId(selectedTranscriptId) } }} disabled={!selectedTranscriptId}>
                  Generate Tasks
                </Button>
              </div>
            </div>
          )}

          {/* ── Create transcript ─────────────────────────────────────────── */}
          {step === 'create-transcript' && (
            <div className="space-y-5">
              <p className="text-sm text-muted-foreground">Paste your meeting notes — we'll extract tasks automatically.</p>
              <div className="space-y-2">
                <Label>Title <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input placeholder={`Meeting notes — ${new Date().toLocaleDateString()}`} value={newTxTitle} onChange={(e) => setNewTxTitle(e.target.value)} autoFocus />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={newTxType} onValueChange={(v) => setNewTxType(v as typeof newTxType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="meeting">Meeting</SelectItem>
                    <SelectItem value="notes">Notes</SelectItem>
                    <SelectItem value="interview">Interview</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Content *</Label>
                <Textarea placeholder="Paste or type your transcript here…" value={newTxContent} onChange={(e) => setNewTxContent(e.target.value)} rows={10} className="resize-none" />
              </div>
              <div className="flex justify-between gap-2 pt-2 border-t">
                <Button variant="outline" onClick={() => setStep('pick-transcript')}>
                  <ChevronLeft className="w-4 h-4 mr-1" />Back
                </Button>
                <Button onClick={() => createTranscriptMutation.mutate()} disabled={!newTxContent.trim() || createTranscriptMutation.isPending}>
                  {createTranscriptMutation.isPending
                    ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Saving…</>
                    : 'Save & Extract Tasks'}
                </Button>
              </div>
            </div>
          )}

          {/* ── Audio upload ──────────────────────────────────────────────── */}
          {step === 'record-audio' && (
            <div className="space-y-6">
              <p className="text-sm text-muted-foreground text-center">Upload an audio file — it will be transcribed and tasks extracted automatically.</p>
              <label className="flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-16 cursor-pointer hover:bg-accent transition-colors group">
                <div className={cn('w-16 h-16 rounded-2xl flex items-center justify-center mb-4 transition-colors', audioFile ? 'bg-primary/10' : 'bg-muted group-hover:bg-primary/10')}>
                  <Upload className={cn('w-8 h-8 transition-colors', audioFile ? 'text-primary' : 'text-muted-foreground group-hover:text-primary')} />
                </div>
                {audioFile ? (
                  <div className="text-center">
                    <p className="font-semibold text-primary">{audioFile.name}</p>
                    <p className="text-sm text-muted-foreground">{(audioFile.size / 1024 / 1024).toFixed(1)} MB · Click to change</p>
                  </div>
                ) : (
                  <div className="text-center">
                    <p className="font-semibold">Click to upload audio</p>
                    <p className="text-sm text-muted-foreground mt-1">MP3, MP4, WAV, M4A, OGG supported</p>
                  </div>
                )}
                <input type="file" accept="audio/*" className="hidden" onChange={(e) => setAudioFile(e.target.files?.[0] || null)} />
              </label>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={goBack}>Cancel</Button>
                <Button onClick={handleAudioUpload} disabled={!audioFile}>Transcribe & Extract Tasks</Button>
              </div>
            </div>
          )}

          {/* ── Excel upload ──────────────────────────────────────────────── */}
          {step === 'upload-excel' && (
            <div className="space-y-6">
              <p className="text-sm text-muted-foreground text-center">
                Upload a spreadsheet — column names can be anything. AI will figure out the structure and extract tasks automatically.
              </p>
              <label className="flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-16 cursor-pointer hover:bg-accent transition-colors group">
                <div className={cn(
                  'w-16 h-16 rounded-2xl flex items-center justify-center mb-4 transition-colors',
                  excelFile ? 'bg-emerald-50' : 'bg-muted group-hover:bg-emerald-50'
                )}>
                  <Sheet className={cn('w-8 h-8 transition-colors', excelFile ? 'text-emerald-600' : 'text-muted-foreground group-hover:text-emerald-600')} />
                </div>
                {excelFile ? (
                  <div className="text-center">
                    <p className="font-semibold text-emerald-700">{excelFile.name}</p>
                    <p className="text-sm text-muted-foreground mt-1">{(excelFile.size / 1024).toFixed(0)} KB · Click to change</p>
                  </div>
                ) : (
                  <div className="text-center">
                    <p className="font-semibold">Click to upload spreadsheet</p>
                    <p className="text-sm text-muted-foreground mt-1">.xlsx, .xls, .csv supported · Max 20 MB</p>
                  </div>
                )}
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                  className="hidden"
                  onChange={(e) => setExcelFile(e.target.files?.[0] || null)}
                />
              </label>
              {excelFile && (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700 flex items-center gap-2">
                  <Sheet className="w-4 h-4 shrink-0" />
                  AI will read all sheets, understand your column structure, and extract every task automatically.
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={goBack}>Cancel</Button>
                <Button onClick={handleExcelUpload} disabled={!excelFile} className="bg-emerald-600 hover:bg-emerald-700">
                  <Wand2 className="w-4 h-4 mr-1.5" />
                  Extract Tasks with AI
                </Button>
              </div>
            </div>
          )}

          {/* ── Live recording ────────────────────────────────────────────── */}
          {step === 'record-live' && (
            <div className="space-y-6">
              <p className="text-sm text-muted-foreground text-center">Speak your meeting notes or task list. We'll extract tasks automatically.</p>
              <div className="flex flex-col items-center gap-5 py-8">
                <button
                  onClick={isRecording ? stopLiveRecording : startLiveRecording}
                  className={cn(
                    'w-24 h-24 rounded-full flex items-center justify-center transition-all shadow-xl',
                    isRecording ? 'bg-red-500 hover:bg-red-600 animate-pulse' : 'bg-primary hover:bg-primary/90'
                  )}
                >
                  {isRecording ? <StopCircle className="w-10 h-10 text-white" /> : <Mic className="w-10 h-10 text-white" />}
                </button>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {isRecording
                    ? <><Radio className="w-3.5 h-3.5 text-red-500 animate-pulse" />Recording — click to stop</>
                    : liveText ? 'Recording complete — ready to submit' : 'Click the microphone to start'}
                </div>
              </div>
              {liveText && (
                <div className="border rounded-xl p-4 bg-muted/30 max-h-48 overflow-y-auto">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Transcript</p>
                  <p className="text-sm whitespace-pre-wrap">{liveText}</p>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={goBack}>Cancel</Button>
                <Button onClick={handleLiveDone} disabled={!liveText.trim() || isRecording}>Extract Tasks</Button>
              </div>
            </div>
          )}

          {/* ── Processing ────────────────────────────────────────────────── */}
          {step === 'processing' && (
            <div className="flex flex-col items-center justify-center py-24 gap-5">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              </div>
              <div className="text-center">
                <p className="font-semibold">{processingLabel}</p>
                <p className="text-sm text-muted-foreground mt-1">This may take a few seconds…</p>
              </div>
            </div>
          )}

          {/* ── Preview tasks ──────────────────────────────────────────────── */}
          {step === 'preview' && (
            <div className="space-y-3">
              {previewTasks.map((task) => (
                <div
                  key={task._id}
                  className={cn(
                    'bg-white border-2 rounded-2xl transition-all shadow-sm',
                    task.selected ? 'border-primary/30' : 'opacity-50 border-transparent bg-muted/30'
                  )}
                >
                  {/* Card header row */}
                  <div className="flex items-center gap-3 px-4 pt-4 pb-2">
                    <button onClick={() => updateTask(task._id, { selected: !task.selected })} className="shrink-0 text-primary">
                      {task.selected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5 text-muted-foreground" />}
                    </button>
                    <Input
                      value={task.title}
                      onChange={(e) => updateTask(task._id, { title: e.target.value })}
                      className="flex-1 h-8 font-semibold border-0 bg-transparent p-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-[15px]"
                      placeholder="Task title"
                    />
                    <button
                      onClick={() => updateTask(task._id, { expanded: !task.expanded })}
                      className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {task.expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Quick fields row */}
                  <div className="flex items-center gap-2 px-4 pb-3 flex-wrap">
                    <Select value={task.priority} onValueChange={(v) => updateTask(task._id, { priority: v as PreviewTask['priority'] })}>
                      <SelectTrigger className="h-7 w-[105px] text-xs px-2 gap-1 rounded-full border">
                        <Flag className="w-3 h-3 shrink-0" /><SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORITY_OPTIONS.map((p) => (
                          <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={task.status || 'todo'} onValueChange={(v) => updateTask(task._id, { status: v })}>
                      <SelectTrigger className="h-7 w-[125px] text-xs px-2 rounded-full border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todo" className="text-xs">To Do</SelectItem>
                        <SelectItem value="in-progress" className="text-xs">In Progress</SelectItem>
                        <SelectItem value="in-review" className="text-xs">In Review</SelectItem>
                        <SelectItem value="completed" className="text-xs">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                    {task.dueDate && !task.expanded && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <CalendarDays className="w-3 h-3" />{task.dueDate}
                      </span>
                    )}
                    {task.category && !task.expanded && (
                      <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">{task.category}</span>
                    )}
                    {!task.expanded && task.tags && task.tags.length > 0 && (
                      <span className="text-xs text-muted-foreground">{task.tags.length} tag{task.tags.length !== 1 ? 's' : ''}</span>
                    )}
                  </div>

                  {/* Expanded fields */}
                  {task.expanded && (
                    <div className="px-4 pb-4 pt-1 border-t space-y-4">
                      {/* Description */}
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                          <AlignLeft className="w-3 h-3" />Description
                        </label>
                        <Textarea
                          value={task.description || ''}
                          onChange={(e) => updateTask(task._id, { description: e.target.value })}
                          placeholder="Add a description..."
                          rows={2}
                          className="text-sm resize-none"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        {/* Due date */}
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                            <CalendarDays className="w-3 h-3" />Due Date
                          </label>
                          <Input
                            type="date"
                            value={task.dueDate || ''}
                            onChange={(e) => updateTask(task._id, { dueDate: e.target.value || null })}
                            className="h-9 text-sm"
                          />
                        </div>
                        {/* Category */}
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Category</label>
                          <Input
                            value={task.category || ''}
                            onChange={(e) => updateTask(task._id, { category: e.target.value })}
                            placeholder="e.g. Frontend"
                            className="h-9 text-sm"
                          />
                        </div>
                      </div>

                      {/* Tags */}
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                          <Tag className="w-3 h-3" />Tags
                        </label>
                        <div className="flex gap-2">
                          <Input
                            value={previewTagInputs[task._id] || ''}
                            onChange={(e) => setPreviewTagInputs((prev) => ({ ...prev, [task._id]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(task._id) } }}
                            placeholder="Add tag..."
                            className="h-9 text-sm flex-1"
                          />
                          <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => addTag(task._id)}>
                            <Plus className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                        {task.tags && task.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {task.tags.map((tag) => (
                              <span key={tag} className="flex items-center gap-1 bg-secondary text-secondary-foreground text-xs px-2.5 py-1 rounded-full">
                                {tag}
                                <button type="button" onClick={() => removeTag(task._id, tag)} className="hover:text-destructive ml-0.5">
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Assignees */}
                      {members.length > 0 && (
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                            <Users className="w-3 h-3" />Assignees
                          </label>
                          <div className="flex flex-wrap gap-2">
                            {members.map((m) => {
                              const selected = task.assigneeIds.includes(m.userId)
                              return (
                                <button
                                  key={m.userId}
                                  type="button"
                                  onClick={() => toggleAssignee(task._id, m.userId)}
                                  className={cn(
                                    'flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm transition-colors',
                                    selected
                                      ? 'bg-primary/10 border-primary/40 text-primary font-medium'
                                      : 'border-border text-muted-foreground hover:bg-accent'
                                  )}
                                >
                                  <div className={cn(
                                    'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white',
                                    selected ? 'bg-primary' : 'bg-muted-foreground'
                                  )}>
                                    {m.name.charAt(0).toUpperCase()}
                                  </div>
                                  {m.name}
                                  {selected && <X className="w-3 h-3 ml-0.5" />}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* Bottom action bar */}
              <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t -mx-6 px-6 py-4 mt-6 flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{selectedCount} of {previewTasks.length} tasks selected</span>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={goBack}>Cancel</Button>
                  <Button
                    onClick={() => createPreviewMutation.mutate()}
                    disabled={selectedCount === 0 || createPreviewMutation.isPending}
                  >
                    {createPreviewMutation.isPending
                      ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Creating...</>
                      : `Create ${selectedCount} Task${selectedCount !== 1 ? 's' : ''}`}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ── Manual form ────────────────────────────────────────────────── */}
          {step === 'manual-form' && (
            <form onSubmit={(e) => { e.preventDefault(); if (mTitle.trim()) manualMutation.mutate() }} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="m-title">Title *</Label>
                <Input id="m-title" placeholder="What needs to be done?" value={mTitle} onChange={(e) => setMTitle(e.target.value)} autoFocus className="h-11 text-base" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="m-desc">Description</Label>
                <Textarea id="m-desc" placeholder="Add more details..." value={mDescription} onChange={(e) => setMDescription(e.target.value)} rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={mStatus} onValueChange={setMStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todo">To Do</SelectItem>
                      <SelectItem value="in-progress">In Progress</SelectItem>
                      <SelectItem value="in-review">In Review</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={mPriority} onValueChange={setMPriority}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="urgent">Urgent</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Input placeholder="e.g. Frontend" value={mCategory} onChange={(e) => setMCategory(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Due Date</Label>
                  <Input type="date" value={mDueDate} onChange={(e) => setMDueDate(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Tags</Label>
                <div className="flex gap-2">
                  <Input placeholder="Add tag..." value={mTagInput} onChange={(e) => setMTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addManualTag() } }} />
                  <Button type="button" variant="outline" size="icon" onClick={addManualTag}><Plus className="w-4 h-4" /></Button>
                </div>
                {mTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {mTags.map((tag) => (
                      <span key={tag} className="flex items-center gap-1 bg-secondary text-secondary-foreground text-xs px-2.5 py-1 rounded-full">
                        {tag}
                        <button type="button" onClick={() => setMTags(mTags.filter((t) => t !== tag))} className="hover:text-destructive"><X className="w-3 h-3" /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {members.length > 0 && (
                <div className="space-y-2">
                  <Label>Assignees</Label>
                  <div className="border rounded-xl p-3 space-y-1 max-h-40 overflow-y-auto">
                    {members.map((m) => (
                      <label key={m.id} className="flex items-center gap-3 cursor-pointer hover:bg-accent rounded-lg px-2 py-1.5">
                        <input
                          type="checkbox"
                          checked={mAssignees.includes(m.id)}
                          onChange={() => setMAssignees((prev) => prev.includes(m.id) ? prev.filter((id) => id !== m.id) : [...prev, m.id])}
                          className="rounded"
                        />
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-[10px] font-bold">
                          {m.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm">{m.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button type="button" variant="outline" onClick={goBack}>Cancel</Button>
                <Button type="submit" disabled={manualMutation.isPending || !mTitle.trim()}>
                  {manualMutation.isPending ? 'Creating...' : 'Create Task'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
