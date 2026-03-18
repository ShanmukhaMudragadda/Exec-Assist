import { useState, useRef, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { transcriptsApi, tasksApi, workspacesApi } from '@/services/api'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import {
  FileText, Mic, Upload, PenLine, ChevronLeft,
  Loader2, CheckSquare, Square, Flag, X, Plus, StopCircle, Radio,
  CalendarDays, Tag, Users, AlignLeft, ChevronDown, ChevronUp,
} from 'lucide-react'

type Mode = 'manual' | 'transcript' | 'audio' | 'live' | null
type Step = 'pick-mode' | 'pick-transcript' | 'create-transcript' | 'record-audio' | 'record-live' | 'processing' | 'preview' | 'creating' | 'manual-form'

function modeFirstStep(m: Mode): Step {
  if (m === 'manual') return 'manual-form'
  if (m === 'transcript') return 'pick-transcript'
  if (m === 'audio') return 'record-audio'
  if (m === 'live') return 'record-live'
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

interface SmartCreateTaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  defaultStatus?: string
  initialMode?: Mode
}

const PRIORITY_OPTIONS = ['urgent', 'high', 'medium', 'low'] as const

export default function SmartCreateTaskDialog({
  open,
  onOpenChange,
  workspaceId,
  defaultStatus = 'todo',
  initialMode = null,
}: SmartCreateTaskDialogProps) {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<Mode>(initialMode)
  const [step, setStep] = useState<Step>(initialMode ? modeFirstStep(initialMode) : 'pick-mode')

  // Sync mode/step when dialog opens with a specific initialMode
  useEffect(() => {
    if (open) {
      setMode(initialMode)
      setStep(initialMode ? modeFirstStep(initialMode) : 'pick-mode')
    }
  }, [open, initialMode])

  // Transcript mode state
  const [selectedTranscriptId, setSelectedTranscriptId] = useState<string>('')
  const [newTxTitle, setNewTxTitle] = useState('')
  const [newTxContent, setNewTxContent] = useState('')
  const [newTxType, setNewTxType] = useState<'meeting' | 'notes' | 'interview' | 'other'>('meeting')

  // Audio mode state
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [transcriptionText, setTranscriptionText] = useState('')
  const [savedTranscriptId, setSavedTranscriptId] = useState<string>('')

  // Live recording state
  const [liveText, setLiveText] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const liveTextRef = useRef('')

  // Preview state
  const [previewTasks, setPreviewTasks] = useState<PreviewTask[]>([])
  const [previewTagInputs, setPreviewTagInputs] = useState<Record<string, string>>({})
  const [processingLabel, setProcessingLabel] = useState('')

  // Manual form state
  const [manualTitle, setManualTitle] = useState('')
  const [manualDescription, setManualDescription] = useState('')
  const [manualStatus, setManualStatus] = useState(defaultStatus)
  const [manualPriority, setManualPriority] = useState('medium')
  const [manualCategory, setManualCategory] = useState('')
  const [manualDueDate, setManualDueDate] = useState('')
  const [manualTagInput, setManualTagInput] = useState('')
  const [manualTags, setManualTags] = useState<string[]>([])
  const [manualAssignees, setManualAssignees] = useState<string[]>([])

  const { data: transcriptsData } = useQuery({
    queryKey: ['transcripts', workspaceId],
    queryFn: () => transcriptsApi.list(workspaceId).then((r) => r.data),
    enabled: open && mode === 'transcript',
  })
  const transcripts: { id: string; title: string; content: string; createdAt: string; processed: boolean }[] =
    transcriptsData?.transcripts || []

  const { data: membersData } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => workspacesApi.getMembers(workspaceId).then((r) => r.data),
    enabled: open && (mode === 'manual' || step === 'preview'),
  })
  const members: { id: string; userId: string; name: string }[] =
    membersData?.members?.map((m: { userId: string; user: { id: string; name: string } }) => ({
      id: m.user.id,
      userId: m.userId,
      name: m.user.name,
    })) || []

  const selectMode = (m: Mode) => {
    setMode(m)
    setStep(modeFirstStep(m))
  }

  const reset = () => {
    setMode(initialMode)
    setStep(initialMode ? modeFirstStep(initialMode) : 'pick-mode')
    setSelectedTranscriptId('')
    setNewTxTitle('')
    setNewTxContent('')
    setNewTxType('meeting')
    setAudioFile(null)
    setTranscriptionText('')
    setSavedTranscriptId('')
    setLiveText('')
    liveTextRef.current = ''
    setIsRecording(false)
    setPreviewTasks([])
    setPreviewTagInputs({})
    setManualTitle('')
    setManualDescription('')
    setManualStatus(defaultStatus)
    setManualPriority('medium')
    setManualCategory('')
    setManualDueDate('')
    setManualTagInput('')
    setManualTags([])
    setManualAssignees([])
    stopLiveRecording()
  }

  const handleClose = () => {
    reset()
    onOpenChange(false)
  }

  // ── Generate tasks from a saved transcript ID ──────────────────────────────
  const generateFromTranscriptId = async (transcriptId: string) => {
    setStep('processing')
    setProcessingLabel('Analyzing transcript with AI...')
    try {
      const res = await transcriptsApi.generateTasks(workspaceId, transcriptId)
      const extracted: ExtractedTask[] = res.data.extractedTasks || []
      if (extracted.length === 0) {
        toast({ title: 'No tasks found', description: 'The AI could not identify any tasks in this content.' })
        setStep(mode === 'transcript' ? 'pick-transcript' : mode === 'audio' ? 'record-audio' : 'record-live')
        return
      }
      setPreviewTasks(
        extracted.map((t, i) => ({
          ...t,
          _id: `${i}-${Date.now()}`,
          selected: true,
          expanded: false,
          assigneeIds: (t as any).assigneeIds || [],
          status: t.status || 'todo',
        }))
      )
      setStep('preview')
    } catch {
      toast({ title: 'AI extraction failed', description: 'Could not generate tasks from this content.', variant: 'destructive' })
      setStep(mode === 'transcript' ? 'pick-transcript' : mode === 'audio' ? 'record-audio' : 'record-live')
    }
  }

  // ── Create new transcript inline then generate ─────────────────────────────
  const createTranscriptMutation = useMutation({
    mutationFn: () =>
      transcriptsApi.createText(workspaceId, {
        title: newTxTitle.trim() || `Transcript — ${new Date().toLocaleString()}`,
        content: newTxContent.trim(),
        type: newTxType,
      }),
    onSuccess: (res) => {
      const transcriptId = res.data.transcript.id
      setSavedTranscriptId(transcriptId)
      queryClient.invalidateQueries({ queryKey: ['transcripts', workspaceId] })
      generateFromTranscriptId(transcriptId)
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to save transcript.', variant: 'destructive' })
    },
  })

  // ── Transcript mode: generate tasks ───────────────────────────────────────
  const handleGenerateFromTranscript = () => {
    if (!selectedTranscriptId) return
    generateFromTranscriptId(selectedTranscriptId)
  }

  // ── Audio mode: upload + transcribe + generate ─────────────────────────────
  const handleAudioUpload = async () => {
    if (!audioFile) return
    setStep('processing')
    setProcessingLabel('Uploading & transcribing audio...')
    try {
      const uploadRes = await transcriptsApi.uploadAudio(workspaceId, audioFile)
      const { transcript, transcription } = uploadRes.data
      setTranscriptionText(transcription || transcript.content || '')
      setSavedTranscriptId(transcript.id)
      setProcessingLabel('Extracting tasks with AI...')
      await generateFromTranscriptId(transcript.id)
    } catch {
      toast({ title: 'Upload failed', description: 'Could not process the audio file.', variant: 'destructive' })
      setStep('record-audio')
    }
  }

  // ── Live recording (Web Speech API) ───────────────────────────────────────
  const startLiveRecording = () => {
    const SpeechRecognition = (window as unknown as { SpeechRecognition?: typeof window.SpeechRecognition; webkitSpeechRecognition?: typeof window.SpeechRecognition }).SpeechRecognition
      || (window as unknown as { webkitSpeechRecognition?: typeof window.SpeechRecognition }).webkitSpeechRecognition
    if (!SpeechRecognition) {
      toast({ title: 'Not supported', description: 'Your browser does not support live speech recognition. Try Chrome.', variant: 'destructive' })
      return
    }
    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognitionRef.current = recognition

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = ''
      let final = liveTextRef.current
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          final += transcript + ' '
          liveTextRef.current = final
        } else {
          interim = transcript
        }
      }
      setLiveText(final + interim)
    }

    recognition.onerror = () => {
      setIsRecording(false)
    }

    recognition.start()
    setIsRecording(true)
  }

  const stopLiveRecording = () => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setIsRecording(false)
  }

  const handleLiveDone = async () => {
    stopLiveRecording()
    const text = liveTextRef.current.trim() || liveText.trim()
    if (!text) {
      toast({ title: 'Nothing recorded', description: 'Please say something before submitting.' })
      return
    }
    setStep('processing')
    setProcessingLabel('Saving transcript...')
    try {
      const saveRes = await transcriptsApi.createText(workspaceId, {
        title: `Live recording — ${new Date().toLocaleString()}`,
        content: text,
        type: 'meeting',
      })
      const transcriptId = saveRes.data.transcript.id
      setSavedTranscriptId(transcriptId)
      await generateFromTranscriptId(transcriptId)
    } catch {
      toast({ title: 'Failed', description: 'Could not save the live transcript.', variant: 'destructive' })
      setStep('record-live')
    }
  }

  // ── Save preview tasks ─────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async () => {
      const selected = previewTasks.filter((t) => t.selected)
      await Promise.all(
        selected.map((t) =>
          tasksApi.create(workspaceId, {
            title: t.title,
            description: t.description || undefined,
            priority: t.priority,
            status: (t.status as string) || defaultStatus,
            category: t.category || undefined,
            tags: t.tags,
            dueDate: t.dueDate || null,
            assigneeIds: t.assigneeIds?.length ? t.assigneeIds : undefined,
          })
        )
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', workspaceId] })
      const count = previewTasks.filter((t) => t.selected).length
      toast({ title: 'Tasks created!', description: `${count} task${count !== 1 ? 's' : ''} added to the board.` })
      handleClose()
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to create tasks.', variant: 'destructive' })
    },
  })

  // ── Manual create ──────────────────────────────────────────────────────────
  const manualCreateMutation = useMutation({
    mutationFn: () =>
      tasksApi.create(workspaceId, {
        title: manualTitle.trim(),
        description: manualDescription.trim() || undefined,
        status: manualStatus,
        priority: manualPriority,
        category: manualCategory.trim() || undefined,
        tags: manualTags,
        dueDate: manualDueDate || null,
        assigneeIds: manualAssignees,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', workspaceId] })
      toast({ title: 'Task created!', description: `"${manualTitle}" has been added.` })
      handleClose()
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { error?: string } } }
      toast({ title: 'Error', description: error.response?.data?.error || 'Failed to create task', variant: 'destructive' })
    },
  })

  const togglePreviewTask = (id: string) => {
    setPreviewTasks((prev) => prev.map((t) => t._id === id ? { ...t, selected: !t.selected } : t))
  }

  const updatePreviewTask = (id: string, updates: Partial<PreviewTask>) => {
    setPreviewTasks((prev) => prev.map((t) => t._id === id ? { ...t, ...updates } : t))
  }

  const togglePreviewAssignee = (taskId: string, userId: string) => {
    setPreviewTasks((prev) => prev.map((t) => {
      if (t._id !== taskId) return t
      const ids = t.assigneeIds.includes(userId)
        ? t.assigneeIds.filter((id) => id !== userId)
        : [...t.assigneeIds, userId]
      return { ...t, assigneeIds: ids }
    }))
  }

  const addPreviewTag = (taskId: string) => {
    const input = previewTagInputs[taskId]?.trim()
    if (!input) return
    setPreviewTasks((prev) => prev.map((t) =>
      t._id === taskId && !t.tags?.includes(input)
        ? { ...t, tags: [...(t.tags || []), input] }
        : t
    ))
    setPreviewTagInputs((prev) => ({ ...prev, [taskId]: '' }))
  }

  const removePreviewTag = (taskId: string, tag: string) => {
    setPreviewTasks((prev) => prev.map((t) =>
      t._id === taskId ? { ...t, tags: t.tags?.filter((tg) => tg !== tag) } : t
    ))
  }

  const addManualTag = () => {
    const t = manualTagInput.trim()
    if (t && !manualTags.includes(t)) setManualTags([...manualTags, t])
    setManualTagInput('')
  }

  const selectedCount = previewTasks.filter((t) => t.selected).length

  // Stop recognition when dialog closes
  useEffect(() => {
    if (!open) stopLiveRecording()
  }, [open])

  const getTitle = () => {
    if (step === 'pick-mode') return 'Create Tasks'
    if (step === 'create-transcript') return 'New Transcript'
    if (mode === 'manual') return 'New Task'
    if (mode === 'transcript') return 'Tasks from Transcript'
    if (mode === 'audio') return 'Tasks from Audio'
    if (mode === 'live') return 'Live Recording'
    return 'Create Tasks'
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={cn(
        step === 'preview'
          ? 'max-w-[95vw] w-[95vw] h-[95vh] max-h-[95vh] flex flex-col overflow-hidden p-0'
          : 'max-h-[90vh] overflow-y-auto max-w-lg'
      )}>
        <DialogHeader className={cn(step === 'preview' && 'px-6 pt-5 pb-0 shrink-0')}>
          <div className="flex items-center gap-2">
            {step !== 'pick-mode' && mode !== initialMode && (
              <button
                onClick={() => {
                  if (step === 'create-transcript') { setStep('pick-transcript'); return }
                  setMode(null); setStep('pick-mode')
                }}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <DialogTitle>{getTitle()}</DialogTitle>
          </div>
        </DialogHeader>

        {/* ── Step: Pick mode ───────────────────────────────────────── */}
        {step === 'pick-mode' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">How do you want to create tasks?</p>

            <div className="grid grid-cols-3 gap-3">
              <ModeCard
                icon={<FileText className="w-6 h-6" />}
                label="From Transcript"
                description="Use an existing transcript"
                color="text-indigo-600"
                bg="bg-indigo-50"
                onClick={() => selectMode('transcript')}
              />
              <ModeCard
                icon={<Upload className="w-6 h-6" />}
                label="Audio File"
                description="Upload a recording"
                color="text-purple-600"
                bg="bg-purple-50"
                onClick={() => selectMode('audio')}
              />
              <ModeCard
                icon={<Mic className="w-6 h-6" />}
                label="Live Recording"
                description="Speak to generate tasks"
                color="text-rose-600"
                bg="bg-rose-50"
                onClick={() => selectMode('live')}
              />
            </div>

            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">or enter manually</span>
              </div>
            </div>

            <button
              onClick={() => selectMode('manual')}
              className="w-full flex items-center gap-3 px-4 py-3 border rounded-lg hover:bg-accent transition-colors text-left"
            >
              <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
                <PenLine className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-medium">Manual Entry</div>
                <div className="text-xs text-muted-foreground">Fill in task details by hand</div>
              </div>
            </button>
          </div>
        )}

        {/* ── Step: Pick transcript ─────────────────────────────────── */}
        {step === 'pick-transcript' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Select an existing transcript or create a new one:</p>
              <Button variant="outline" size="sm" onClick={() => setStep('create-transcript')}>
                <Plus className="w-3.5 h-3.5 mr-1.5" />New
              </Button>
            </div>
            {transcripts.length === 0 ? (
              <div className="border rounded-lg p-8 text-center space-y-3">
                <FileText className="w-10 h-10 text-muted-foreground mx-auto" />
                <p className="text-sm font-medium">No transcripts yet</p>
                <p className="text-xs text-muted-foreground">Paste your meeting notes to create one now.</p>
                <Button size="sm" onClick={() => setStep('create-transcript')}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" />Create Transcript
                </Button>
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {transcripts.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTranscriptId(t.id)}
                    className={cn(
                      'w-full flex items-start gap-3 px-3 py-3 border rounded-lg text-left transition-colors',
                      selectedTranscriptId === t.id
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-accent'
                    )}
                  >
                    <FileText className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{t.title}</div>
                      <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{t.content.slice(0, 120)}…</div>
                    </div>
                    {t.processed && (
                      <Badge variant="secondary" className="text-xs shrink-0">Used</Badge>
                    )}
                  </button>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleGenerateFromTranscript} disabled={!selectedTranscriptId}>
                Generate Tasks
              </Button>
            </div>
          </div>
        )}

        {/* ── Step: Create new transcript ───────────────────────────── */}
        {step === 'create-transcript' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Paste or type your meeting notes — we'll extract tasks from them automatically.
            </p>
            <div className="space-y-2">
              <Label htmlFor="tx-title">Title <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                id="tx-title"
                placeholder={`Meeting notes — ${new Date().toLocaleDateString()}`}
                value={newTxTitle}
                onChange={(e) => setNewTxTitle(e.target.value)}
                autoFocus
              />
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
              <Label htmlFor="tx-content">Content *</Label>
              <Textarea
                id="tx-content"
                placeholder="Paste or type your transcript here…"
                value={newTxContent}
                onChange={(e) => setNewTxContent(e.target.value)}
                rows={8}
                className="resize-none"
              />
            </div>
            <div className="flex justify-between gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setStep('pick-transcript')}>
                <ChevronLeft className="w-4 h-4 mr-1" />Back
              </Button>
              <Button
                onClick={() => createTranscriptMutation.mutate()}
                disabled={!newTxContent.trim() || createTranscriptMutation.isPending}
              >
                {createTranscriptMutation.isPending
                  ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Saving…</>
                  : 'Save & Extract Tasks'
                }
              </Button>
            </div>
          </div>
        )}

        {/* ── Step: Record audio (file upload) ──────────────────────── */}
        {step === 'record-audio' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload an audio file — it will be transcribed and tasks will be extracted automatically.
            </p>
            <label className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 cursor-pointer hover:bg-accent transition-colors">
              <Upload className="w-10 h-10 text-muted-foreground mb-3" />
              {audioFile ? (
                <div className="text-center">
                  <p className="text-sm font-medium">{audioFile.name}</p>
                  <p className="text-xs text-muted-foreground">{(audioFile.size / 1024 / 1024).toFixed(1)} MB</p>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-sm font-medium">Click to upload audio</p>
                  <p className="text-xs text-muted-foreground mt-1">MP3, MP4, WAV, M4A, OGG supported</p>
                </div>
              )}
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleAudioUpload} disabled={!audioFile}>
                Transcribe & Extract Tasks
              </Button>
            </div>
          </div>
        )}

        {/* ── Step: Live recording (Web Speech API) ─────────────────── */}
        {step === 'record-live' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Speak your meeting notes or task list. We'll extract tasks from what you say.
            </p>
            <div className="flex flex-col items-center gap-4 py-4">
              <button
                onClick={isRecording ? stopLiveRecording : startLiveRecording}
                className={cn(
                  'w-20 h-20 rounded-full flex items-center justify-center transition-all shadow-lg',
                  isRecording
                    ? 'bg-red-500 hover:bg-red-600 animate-pulse'
                    : 'bg-primary hover:bg-primary/90'
                )}
              >
                {isRecording
                  ? <StopCircle className="w-9 h-9 text-white" />
                  : <Mic className="w-9 h-9 text-white" />
                }
              </button>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {isRecording
                  ? <><Radio className="w-3.5 h-3.5 text-red-500 animate-pulse" />Recording — click to stop</>
                  : <>{liveText ? 'Recording stopped' : 'Click to start recording'}</>
                }
              </div>
            </div>
            {liveText && (
              <div className="border rounded-lg p-3 bg-muted/30 max-h-40 overflow-y-auto">
                <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">Transcript</p>
                <p className="text-sm whitespace-pre-wrap">{liveText}</p>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button
                onClick={handleLiveDone}
                disabled={!liveText.trim() || isRecording}
              >
                Extract Tasks
              </Button>
            </div>
          </div>
        )}

        {/* ── Step: Processing ──────────────────────────────────────── */}
        {step === 'processing' && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">{processingLabel}</p>
          </div>
        )}

        {/* ── Step: Preview tasks ───────────────────────────────────── */}
        {step === 'preview' && (
          <div className="flex flex-col flex-1 min-h-0 px-6 pb-6">
            <div className="flex items-center justify-between py-3 border-b mb-3 shrink-0">
              <p className="text-sm text-muted-foreground">
                AI found <strong>{previewTasks.length}</strong> tasks — edit & select which to create:
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="text-xs h-7"
                  onClick={() => setPreviewTasks((p) => p.map((t) => ({ ...t, selected: true })))}>All</Button>
                <Button variant="ghost" size="sm" className="text-xs h-7"
                  onClick={() => setPreviewTasks((p) => p.map((t) => ({ ...t, selected: false })))}>None</Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
              {previewTasks.map((task) => (
                <div
                  key={task._id}
                  className={cn(
                    'border rounded-lg transition-colors',
                    task.selected ? 'bg-primary/5 border-primary/30' : 'opacity-50 bg-muted/20'
                  )}
                >
                  {/* Card header */}
                  <div className="flex items-center gap-2 px-3 pt-3 pb-2">
                    <button onClick={() => togglePreviewTask(task._id)} className="shrink-0 text-primary">
                      {task.selected
                        ? <CheckSquare className="w-4 h-4" />
                        : <Square className="w-4 h-4 text-muted-foreground" />}
                    </button>
                    <Input
                      value={task.title}
                      onChange={(e) => updatePreviewTask(task._id, { title: e.target.value })}
                      className="h-7 flex-1 text-sm font-semibold border-0 bg-transparent p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                      placeholder="Task title"
                    />
                    <button
                      onClick={() => updatePreviewTask(task._id, { expanded: !task.expanded })}
                      className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {task.expanded
                        ? <ChevronUp className="w-4 h-4" />
                        : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Always-visible quick fields row */}
                  <div className="flex items-center gap-2 px-3 pb-2 flex-wrap">
                    <Select value={task.priority} onValueChange={(v) => updatePreviewTask(task._id, { priority: v as PreviewTask['priority'] })}>
                      <SelectTrigger className="h-6 w-[100px] text-xs px-2 gap-1">
                        <Flag className="w-3 h-3 shrink-0" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORITY_OPTIONS.map((p) => (
                          <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={task.status || 'todo'} onValueChange={(v) => updatePreviewTask(task._id, { status: v })}>
                      <SelectTrigger className="h-6 w-[120px] text-xs px-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todo" className="text-xs">To Do</SelectItem>
                        <SelectItem value="in-progress" className="text-xs">In Progress</SelectItem>
                        <SelectItem value="in-review" className="text-xs">In Review</SelectItem>
                        <SelectItem value="completed" className="text-xs">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                    {task.category && !task.expanded && (
                      <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">{task.category}</span>
                    )}
                    {!task.expanded && task.tags && task.tags.length > 0 && (
                      <span className="text-xs text-muted-foreground">{task.tags.length} tag{task.tags.length !== 1 ? 's' : ''}</span>
                    )}
                  </div>

                  {/* Expanded editing fields */}
                  {task.expanded && (
                    <div className="px-3 pb-3 space-y-3 border-t pt-3">
                      {/* Description */}
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                          <AlignLeft className="w-3 h-3" /> Description
                        </label>
                        <Textarea
                          value={task.description || ''}
                          onChange={(e) => updatePreviewTask(task._id, { description: e.target.value })}
                          placeholder="Add a description..."
                          rows={2}
                          className="text-sm resize-none"
                        />
                      </div>

                      {/* Due Date + Category */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                            <CalendarDays className="w-3 h-3" /> Due Date
                          </label>
                          <Input
                            type="date"
                            value={task.dueDate || ''}
                            onChange={(e) => updatePreviewTask(task._id, { dueDate: e.target.value || null })}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Category</label>
                          <Input
                            value={task.category || ''}
                            onChange={(e) => updatePreviewTask(task._id, { category: e.target.value })}
                            placeholder="e.g. Frontend"
                            className="h-8 text-sm"
                          />
                        </div>
                      </div>

                      {/* Tags */}
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                          <Tag className="w-3 h-3" /> Tags
                        </label>
                        <div className="flex gap-2">
                          <Input
                            value={previewTagInputs[task._id] || ''}
                            onChange={(e) => setPreviewTagInputs((prev) => ({ ...prev, [task._id]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPreviewTag(task._id) } }}
                            placeholder="Add tag..."
                            className="h-8 text-sm flex-1"
                          />
                          <Button type="button" variant="outline" size="sm" className="h-8 px-2" onClick={() => addPreviewTag(task._id)}>
                            <Plus className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                        {task.tags && task.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {task.tags.map((tag) => (
                              <span key={tag} className="flex items-center gap-1 bg-secondary text-secondary-foreground text-xs px-2 py-0.5 rounded-full">
                                {tag}
                                <button type="button" onClick={() => removePreviewTag(task._id, tag)} className="hover:text-destructive">
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Assignees */}
                      {members.length > 0 && (
                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                            <Users className="w-3 h-3" /> Assignees
                          </label>
                          <div className="flex flex-wrap gap-1.5">
                            {members.map((m) => {
                              const isSelected = task.assigneeIds.includes(m.userId)
                              return (
                                <button
                                  key={m.userId}
                                  type="button"
                                  onClick={() => togglePreviewAssignee(task._id, m.userId)}
                                  className={cn(
                                    'flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs transition-colors',
                                    isSelected
                                      ? 'bg-primary/10 border-primary/40 text-primary font-medium'
                                      : 'border-border text-muted-foreground hover:bg-accent'
                                  )}
                                >
                                  <div className={cn(
                                    'w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold text-white',
                                    isSelected ? 'bg-primary' : 'bg-muted-foreground'
                                  )}>
                                    {m.name.charAt(0).toUpperCase()}
                                  </div>
                                  {m.name}
                                  {isSelected && <X className="w-3 h-3 ml-0.5" />}
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
            </div>

            <div className="flex justify-between items-center pt-4 mt-3 border-t shrink-0">
              <span className="text-sm text-muted-foreground font-medium">{selectedCount} task{selectedCount !== 1 ? 's' : ''} selected</span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleClose}>Cancel</Button>
                <Button
                  onClick={() => createMutation.mutate()}
                  disabled={selectedCount === 0 || createMutation.isPending}
                >
                  {createMutation.isPending
                    ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Creating...</>
                    : `Create ${selectedCount} Task${selectedCount !== 1 ? 's' : ''}`}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Step: Manual form ─────────────────────────────────────── */}
        {step === 'manual-form' && (
          <form
            onSubmit={(e) => { e.preventDefault(); if (manualTitle.trim()) manualCreateMutation.mutate() }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="m-title">Title *</Label>
              <Input
                id="m-title"
                placeholder="What needs to be done?"
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="m-desc">Description</Label>
              <Textarea
                id="m-desc"
                placeholder="Add more details..."
                value={manualDescription}
                onChange={(e) => setManualDescription(e.target.value)}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={manualStatus} onValueChange={setManualStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todo">Todo</SelectItem>
                    <SelectItem value="in-progress">In Progress</SelectItem>
                    <SelectItem value="in-review">In Review</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={manualPriority} onValueChange={setManualPriority}>
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
                <Label htmlFor="m-cat">Category</Label>
                <Input id="m-cat" placeholder="e.g., Frontend" value={manualCategory} onChange={(e) => setManualCategory(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="m-due">Due Date</Label>
                <Input id="m-due" type="date" value={manualDueDate} onChange={(e) => setManualDueDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Tags</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Add tag..."
                  value={manualTagInput}
                  onChange={(e) => setManualTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addManualTag() } }}
                />
                <Button type="button" variant="outline" size="icon" onClick={addManualTag}><Plus className="w-4 h-4" /></Button>
              </div>
              {manualTags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {manualTags.map((tag) => (
                    <span key={tag} className="flex items-center gap-1 bg-secondary text-secondary-foreground text-xs px-2 py-1 rounded-full">
                      {tag}
                      <button type="button" onClick={() => setManualTags(manualTags.filter((t) => t !== tag))} className="hover:text-destructive">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            {members.length > 0 && (
              <div className="space-y-2">
                <Label>Assignees</Label>
                <div className="border rounded-md p-2 space-y-1 max-h-32 overflow-y-auto">
                  {members.map((m) => (
                    <label key={m.id} className="flex items-center gap-2 cursor-pointer hover:bg-accent rounded p-1">
                      <input
                        type="checkbox"
                        checked={manualAssignees.includes(m.id)}
                        onChange={() => setManualAssignees((prev) =>
                          prev.includes(m.id) ? prev.filter((id) => id !== m.id) : [...prev, m.id]
                        )}
                        className="rounded"
                      />
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-[10px] font-semibold">
                        {m.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm">{m.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
              <Button type="submit" disabled={manualCreateMutation.isPending || !manualTitle.trim()}>
                {manualCreateMutation.isPending ? 'Creating...' : 'Create Task'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ModeCard({
  icon, label, description, color, bg, onClick,
}: {
  icon: React.ReactNode
  label: string
  description: string
  color: string
  bg: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 p-4 border rounded-xl hover:border-primary hover:bg-accent transition-all text-center group"
    >
      <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', bg, color, 'group-hover:scale-110 transition-transform')}>
        {icon}
      </div>
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground leading-tight">{description}</div>
      </div>
    </button>
  )
}
