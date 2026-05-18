import { apiGet, apiPost } from '../client.js'
import { fmtInitiativeTable } from '../format.js'
import { clearCache } from '../resolve.js'
import type { Initiative, Member } from '../types.js'

export const initiativeToolSchemas = [
  {
    name: 'create_initiative',
    description: 'Create a new initiative.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Initiative title' },
        description: { type: 'string', description: 'Optional description' },
        priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low'], description: 'Priority (default: medium)' },
        due_date: { type: 'string', description: 'Due date in ISO format (e.g. 2025-12-31)' },
      },
      required: ['title'],
    },
  },
  {
    name: 'list_members',
    description: 'List all members across all initiatives. Useful to look up names and emails before assigning actions.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
]

export async function handleInitiativeTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'create_initiative': {
      const body: Record<string, unknown> = {
        title: args.title,
        description: args.description ?? null,
        priority: args.priority ?? 'medium',
        dueDate: args.due_date ?? null,
      }
      const init = await apiPost<Initiative>('/initiatives', body)
      clearCache()
      return `Initiative created: **${init.title}** (ID: ${init.id})`
    }

    case 'list_members': {
      const data = await apiGet<{ initiatives: Initiative[] }>('/initiatives')
      const seen = new Set<string>()
      const members: { id: string; name: string; email: string; department: string | null }[] = []

      for (const init of data.initiatives) {
        try {
          const m = await apiGet<{ members: Member[] }>(`/initiatives/${init.id}/members`)
          for (const member of m.members) {
            if (!seen.has(member.user.id)) {
              seen.add(member.user.id)
              members.push({
                id: member.user.id,
                name: member.user.name,
                email: member.user.email,
                department: member.department,
              })
            }
          }
        } catch { /* skip inaccessible */ }
      }

      if (members.length === 0) return '_No members found._'

      const header = '| Name | Email | Department |'
      const sep    = '|------|-------|------------|'
      const rows = members.map(m => `| ${m.name} | ${m.email} | ${m.department ?? '—'} |`)
      return `## Members (${members.length})\n\n${[header, sep, ...rows].join('\n')}`
    }

    default:
      return `Unknown tool: ${name}`
  }
}
