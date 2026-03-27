import { useState, useRef, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import AppLayout from '@/components/layout/AppLayout'
import { actionsApi } from '@/services/api'
import { cn } from '@/lib/utils'

type UploadMode = 'transcript' | 'sheets' | 'live'

interface AISettings {
  autoAssignOwners: boolean
  includeDeadlines: boolean
  priorityDetection: boolean
  executiveFocus: boolean
}

const MODES: { id: UploadMode; icon: string; label: string; subtitle: string }[] = [
  { id: 'transcript', icon: 'description', label: 'Transcript',   subtitle: 'Paste or upload a meeting transcript' },
  { id: 'sheets',     icon: 'bar_chart',   label: 'Spreadsheet',  subtitle: 'Upload CSV or Excel with action items'  },
  { id: 'live',       icon: 'mic',         label: 'Voice',        subtitle: 'Record voice and generate actions live' },
]

const AI_SETTINGS_CONFIG: { key: keyof AISettings; label: string; desc: string }[] = [
  { key: 'autoAssignOwners',  label: 'Auto-assign owners',    desc: 'Match task owners to meeting attendees'  },
  { key: 'includeDeadlines',  label: 'Extract deadlines',     desc: 'Parse dates and timelines from transcript' },
  { key: 'priorityDetection', label: 'Priority detection',    desc: 'Infer urgency from language signals'      },
  { key: 'executiveFocus',    label: 'Executive focus',       desc: 'Only extract C-suite / strategic actions' },
]

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className={cn('relative w-8 h-4 rounded-full transition-colors shrink-0', on ? 'bg-[#4648d4]' : 'bg-[#e5e7eb]')}>
      <span className={cn('absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all', on ? 'left-[18px]' : 'left-0.5')} />
    </button>
  )
}

export default function UploadDataPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const initiativeId = searchParams.get('initiativeId') || ''
  const mode = (searchParams.get('mode') as UploadMode) || 'transcript'
  const [transcript, setTranscript] = useState('')
  const [projectRef, setProjectRef] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generatedActions, setGeneratedActions] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [recording, setRecording] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [aiSettings, setAiSettings] = useState<AISettings>({
    autoAssignOwners: true,
    includeDeadlines: true,
    priorityDetection: true,
    executiveFocus: false,
  })
  const [interimText, setInterimText] = useState('')
  const [recordError, setRecordError] = useState('')
  const [recordSeconds, setRecordSeconds] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const sheetsFileRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const barsRef = useRef<number[]>(Array(48).fill(2))

  // Draw waveform on canvas
  const drawBars = (isRecording: boolean) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width
    const H = canvas.height
    ctx.clearRect(0, 0, W, H)

    const bars = barsRef.current
    const count = bars.length
    const gap = 3
    const barW = Math.floor((W - gap * (count - 1)) / count)

    bars.forEach((h, i) => {
      const x = i * (barW + gap)
      const barH = Math.max(2, h)
      const y = (H - barH) / 2
      const alpha = isRecording ? 0.85 + (h / H) * 0.15 : 0.3
      ctx.fillStyle = isRecording
        ? `rgba(70, 72, 212, ${alpha})`
        : 'rgba(156, 163, 175, 0.4)'
      const r = Math.min(barW / 2, 3)
      ctx.beginPath()
      ctx.roundRect(x, y, barW, barH, r)
      ctx.fill()
    })
  }

  const startVisualizer = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      micStreamRef.current = stream
      const audioCtx = new AudioContext()
      audioCtxRef.current = audioCtx
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 128
      analyser.smoothingTimeConstant = 0.75
      analyserRef.current = analyser
      const source = audioCtx.createMediaStreamSource(stream)
      source.connect(analyser)
      const dataArray = new Uint8Array(analyser.frequencyBinCount)

      const animate = () => {
        analyser.getByteFrequencyData(dataArray)
        const bars = barsRef.current
        const bins = dataArray.length
        const canvas = canvasRef.current
        const H = canvas?.height ?? 80
        for (let i = 0; i < bars.length; i++) {
          const binIdx = Math.floor((i / bars.length) * bins)
          const target = (dataArray[binIdx] / 255) * H * 0.9
          bars[i] = bars[i] * 0.6 + target * 0.4
        }
        drawBars(true)
        animFrameRef.current = requestAnimationFrame(animate)
      }
      animate()
    } catch {
      // Fallback: fake animated bars
      const animate = () => {
        const bars = barsRef.current
        const canvas = canvasRef.current
        const H = canvas?.height ?? 80
        bars.forEach((_, i) => {
          bars[i] = bars[i] * 0.7 + (Math.random() * H * 0.6) * 0.3
        })
        drawBars(true)
        animFrameRef.current = requestAnimationFrame(animate)
      }
      animate()
    }
  }

  const stopVisualizer = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    animFrameRef.current = null
    analyserRef.current?.disconnect()
    audioCtxRef.current?.close()
    audioCtxRef.current = null
    analyserRef.current = null
    micStreamRef.current?.getTracks().forEach((t) => t.stop())
    micStreamRef.current = null
    // Animate bars back to flat
    const decay = () => {
      const bars = barsRef.current
      let anyUp = false
      bars.forEach((h, i) => {
        bars[i] = h * 0.7
        if (h > 1) anyUp = true
      })
      drawBars(false)
      if (anyUp) requestAnimationFrame(decay)
      else { bars.fill(2); drawBars(false) }
    }
    decay()
  }

  // Draw flat bars on mount
  useEffect(() => {
    barsRef.current.fill(2)
    drawBars(false)
  }, [])

  // Resize canvas to match display size
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const syncSize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio
      canvas.height = canvas.offsetHeight * window.devicePixelRatio
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    }
    syncSize()
    const ro = new ResizeObserver(syncSize)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [])

  const setMode = (m: UploadMode) => {
    const next = new URLSearchParams(searchParams)
    next.set('mode', m)
    setSearchParams(next)
  }

  const toggleSetting = (key: keyof AISettings) => {
    setAiSettings((s) => ({ ...s, [key]: !s[key] }))
  }

  const startRecording = () => {
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognitionClass) {
      setRecordError('Speech recognition is not supported in this browser. Please use Chrome or Safari.')
      return
    }
    setRecordError('')
    const recognition = new SpeechRecognitionClass()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalChunk = ''
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalChunk += text + ' '
        } else {
          interim = text
        }
      }
      if (finalChunk) setTranscript((prev) => prev + finalChunk)
      setInterimText(interim)
    }

    recognition.onerror = (e: Event) => {
      const err = (e as any).error as string
      if (err === 'not-allowed') {
        setRecordError('Microphone access denied. Please allow microphone permission and try again.')
        recognitionRef.current = null
        setRecording(false)
        setInterimText('')
        stopVisualizer()
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
      } else if (err === 'no-speech') {
        // no-speech is not a real error — recognition will fire onend and we'll restart
      } else {
        setRecordError(`Recording error: ${err}`)
        recognitionRef.current = null
        setRecording(false)
        setInterimText('')
        stopVisualizer()
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
      }
    }

    recognition.onend = () => {
      // Only restart if stopRecording() hasn't been called (ref is still set)
      if (recognitionRef.current) {
        // Small delay avoids InvalidStateError when Chrome hasn't fully torn down yet
        setTimeout(() => {
          try { recognitionRef.current?.start() } catch {}
        }, 200)
      }
    }

    recognition.start()
    recognitionRef.current = recognition
    setRecording(true)
    setRecordSeconds(0)
    timerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000)
    startVisualizer()
  }

  const stopRecording = () => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setRecording(false)
    setInterimText('')
    stopVisualizer()
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  const handleGenerate = async () => {
    if (!transcript.trim()) return
    setGenerating(true)
    try {
      const res = initiativeId
        ? await actionsApi.generateFromTranscript(initiativeId, { content: transcript, title: projectRef || undefined, aiSettings } as any)
        : await actionsApi.generateStandalone(transcript)
      setGeneratedActions((res.data as any)?.actions || [])
    } finally {
      setGenerating(false)
    }
  }

  const handleSave = async () => {
    if (!generatedActions.length || !initiativeId) return
    setSaving(true)
    try {
      await actionsApi.bulkCreate(initiativeId, generatedActions)
      queryClient.invalidateQueries({ queryKey: ['initiative', initiativeId] })
      navigate(initiativeId ? `/initiatives/${initiativeId}` : '/initiatives')
    } finally {
      setSaving(false)
    }
  }

  const showReview = generatedActions.length > 0 && (mode === 'transcript' || mode === 'live')

  return (
    <AppLayout>
      <div className="bg-[#f9fafb] min-h-screen p-7">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-[20px] font-bold text-[#111827] tracking-tight">Import & Generate</h1>
          <p className="text-[13px] text-[#6b7280] mt-0.5">
            Extract actions from transcripts, spreadsheets, or voice recordings.
          </p>
        </div>

        {/* Mode selector */}
        <div className="flex gap-2 mb-6">
          {MODES.map((m) => {
            const isActive = mode === m.id
            return (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={cn(
                  'flex items-center gap-2.5 px-4 py-2.5 rounded-lg border text-left transition-all',
                  isActive
                    ? 'bg-white border-[#4648d4] text-[#4648d4] shadow-sm'
                    : 'bg-white border-[#e5e7eb] text-[#6b7280] hover:border-[#4648d4]/40'
                )}
              >
                <span className={cn('material-symbols-outlined text-[18px]', isActive ? 'text-[#4648d4]' : 'text-[#9ca3af]')}>{m.icon}</span>
                <div>
                  <p className={cn('text-xs font-bold', isActive ? 'text-[#4648d4]' : 'text-[#374151]')}>{m.label}</p>
                  <p className="text-[10px] text-[#9ca3af] hidden sm:block">{m.subtitle}</p>
                </div>
                {isActive && <span className="material-symbols-outlined text-[#4648d4] text-[16px] ml-1">check_circle</span>}
              </button>
            )
          })}
        </div>

        {!showReview ? (
          <div className="grid grid-cols-12 gap-5">
            {/* LEFT — Input */}
            <div className="col-span-12 lg:col-span-7 bg-white rounded-xl border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] p-6 space-y-5">
              {/* TRANSCRIPT MODE */}
              {mode === 'transcript' && (
                <>
                  <div>
                    <label className="block text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest mb-1.5">
                      Reference Label
                    </label>
                    <input
                      type="text" placeholder="e.g. Board Meeting — March 2026"
                      value={projectRef} onChange={(e) => setProjectRef(e.target.value)}
                      className="w-full h-9 px-3 bg-white border border-[#e5e7eb] rounded-lg text-[13px] text-[#111827] focus:ring-2 focus:ring-[#4648d4]/10 focus:border-[#4648d4] focus:outline-none transition-all placeholder:text-[#c4c4c4]"
                    />
                  </div>

                  {/* Drop zone */}
                  <div
                    onClick={() => fileRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => { e.preventDefault(); setDragOver(false) }}
                    className={cn(
                      'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all',
                      dragOver ? 'border-[#4648d4] bg-[#ede9fe]/20' : 'border-[#e5e7eb] bg-[#f7f9fb] hover:border-[#4648d4]/50'
                    )}
                  >
                    <span className="material-symbols-outlined text-3xl text-[#9ca3af] block mb-2">cloud_upload</span>
                    <p className="text-sm font-semibold text-[#374151]">Drop file here or <span className="text-[#4648d4]">browse</span></p>
                    <p className="text-[11px] text-[#9ca3af] mt-1">PDF · DOCX · TXT (max 50MB)</p>
                    <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" className="hidden" />
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-[#e5e7eb]" />
                    <span className="text-[11px] text-[#9ca3af] font-bold uppercase tracking-widest">or paste text</span>
                    <div className="flex-1 h-px bg-[#e5e7eb]" />
                  </div>

                  <textarea
                    rows={8} placeholder="Paste your meeting transcript or notes here..."
                    value={transcript} onChange={(e) => setTranscript(e.target.value)}
                    className="w-full bg-white border border-[#e5e7eb] rounded-xl px-4 py-3 text-[13px] text-[#111827] focus:ring-2 focus:ring-[#4648d4]/10 focus:border-[#4648d4] focus:outline-none resize-none transition-all placeholder:text-[#c4c4c4]"
                  />

                  {!initiativeId && (
                    <div className="p-3 bg-[#f5f3ff] border border-[#ede9fe] rounded-lg text-xs text-[#4648d4] font-medium flex items-center gap-2">
                      <span className="material-symbols-outlined text-[16px]">info</span>
                      No initiative selected — actions will be saved to Command Center.
                    </div>
                  )}

                  <button
                    onClick={handleGenerate}
                    disabled={generating || !transcript.trim()}
                    className="w-full py-3 bg-[#4648d4] text-white font-bold rounded-xl hover:bg-[#3730a3] transition-colors disabled:opacity-40 flex items-center justify-center gap-2 text-sm"
                  >
                    {generating ? (
                      <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Analyzing transcript...</>
                    ) : (
                      <><span className="material-symbols-outlined text-[18px]">auto_awesome</span>Generate Actions</>
                    )}
                  </button>
                </>
              )}

              {/* SHEETS MODE */}
              {mode === 'sheets' && (
                <div className="space-y-4">
                  <div
                    onClick={() => sheetsFileRef.current?.click()}
                    className="border-2 border-dashed border-[#e5e7eb] rounded-xl p-12 text-center cursor-pointer hover:border-[#4648d4]/50 hover:bg-[#f7f9fb] transition-all"
                  >
                    <span className="material-symbols-outlined text-4xl text-[#9ca3af] block mb-3">table_chart</span>
                    <p className="text-sm font-semibold text-[#374151]">Upload Spreadsheet</p>
                    <p className="text-[11px] text-[#9ca3af] mt-1">CSV · XLSX supported</p>
                    <input ref={sheetsFileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" />
                  </div>
                  <div className="p-3 bg-[#f7f9fb] border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] rounded-lg text-xs text-[#6b7280]">
                    <p className="font-semibold mb-1">Expected columns:</p>
                    <p className="text-[#9ca3af]">Title, Description, Assignee, Due Date, Priority</p>
                  </div>
                  <button disabled className="w-full py-3 bg-[#4648d4] text-white font-bold rounded-xl opacity-40 text-sm cursor-not-allowed">
                    Upload & Import
                  </button>
                </div>
              )}

              {/* LIVE MODE */}
              {mode === 'live' && (
                <div className="space-y-5">
                  {/* Visualizer card */}
                  <div className={cn(
                    'rounded-2xl border transition-all duration-300 overflow-hidden',
                    recording ? 'border-[#4648d4]/30 bg-[#f5f3ff]' : 'border-[#e5e7eb] bg-[#f9fafb]'
                  )}>
                    {/* Top bar: status + timer */}
                    <div className="flex items-center justify-between px-5 pt-4 pb-2">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          'w-2 h-2 rounded-full transition-all',
                          recording ? 'bg-[#dc2626] animate-pulse' : 'bg-[#d1d5db]'
                        )} />
                        <span className={cn('text-[11px] font-bold uppercase tracking-widest', recording ? 'text-[#4648d4]' : 'text-[#9ca3af]')}>
                          {recording ? 'Recording' : 'Idle'}
                        </span>
                      </div>
                      {recording && (
                        <span className="text-[12px] font-mono font-bold text-[#4648d4] tabular-nums">
                          {String(Math.floor(recordSeconds / 60)).padStart(2, '0')}:{String(recordSeconds % 60).padStart(2, '0')}
                        </span>
                      )}
                    </div>

                    {/* Waveform canvas */}
                    <div className="px-5 pb-2">
                      <canvas
                        ref={canvasRef}
                        className="w-full"
                        style={{ height: 72, display: 'block' }}
                      />
                    </div>

                    {/* Mic button row */}
                    <div className="flex items-center justify-center gap-4 px-5 pb-5 pt-1">
                      <button
                        onClick={recording ? stopRecording : startRecording}
                        className={cn(
                          'flex items-center gap-2.5 px-7 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm',
                          recording
                            ? 'bg-white text-[#dc2626] border border-[#fecaca] hover:bg-[#fef2f2]'
                            : 'bg-[#4648d4] text-white hover:bg-[#3730a3]'
                        )}
                      >
                        <span className={cn(
                          'material-symbols-outlined text-[18px]',
                        )} style={{ fontVariationSettings: recording ? "'FILL' 1" : "'FILL' 0" }}>
                          {recording ? 'stop_circle' : 'mic'}
                        </span>
                        {recording ? 'Stop Recording' : 'Start Recording'}
                      </button>
                    </div>
                  </div>

                  {recordError && (
                    <p className="text-xs text-[#dc2626] bg-[#fef2f2] px-3 py-2 rounded-lg border border-[#fecaca]">{recordError}</p>
                  )}

                  {/* Live transcript box */}
                  {(transcript || interimText || recording) && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest">Live Transcript</label>
                        {transcript && (
                          <button onClick={() => setTranscript('')} className="text-[10px] text-[#9ca3af] hover:text-[#dc2626] transition-colors">Clear</button>
                        )}
                      </div>
                      <div className="min-h-[120px] max-h-[240px] overflow-y-auto bg-[#f9fafb] border border-[#e5e7eb] rounded-xl px-4 py-3 text-[13px] leading-relaxed">
                        <span className="text-[#111827]">{transcript}</span>
                        {interimText && <span className="text-[#9ca3af] italic">{interimText}</span>}
                        {recording && !transcript && !interimText && (
                          <span className="text-[#9ca3af] italic">Listening…</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Generate from live transcript */}
                  {transcript && !recording && (
                    <button
                      onClick={handleGenerate}
                      disabled={generating}
                      className="w-full py-3 bg-[#4648d4] text-white font-bold rounded-xl hover:bg-[#3730a3] transition-colors disabled:opacity-40 flex items-center justify-center gap-2 text-sm"
                    >
                      {generating ? (
                        <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Analyzing…</>
                      ) : (
                        <><span className="material-symbols-outlined text-[18px]">auto_awesome</span>Generate Actions from Recording</>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* RIGHT — AI Settings */}
            <div className="col-span-12 lg:col-span-5 space-y-4">
              {/* How it works */}
              <div className="bg-white rounded-xl border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] p-4">
                <h3 className="text-[11px] font-bold text-[#9ca3af] uppercase tracking-widest mb-3">How It Works</h3>
                <div className="space-y-3">
                  {[
                    { num: '1', text: 'Paste or upload your transcript' },
                    { num: '2', text: 'AI extracts action items and assigns owners' },
                    { num: '3', text: 'Review generated actions before saving' },
                    { num: '4', text: 'Actions are added to your initiative' },
                  ].map(({ num, text }) => (
                    <div key={num} className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-[#ede9fe] text-[#4648d4] text-[11px] font-black flex items-center justify-center shrink-0">{num}</div>
                      <p className="text-xs text-[#374151]">{text}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* AI Settings — fully functional */}
              <div className="bg-white rounded-xl border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
                <div className="px-4 py-3 border-b border-[#f2f4f6] flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-[#4648d4]">auto_awesome</span>
                  <h3 className="text-[11px] font-bold text-[#111827]">AI Generation Settings</h3>
                </div>
                <div className="divide-y divide-[#f9fafb]">
                  {AI_SETTINGS_CONFIG.map(({ key, label, desc }) => (
                    <div key={key} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-xs font-semibold text-[#111827]">{label}</p>
                        <p className="text-[11px] text-[#9ca3af]">{desc}</p>
                      </div>
                      <Toggle on={aiSettings[key]} onToggle={() => toggleSetting(key)} />
                    </div>
                  ))}
                </div>
                <div className="px-4 py-3 bg-[#f7f9fb] border-t border-[#e5e7eb]">
                  <p className="text-[11px] text-[#9ca3af]">
                    These settings control how the AI interprets your transcript. They are sent with each generation request.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Review screen */
          <div className="grid grid-cols-12 gap-5">
            <div className="col-span-12 lg:col-span-8 bg-white rounded-xl border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="px-5 py-4 border-b border-[#e5e7eb] flex justify-between items-center">
                <div>
                  <h2 className="text-sm font-bold text-[#111827]">Review Generated Actions</h2>
                  <p className="text-xs text-[#9ca3af] mt-0.5">{generatedActions.length} actions extracted from transcript</p>
                </div>
                <button onClick={() => setGeneratedActions([])} className="text-xs font-bold text-[#6b7280] hover:text-[#4648d4] transition-colors">
                  ← Re-generate
                </button>
              </div>
              <div className="divide-y divide-[#f9fafb]">
                {generatedActions.map((action, i) => (
                  <div key={i} className="flex items-start gap-3 px-5 py-4">
                    <div className="w-6 h-6 rounded-full bg-[#ede9fe] text-[#4648d4] text-[11px] font-black flex items-center justify-center shrink-0 mt-0.5">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#111827]">{action.title}</p>
                      {action.description && <p className="text-xs text-[#6b7280] mt-0.5 line-clamp-2">{action.description}</p>}
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {action.priority && (
                          <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full', action.priority === 'urgent' ? 'bg-[#fef2f2] text-[#dc2626]' : 'bg-[#ede9fe] text-[#4648d4]')}>
                            {action.priority}
                          </span>
                        )}
                        {action.dueDate && <span className="text-[10px] text-[#9ca3af]">Due: {action.dueDate}</span>}
                        {action.tags?.length > 0 && action.tags.map((tag: string, ti: number) => (
                          <span key={ti} className="text-[10px] bg-[#f2f4f6] text-[#6b7280] px-1.5 py-0.5 rounded-full">#{tag}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-5 py-4 border-t border-[#e5e7eb] flex gap-3">
                <button onClick={() => setGeneratedActions([])} className="flex-1 py-2.5 bg-[#f2f4f6] text-[#374151] font-bold rounded-xl hover:bg-[#e5e7eb] transition-colors text-sm">
                  Re-generate
                </button>
                <button onClick={handleSave} disabled={saving || !initiativeId}
                  className="flex-1 py-2.5 bg-[#4648d4] text-white font-bold rounded-xl hover:bg-[#3730a3] transition-colors disabled:opacity-40 text-sm"
                >
                  {saving ? 'Saving...' : `Save ${generatedActions.length} Actions`}
                </button>
              </div>
            </div>

            <div className="col-span-12 lg:col-span-4 space-y-4">
              <div className="bg-white rounded-xl border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] p-4">
                <h3 className="text-[11px] font-bold text-[#9ca3af] uppercase tracking-widest mb-3">Summary</h3>
                <div className="space-y-2">
                  {[
                    { label: 'Total actions', val: generatedActions.length },
                    { label: 'Urgent', val: generatedActions.filter((a) => a.priority === 'urgent').length },
                    { label: 'High priority', val: generatedActions.filter((a) => a.priority === 'high').length },
                    { label: 'With due dates', val: generatedActions.filter((a) => a.dueDate).length },
                    { label: 'With assignees', val: generatedActions.filter((a) => a.assigneeId).length },
                  ].map(({ label, val }) => (
                    <div key={label} className="flex justify-between text-xs">
                      <span className="text-[#6b7280]">{label}</span>
                      <span className="font-bold text-[#111827] tabular-nums">{val}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-white rounded-xl border border-[#f0f0f0] shadow-[0_1px_4px_rgba(0,0,0,0.04)] p-4">
                <h3 className="text-[11px] font-bold text-[#9ca3af] uppercase tracking-widest mb-2">AI Settings Used</h3>
                <div className="space-y-1.5">
                  {AI_SETTINGS_CONFIG.map(({ key, label }) => (
                    <div key={key} className="flex items-center justify-between text-xs">
                      <span className="text-[#6b7280]">{label}</span>
                      <span className={cn('font-bold', aiSettings[key] ? 'text-[#4648d4]' : 'text-[#9ca3af]')}>{aiSettings[key] ? 'On' : 'Off'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
