import { useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import AppLayout from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { transcriptsApi, workspacesApi } from '@/services/api'
import { toast } from '@/hooks/use-toast'
import { Upload, FileText, Mic, Wand2, Check, X, Plus, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Transcript {
  id: string
  title: string
  content: string
  type: string
  createdAt: string
  status?: string
}

interface GeneratedTask {
  title: string
  description?: string
  priority: string
  category?: string
  tags?: string[]
  dueDate?: string | null
  selected?: boolean
}

export default function TranscriptsPage() {
  const { id: workspaceId } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [activeTab, setActiveTab] = useState<'list' | 'upload' | 'text'>('list')
  const [textTitle, setTextTitle] = useState('')
  const [textContent, setTextContent] = useState('')
  const [textType, setTextType] = useState('meeting')
  const [uploadTitle, setUploadTitle] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [generatingFor, setGeneratingFor] = useState<string | null>(null)
  const [generatedTasks, setGeneratedTasks] = useState<GeneratedTask[]>([])
  const [savingFor, setSavingFor] = useState<string | null>(null)

  const { data: transcriptsData, isLoading } = useQuery({
    queryKey: ['transcripts', workspaceId],
    queryFn: () => transcriptsApi.list(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  })

  const transcripts: Transcript[] = transcriptsData?.transcripts || transcriptsData || []

  const { data: workspaceData } = useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: () => workspacesApi.get(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  })
  const workspace = workspaceData?.workspace || workspaceData

  const textMutation = useMutation({
    mutationFn: () =>
      transcriptsApi.createText(workspaceId!, {
        title: textTitle.trim(),
        content: textContent.trim(),
        type: textType,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transcripts', workspaceId] })
      setTextTitle('')
      setTextContent('')
      setTextType('meeting')
      setActiveTab('list')
      toast({ title: 'Transcript saved!', description: 'You can now generate tasks from it.' })
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { error?: string } } }
      toast({ title: 'Error', description: error.response?.data?.error || 'Failed to save transcript', variant: 'destructive' })
    },
  })

  const uploadMutation = useMutation({
    mutationFn: () => transcriptsApi.uploadAudio(workspaceId!, selectedFile!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transcripts', workspaceId] })
      setSelectedFile(null)
      setUploadTitle('')
      setActiveTab('list')
      toast({ title: 'Audio uploaded!', description: 'Transcription is being processed.' })
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { error?: string } } }
      toast({ title: 'Error', description: error.response?.data?.error || 'Failed to upload audio', variant: 'destructive' })
    },
  })

  const handleGenerateTasks = async (transcript: Transcript) => {
    setGeneratingFor(transcript.id)
    setGeneratedTasks([])
    try {
      const res = await transcriptsApi.generateTasks(workspaceId!, transcript.id)
      const tasks = res.data?.tasks || res.data || []
      setGeneratedTasks(tasks.map((t: GeneratedTask) => ({ ...t, selected: true })))
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } }
      toast({ title: 'Error', description: error.response?.data?.error || 'Failed to generate tasks', variant: 'destructive' })
    } finally {
      setGeneratingFor(null)
    }
  }

  const handleSaveTasks = async (transcriptId: string) => {
    const selected = generatedTasks.filter((t) => t.selected)
    if (selected.length === 0) {
      toast({ title: 'No tasks selected', description: 'Select at least one task to save.', variant: 'destructive' })
      return
    }
    setSavingFor(transcriptId)
    try {
      await transcriptsApi.saveTasks(workspaceId!, transcriptId, selected)
      queryClient.invalidateQueries({ queryKey: ['tasks', workspaceId] })
      setGeneratedTasks([])
      toast({ title: `${selected.length} task(s) saved!`, description: 'Tasks have been added to your board.' })
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } }
      toast({ title: 'Error', description: error.response?.data?.error || 'Failed to save tasks', variant: 'destructive' })
    } finally {
      setSavingFor(null)
    }
  }

  const toggleTask = (idx: number) => {
    setGeneratedTasks((prev) =>
      prev.map((t, i) => (i === idx ? { ...t, selected: !t.selected } : t))
    )
  }

  const PRIORITY_COLORS: Record<string, string> = {
    urgent: 'bg-red-100 text-red-700',
    high: 'bg-orange-100 text-orange-700',
    medium: 'bg-yellow-100 text-yellow-700',
    low: 'bg-green-100 text-green-700',
  }

  return (
    <AppLayout>
      <div className="p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Transcripts</h1>
            <p className="text-muted-foreground mt-1">
              {workspace?.name} &mdash; Upload audio or paste meeting notes to generate AI tasks
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={activeTab === 'text' ? 'default' : 'outline'}
              size="sm"
              className="gap-2"
              onClick={() => setActiveTab(activeTab === 'text' ? 'list' : 'text')}
            >
              <FileText className="w-4 h-4" />
              Paste Text
            </Button>
            <Button
              variant={activeTab === 'upload' ? 'default' : 'outline'}
              size="sm"
              className="gap-2"
              onClick={() => setActiveTab(activeTab === 'upload' ? 'list' : 'upload')}
            >
              <Upload className="w-4 h-4" />
              Upload Audio
            </Button>
          </div>
        </div>

        {/* Text Transcript Form */}
        {activeTab === 'text' && (
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Paste Transcript or Meeting Notes
              </CardTitle>
              <CardDescription>Paste your meeting transcript, notes, or any text to generate AI tasks.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input
                    placeholder="e.g., Q1 Planning Meeting"
                    value={textTitle}
                    onChange={(e) => setTextTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={textType} onValueChange={setTextType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="meeting">Meeting</SelectItem>
                      <SelectItem value="interview">Interview</SelectItem>
                      <SelectItem value="notes">Notes</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Content</Label>
                <Textarea
                  placeholder="Paste your transcript or meeting notes here..."
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  rows={8}
                  className="font-mono text-sm"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setActiveTab('list')}>Cancel</Button>
                <Button
                  onClick={() => textMutation.mutate()}
                  disabled={textMutation.isPending || !textTitle.trim() || !textContent.trim()}
                  className="gap-2"
                >
                  {textMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Save Transcript
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Audio Upload Form */}
        {activeTab === 'upload' && (
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Mic className="w-4 h-4" />
                Upload Audio Recording
              </CardTitle>
              <CardDescription>Upload an audio file to transcribe and generate tasks from it.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Title (optional)</Label>
                <Input
                  placeholder="e.g., Weekly Standup Recording"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                />
              </div>
              <div
                className={cn(
                  'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
                  selectedFile ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50'
                )}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                />
                {selectedFile ? (
                  <div className="flex flex-col items-center gap-2">
                    <Mic className="w-8 h-8 text-primary" />
                    <p className="font-medium">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); setSelectedFile(null) }}
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="w-8 h-8 text-muted-foreground" />
                    <p className="font-medium">Click to upload audio</p>
                    <p className="text-sm text-muted-foreground">MP3, WAV, M4A, OGG supported</p>
                  </div>
                )}
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setActiveTab('list')}>Cancel</Button>
                <Button
                  onClick={() => uploadMutation.mutate()}
                  disabled={uploadMutation.isPending || !selectedFile}
                  className="gap-2"
                >
                  {uploadMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  Upload & Transcribe
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Generated Tasks Preview */}
        {generatedTasks.length > 0 && (
          <Card className="border-green-200 bg-green-50/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2 text-green-700">
                    <Wand2 className="w-4 h-4" />
                    Generated Tasks ({generatedTasks.filter((t) => t.selected).length} selected)
                  </CardTitle>
                  <CardDescription>Review and select tasks to save to your board.</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setGeneratedTasks([])}>
                    Discard
                  </Button>
                  <Button
                    size="sm"
                    className="gap-2 bg-green-600 hover:bg-green-700"
                    onClick={() => handleSaveTasks(generatedTasks[0]?.title ? '' : '')}
                    disabled={!!savingFor || generatedTasks.filter((t) => t.selected).length === 0}
                  >
                    {savingFor ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Save Selected Tasks
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {generatedTasks.map((task, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      'flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer',
                      task.selected ? 'bg-white border-green-300' : 'bg-muted/50 border-transparent opacity-60'
                    )}
                    onClick={() => toggleTask(idx)}
                  >
                    <div className={cn(
                      'w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 border-2',
                      task.selected ? 'bg-green-600 border-green-600' : 'border-muted-foreground/30'
                    )}>
                      {task.selected && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{task.title}</p>
                      {task.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{task.description}</p>
                      )}
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {task.priority && (
                          <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', PRIORITY_COLORS[task.priority])}>
                            {task.priority}
                          </span>
                        )}
                        {task.category && (
                          <span className="text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full">
                            {task.category}
                          </span>
                        )}
                        {task.tags?.map((tag) => (
                          <span key={tag} className="text-[10px] bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded-full">
                            {tag}
                          </span>
                        ))}
                        {task.dueDate && (
                          <span className="text-[10px] text-muted-foreground">
                            Due: {format(new Date(task.dueDate), 'MMM d')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Transcripts List */}
        {activeTab === 'list' && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Saved Transcripts</h2>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="animate-pulse">
                    <CardContent className="p-4">
                      <div className="h-5 bg-muted rounded w-1/3 mb-2" />
                      <div className="h-4 bg-muted rounded w-2/3" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : transcripts.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-30" />
                  <h3 className="font-semibold mb-2">No transcripts yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Upload an audio recording or paste meeting notes to get started.
                  </p>
                  <div className="flex gap-2 justify-center">
                    <Button variant="outline" size="sm" onClick={() => setActiveTab('text')} className="gap-2">
                      <FileText className="w-4 h-4" /> Paste Text
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setActiveTab('upload')} className="gap-2">
                      <Upload className="w-4 h-4" /> Upload Audio
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {transcripts.map((transcript) => (
                  <Card key={transcript.id} className="hover:shadow-sm transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="w-7 h-7 rounded bg-indigo-100 flex items-center justify-center">
                              {transcript.type === 'meeting' ? (
                                <Mic className="w-3.5 h-3.5 text-indigo-600" />
                              ) : (
                                <FileText className="w-3.5 h-3.5 text-indigo-600" />
                              )}
                            </div>
                            <h3 className="font-medium">{transcript.title}</h3>
                            <Badge variant="secondary" className="text-xs capitalize">{transcript.type}</Badge>
                            {transcript.status && transcript.status !== 'completed' && (
                              <Badge className="text-xs capitalize">{transcript.status}</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2 pl-9">{transcript.content}</p>
                          <p className="text-xs text-muted-foreground mt-1 pl-9">
                            {format(new Date(transcript.createdAt), 'MMM d, yyyy h:mm a')}
                          </p>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-2"
                            disabled={generatingFor === transcript.id}
                            onClick={() => handleGenerateTasks(transcript)}
                          >
                            {generatingFor === transcript.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Wand2 className="w-3.5 h-3.5" />
                            )}
                            Generate Tasks
                          </Button>
                          {generatedTasks.length > 0 && generatingFor !== transcript.id && (
                            <Button
                              size="sm"
                              className="gap-2 bg-green-600 hover:bg-green-700"
                              disabled={!!savingFor}
                              onClick={() => handleSaveTasks(transcript.id)}
                            >
                              {savingFor === transcript.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )}
                              Save Tasks
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
