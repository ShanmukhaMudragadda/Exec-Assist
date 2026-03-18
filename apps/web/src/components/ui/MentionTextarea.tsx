import { useRef, useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface Member {
  id: string
  name: string
  email: string
}

interface Props {
  value: string
  onChange: (v: string) => void
  onSubmit?: () => void
  placeholder?: string
  className?: string
  members: Member[]
  minRows?: number
}

/** Returns the @word being typed just before the cursor, or null */
function getMentionQuery(value: string, cursor: number): string | null {
  const before = value.slice(0, cursor)
  const match = before.match(/@(\w*)$/)
  return match ? match[1] : null
}

export default function MentionTextarea({
  value, onChange, onSubmit, placeholder, className, members, minRows = 3,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [dropdownIndex, setDropdownIndex] = useState(0)

  const filtered = mentionQuery !== null
    ? members.filter((m) =>
        m.name.toLowerCase().replace(/\s+/g, '').startsWith(mentionQuery.toLowerCase()) ||
        m.name.toLowerCase().startsWith(mentionQuery.toLowerCase())
      ).slice(0, 6)
    : []

  useEffect(() => { setDropdownIndex(0) }, [mentionQuery])

  const insertMention = (member: Member) => {
    const el = ref.current
    if (!el) return
    const cursor = el.selectionStart ?? value.length
    const before = value.slice(0, cursor).replace(/@\w*$/, '')
    const after = value.slice(cursor)
    const slug = '@' + member.name.toLowerCase().replace(/\s+/g, '')
    const newVal = before + slug + ' ' + after
    onChange(newVal)
    setMentionQuery(null)
    // restore focus + cursor
    setTimeout(() => {
      el.focus()
      const pos = before.length + slug.length + 1
      el.setSelectionRange(pos, pos)
    }, 0)
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value)
    const query = getMentionQuery(e.target.value, e.target.selectionStart)
    setMentionQuery(query)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (filtered.length > 0 && mentionQuery !== null) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setDropdownIndex((i) => Math.min(i + 1, filtered.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setDropdownIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (filtered[dropdownIndex]) {
          e.preventDefault()
          insertMention(filtered[dropdownIndex])
          return
        }
      }
      if (e.key === 'Escape') {
        setMentionQuery(null)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSubmit?.()
    }
  }

  const handleClick = () => {
    const el = ref.current
    if (!el) return
    const query = getMentionQuery(el.value, el.selectionStart)
    setMentionQuery(query)
  }

  return (
    <div className="relative w-full">
      <textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onClick={handleClick}
        onBlur={() => setTimeout(() => setMentionQuery(null), 150)}
        placeholder={placeholder}
        rows={minRows}
        className={cn(
          'w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm',
          'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2',
          'focus-visible:ring-ring focus-visible:ring-offset-0',
          className
        )}
      />

      {/* Mention dropdown */}
      {filtered.length > 0 && mentionQuery !== null && (
        <div className="absolute bottom-full mb-1 left-0 w-56 rounded-lg border bg-popover shadow-lg z-50 py-1 overflow-hidden">
          <p className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            Mention member
          </p>
          {filtered.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); insertMention(m) }}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors',
                i === dropdownIndex ? 'bg-accent' : 'hover:bg-accent'
              )}
            >
              <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-[10px] font-semibold shrink-0">
                {m.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="font-medium truncate">{m.name}</div>
                <div className="text-xs text-muted-foreground truncate">{m.email}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
