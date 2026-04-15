import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
import { io } from '../index'

interface BulkUpdateActionData {
  status?: string;
  assigneeIds?: string[];
  dueDate?: Date | null;
  initiativeId?: string | null;
}

export async function bulkUpdateActions(actionIds: string[], data: BulkUpdateActionData) {
  try {
    const { assigneeIds, ...scalarData } = data
    const updatedActions = await prisma.$transaction(async (tx) => {
      const updates = actionIds.map((id) =>
        tx.action.update({
          where: { id },
          data: {
            ...scalarData,
            // Ensure dueDate is correctly handled as null if provided as an empty string or invalid date
            dueDate: scalarData.dueDate === null ? null : (scalarData.dueDate ? new Date(scalarData.dueDate) : undefined),
            ...(assigneeIds !== undefined && {
              assignees: {
                deleteMany: {},
                create: assigneeIds.map((uid) => ({ userId: uid })),
              },
            }),
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
