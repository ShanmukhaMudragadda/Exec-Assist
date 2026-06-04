import { apiGet, apiPost, apiPatch, apiDelete } from '../client.js'
import { fmtAction, fmtActionTable } from '../format.js'
import { resolveUser, resolveInitiative, clearCache } from '../resolve.js'
import type { Action } from '../types.js'

export const actionToolSchemas = [
  {
    name: 'create_action',
    description: 'Create a new action. Can be linked to an initiative or standalone. Assignees are resolved by name/email.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Action title' },
        description: { type: 'string', description: 'Optional description' },
        initiative: { type: 'string', description: 'Initiative name or ID to link this action to (optional)' },
        assignees: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of assignee names or emails (fuzzy matched)',
        },
        priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low'], description: 'Priority (default: medium)' },
        due_date: { type: 'string', description: 'Due date in ISO format (e.g. 2025-06-01)' },
      },
      required: ['title'],
    },
  },
  {
    name: 'update_action',
    description: 'Update an existing action — change title, description, status, priority, due date, or assignees.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        action_id: { type: 'string', description: 'Action ID' },
        title: { type: 'string' },
        description: { type: 'string' },
        status: { type: 'string', description: 'open, in_progress, completed, cancelled' },
        priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low'] },
        due_date: { type: 'string', description: 'ISO date string' },
        assignees: { type: 'array', items: { type: 'string' }, description: 'New list of assignees (replaces existing)' },
      },
      required: ['action_id'],
    },
  },
  {
    name: 'complete_action',
    description: 'Mark an action as completed.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        action_id: { type: 'string', description: 'Action ID to mark complete' },
      },
      required: ['action_id'],
    },
  },
  {
    name: 'assign_action',
    description: 'Assign (or reassign) an action to one or more people by name or email.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        action_id: { type: 'string', description: 'Action ID' },
        assignees: {
          type: 'array',
          items: { type: 'string' },
          description: 'Names or emails of assignees (fuzzy matched)',
        },
      },
      required: ['action_id', 'assignees'],
    },
  },
  {
    name: 'delete_action',
    description: 'Delete an action permanently. Use with care.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        action_id: { type: 'string', description: 'Action ID to delete' },
      },
      required: ['action_id'],
    },
  },
  {
    name: 'bulk_update_actions',
    description: 'Update status or assignees on multiple actions at once.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        action_ids: { type: 'array', items: { type: 'string' }, description: 'List of action IDs' },
        status: { type: 'string', description: 'New status for all actions' },
        priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low'] },
        assignees: { type: 'array', items: { type: 'string' }, description: 'New assignees (replaces existing on all)' },
      },
      required: ['action_ids'],
    },
  },
  {
    name: 'add_comment',
    description: 'Add a comment/update to an action.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        action_id: { type: 'string', description: 'Action ID' },
        content: { type: 'string', description: 'Comment text' },
      },
      required: ['action_id', 'content'],
    },
  },
]

async function resolveAssignees(names: string[]): Promise<{ ids: string[]; errors: string[] }> {
  const ids: string[] = []
  const errors: string[] = []
  for (const name of names) {
    const r = await resolveUser(name)
    if ('error' in r) errors.push(r.error)
    else ids.push(r.id)
  }
  return { ids, errors }
}

export async function handleActionTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'create_action': {
      let initiativeId: string | undefined
      if (args.initiative) {
        const resolved = await resolveInitiative(args.initiative as string)
        if ('error' in resolved) return resolved.error
        initiativeId = resolved.id
      }

      const assigneeIds: string[] = []
      if (Array.isArray(args.assignees) && args.assignees.length) {
        const { ids, errors } = await resolveAssignees(args.assignees as string[])
        if (errors.length) return errors.join('\n')
        assigneeIds.push(...ids)
      }

      const body: Record<string, unknown> = {
        title: args.title,
        description: args.description ?? null,
        priority: args.priority ?? 'medium',
        dueDate: args.due_date ?? null,
        assigneeIds,
      }

      const url = initiativeId ? `/initiatives/${initiativeId}/actions` : '/actions'
      const { action } = await apiPost<{ action: Action }>(url, body)
      clearCache()
      return `Action created successfully.\n\n${fmtAction(action)}`
    }

    case 'update_action': {
      const body: Record<string, unknown> = {}
      if (args.title !== undefined) body.title = args.title
      if (args.description !== undefined) body.description = args.description
      if (args.status !== undefined) body.status = args.status
      if (args.priority !== undefined) body.priority = args.priority
      if (args.due_date !== undefined) body.dueDate = args.due_date

      if (Array.isArray(args.assignees) && args.assignees.length) {
        const { ids, errors } = await resolveAssignees(args.assignees as string[])
        if (errors.length) return errors.join('\n')
        body.assigneeIds = ids
      }

      const { action } = await apiPatch<{ action: Action }>(`/actions/${args.action_id}`, body)
      return `Action updated.\n\n${fmtAction(action)}`
    }

    case 'complete_action': {
      const { action } = await apiPatch<{ action: Action }>(`/actions/${args.action_id}`, { status: 'completed' })
      return `Marked as completed: **${action.title}**`
    }

    case 'assign_action': {
      const { ids, errors } = await resolveAssignees(args.assignees as string[])
      if (errors.length) return errors.join('\n')
      const { action } = await apiPatch<{ action: Action }>(`/actions/${args.action_id}`, { assigneeIds: ids })
      return `Assigned **${action.title}** to ${action.assignees?.map(u => u.name).join(', ') || 'assignees'}.`
    }

    case 'delete_action': {
      await apiDelete(`/actions/${args.action_id}`)
      return `Action ${args.action_id} deleted.`
    }

    case 'bulk_update_actions': {
      const ids = args.action_ids as string[]
      const body: Record<string, unknown> = { actionIds: ids }
      if (args.status) body.status = args.status
      if (args.priority) body.priority = args.priority

      if (Array.isArray(args.assignees) && args.assignees.length) {
        const { ids: assigneeIds, errors } = await resolveAssignees(args.assignees as string[])
        if (errors.length) return errors.join('\n')
        body.assigneeIds = assigneeIds
      }

      const result = await apiPatch<{ updated: number; actions: Action[] }>('/actions/bulk', body)
      return `Updated ${result.updated ?? ids.length} actions.\n\n${fmtActionTable(result.actions ?? [])}`
    }

    case 'add_comment': {
      await apiPost(`/actions/${args.action_id}/updates`, { content: args.content })
      return `Comment added to action ${args.action_id}.`
    }

    default:
      return `Unknown tool: ${name}`
  }
}
