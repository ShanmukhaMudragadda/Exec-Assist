import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
import { io } from '../index'

interface BulkUpdateActionData {
  status?: string;
  assigneeId?: string;
  dueDate?: Date | null;
  initiativeId?: string | null;
}

export async function bulkUpdateActions(actionIds: string[], data: BulkUpdateActionData) {
  try {
    const updatedActions = await prisma.$transaction(async (tx) => {
      const updates = actionIds.map((id) =>
        tx.action.update({
          where: { id },
          data: {
            ...data,
            // Ensure dueDate is correctly handled as null if provided as an empty string or invalid date
            dueDate: data.dueDate === null ? null : (data.dueDate ? new Date(data.dueDate) : undefined),
          },
        })
      )
      return Promise.all(updates)
    })

    // Emit Socket.io event for updated actions
    io.emit('actions:bulk-updated', updatedActions.map((action) => action.id))

    return updatedActions
  } catch (error) {
    console.error('Error in bulkUpdateActions:', error)
    throw new Error('Failed to bulk update actions')
  }
}
