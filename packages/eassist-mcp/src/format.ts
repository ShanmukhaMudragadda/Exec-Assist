import type { Action, Initiative } from './types.js'

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
}

export function daysOverdue(dueDate: string | null): number {
  if (!dueDate) return 0
  return Math.max(0, Math.floor((Date.now() - new Date(dueDate).getTime()) / 86_400_000))
}

export function daysUntil(dueDate: string | null): string {
  if (!dueDate) return '—'
  const d = Math.floor((new Date(dueDate).getTime() - Date.now()) / 86_400_000)
  if (d < 0) return `${Math.abs(d)}d overdue`
  if (d === 0) return 'today'
  return `in ${d}d`
}

export function fmtAction(a: Action, idx?: number): string {
  const num = idx != null ? `${idx + 1}. ` : ''
  const assignees = a.assignees.map(u => u.name).join(', ') || 'Unassigned'
  const due = a.dueDate ? ` | Due: ${fmtDate(a.dueDate)} (${daysUntil(a.dueDate)})` : ''
  const init = a.initiative ? ` | ${a.initiative.title}` : ''
  return `${num}**${a.title}**\n   Status: ${a.status} | Priority: ${a.priority} | Assignee: ${assignees}${due}${init}`
}

export function fmtActionTable(actions: Action[], extraCol?: (a: Action) => string, extraHeader?: string): string {
  if (actions.length === 0) return '_No actions found._'

  const header = `| # | Title | Initiative | Assignee | Priority | Due | Status${extraHeader ? ` | ${extraHeader}` : ''} |`
  const sep    = `|---|-------|-----------|----------|----------|-----|--------${extraHeader ? '|------' : ''}|`
  const rows = actions.map((a, i) => {
    const assignee = a.assignees.map(u => u.name).join(', ') || 'Unassigned'
    const init = a.initiative?.title ?? 'Standalone'
    const extra = extraCol ? ` | ${extraCol(a)}` : ''
    return `| ${i + 1} | ${a.title} | ${init} | ${assignee} | ${a.priority} | ${fmtDate(a.dueDate)} | ${a.status}${extra} |`
  })

  return [header, sep, ...rows].join('\n')
}

export function fmtInitiativeTable(initiatives: Initiative[]): string {
  if (initiatives.length === 0) return '_No initiatives found._'
  const header = '| # | Title | Status | Priority | Progress | Actions | Due |'
  const sep    = '|---|-------|--------|----------|----------|---------|-----|'
  const rows = initiatives.map((i, idx) => {
    const count = i._count?.actions ?? '?'
    return `| ${idx + 1} | ${i.title} | ${i.status} | ${i.priority} | ${i.progress}% | ${count} | ${fmtDate(i.dueDate)} |`
  })
  return [header, sep, ...rows].join('\n')
}
