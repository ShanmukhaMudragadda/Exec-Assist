import { apiGet, apiPost } from '../client.js'
import { fmtActionTable, fmtInitiativeTable, fmtDate, daysUntil } from '../format.js'
import { resolveUser, resolveInitiative } from '../resolve.js'
import type { CommandCenterResponse, EltSummary, Initiative, Action } from '../types.js'

export const reportingToolSchemas = [
  {
    name: 'get_overdue_actions',
    description: 'List all overdue actions across the organization. Returns a table with assignee, priority, how many days overdue, and which initiative.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Max actions to return (default 50)' },
      },
    },
  },
  {
    name: 'get_user_actions',
    description: 'Get all open actions assigned to a specific person. Accepts a name or email (fuzzy match). Returns status, priority, due date.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        user: { type: 'string', description: 'Name or email of the person (fuzzy matched)' },
        status: { type: 'string', description: 'Filter by status: open, completed, overdue, in_progress' },
      },
      required: ['user'],
    },
  },
  {
    name: 'get_executive_summary',
    description: 'Full ELT-level dashboard summary: initiative health, action counts, overdue list, member workload, stale actions, priority distribution, on-time rate.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'get_executive_brief',
    description: 'Concise executive brief with top risks and highlights. Shorter than the full ELT summary.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'search_actions',
    description: 'Search actions by keyword. Returns matching actions with status, assignee, and due date.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search keyword' },
        status: { type: 'string', description: 'Filter by status' },
        priority: { type: 'string', description: 'Filter by priority: urgent, high, medium, low' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_action_detail',
    description: 'Get full details of a single action including description, comments/updates, tags, and history.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        action_id: { type: 'string', description: 'Action ID' },
      },
      required: ['action_id'],
    },
  },
  {
    name: 'list_initiatives',
    description: 'List all initiatives with status, priority, progress %, action count, and due date.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        status: { type: 'string', description: 'Filter by status: active, completed, paused, at_risk' },
      },
    },
  },
  {
    name: 'get_initiative_report',
    description: 'Detailed report for a single initiative: metadata + all its actions with status, assignees, due dates.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        initiative: { type: 'string', description: 'Initiative name (fuzzy matched) or ID' },
      },
      required: ['initiative'],
    },
  },
  {
    name: 'notify_overdue',
    description: 'Send an email to all assignees of overdue actions in an initiative, reminding them their actions are past due. Only works if you are the initiative owner or admin.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        initiative: { type: 'string', description: 'Initiative name (fuzzy matched) or ID' },
      },
      required: ['initiative'],
    },
  },
]

export async function handleReportingTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'get_overdue_actions': {
      const limit = (args.limit as number) ?? 50
      const data = await apiGet<CommandCenterResponse>('/command-center', { filter: 'overdue', limit })
      if (data.actions.length === 0) return '_No overdue actions. Great job!_'
      const lines = [
        `## Overdue Actions (${data.stats.overdue} total)\n`,
        fmtActionTable(data.actions.slice(0, limit)),
      ]
      return lines.join('\n')
    }

    case 'get_user_actions': {
      const resolved = await resolveUser(args.user as string)
      if ('error' in resolved) return resolved.error
      const params: Record<string, string | number | boolean> = { assigneeId: resolved.id }
      if (args.status) params.filter = args.status as string
      const data = await apiGet<CommandCenterResponse>('/command-center', params)
      if (data.actions.length === 0) return `_No actions found for **${resolved.name}**._`
      return `## Actions for ${resolved.name} (${data.stats.total} total)\n\n${fmtActionTable(data.actions)}`
    }

    case 'get_executive_summary': {
      const summary = await apiGet<EltSummary>('/elt/summary')
      const lines: string[] = []

      lines.push(`## Executive Summary\n`)
      lines.push(`**Actions:** ${summary.actionCounts.total} total | ${summary.actionCounts.open} open | ${summary.actionCounts.overdue} overdue | ${summary.actionCounts.completed} completed`)
      if (summary.onTimeRate != null) lines.push(`**On-time rate:** ${summary.onTimeRate.toFixed(1)}%`)
      if (summary.unassignedHighPriority) lines.push(`**Unassigned high-priority:** ${summary.unassignedHighPriority}`)
      if (summary.dueSoon) lines.push(`**Due within 7 days:** ${summary.dueSoon}`)

      lines.push(`\n### Initiative Health`)
      lines.push(fmtInitiativeTable(summary.initiatives.map(i => ({
        id: i.id, title: i.title, status: i.status, priority: i.priority,
        progress: i.progress, dueDate: i.dueDate, createdAt: '',
        _count: { actions: i.actionCount, members: i.memberCount },
      }))))

      if (summary.overdueActions.length) {
        lines.push(`\n### Top Overdue Actions`)
        lines.push(fmtActionTable(summary.overdueActions.slice(0, 10)))
      }

      if (summary.memberWorkload.length) {
        lines.push(`\n### Member Workload`)
        lines.push('| Name | Assigned | Open | Overdue | Completed | Stale |')
        lines.push('|------|----------|------|---------|-----------|-------|')
        for (const m of summary.memberWorkload) {
          lines.push(`| ${m.name} | ${m.assigned} | ${m.open} | ${m.overdue} | ${m.completed} | ${m.staleCount} |`)
        }
      }

      if (summary.staleActions.length) {
        lines.push(`\n### Stale Actions (no update in 14+ days)`)
        lines.push(fmtActionTable(summary.staleActions.slice(0, 10)))
      }

      return lines.join('\n')
    }

    case 'get_executive_brief': {
      const data = await apiGet<{ brief: string }>('/executive-brief')
      return data.brief ?? '_No brief available._'
    }

    case 'search_actions': {
      const params: Record<string, string | number | boolean> = { search: args.query as string }
      if (args.status) params.filter = args.status as string
      if (args.priority) params.priority = args.priority as string
      const limit = (args.limit as number) ?? 20
      const data = await apiGet<CommandCenterResponse>('/command-center', params)
      if (data.actions.length === 0) return `_No actions found matching "${args.query}"._`
      return `## Search: "${args.query}" (${data.stats.total} results)\n\n${fmtActionTable(data.actions.slice(0, limit))}`
    }

    case 'get_action_detail': {
      const action = await apiGet<Action>(`/actions/${args.action_id}`)
      const updates = await apiGet<{ updates: { id: string; content: string; createdAt: string; user: { name: string } }[] }>(`/actions/${args.action_id}/updates`).catch(() => ({ updates: [] }))
      const lines: string[] = [
        `## ${action.title}`,
        `**Status:** ${action.status} | **Priority:** ${action.priority} | **Due:** ${fmtDate(action.dueDate)} (${daysUntil(action.dueDate)})`,
        `**Assignees:** ${action.assignees.map(u => u.name).join(', ') || 'Unassigned'}`,
        `**Initiative:** ${action.initiative?.title ?? 'Standalone'}`,
      ]
      if (action.description) lines.push(`\n**Description:**\n${action.description}`)
      if (action.tags?.length) lines.push(`**Tags:** ${action.tags.map(t => t.name).join(', ')}`)
      if (updates.updates.length) {
        lines.push(`\n**Updates (${updates.updates.length}):**`)
        for (const u of updates.updates.slice(0, 5)) {
          lines.push(`- [${fmtDate(u.createdAt)}] **${u.user.name}**: ${u.content}`)
        }
      }
      return lines.join('\n')
    }

    case 'list_initiatives': {
      const params: Record<string, string> = {}
      if (args.status) params.status = args.status as string
      const data = await apiGet<{ initiatives: Initiative[] }>('/initiatives', params)
      return `## Initiatives (${data.initiatives.length})\n\n${fmtInitiativeTable(data.initiatives)}`
    }

    case 'get_initiative_report': {
      const name = args.initiative as string
      let initiativeId = name
      if (!name.match(/^[a-z0-9]{20,}$/i)) {
        const resolved = await resolveInitiative(name)
        if ('error' in resolved) return resolved.error
        initiativeId = resolved.id
      }
      const [init, actionsData] = await Promise.all([
        apiGet<Initiative>(`/initiatives/${initiativeId}`),
        apiGet<{ actions: Action[] }>(`/initiatives/${initiativeId}/actions`),
      ])
      const lines: string[] = [
        `## ${init.title}`,
        `**Status:** ${init.status} | **Priority:** ${init.priority} | **Progress:** ${init.progress}% | **Due:** ${fmtDate(init.dueDate)}`,
        `**Actions:** ${init._count?.actions ?? actionsData.actions.length} total`,
        `\n### Actions`,
        fmtActionTable(actionsData.actions),
      ]
      return lines.join('\n')
    }

    case 'notify_overdue': {
      const name = args.initiative as string
      let initiativeId = name
      if (!name.match(/^[a-z0-9]{20,}$/i)) {
        const resolved = await resolveInitiative(name)
        if ('error' in resolved) return resolved.error
        initiativeId = resolved.id
      }
      const result = await apiPost<{ notified: number; overdueCount: number; message?: string }>(
        `/initiatives/${initiativeId}/notify-overdue`
      )
      if (result.notified === 0) return result.message ?? 'No overdue actions found — no emails sent.'
      return `Sent overdue reminder emails to **${result.notified} assignee${result.notified > 1 ? 's' : ''}** covering **${result.overdueCount} overdue action${result.overdueCount > 1 ? 's' : ''}**.`
    }

    default:
      return `Unknown tool: ${name}`
  }
}
