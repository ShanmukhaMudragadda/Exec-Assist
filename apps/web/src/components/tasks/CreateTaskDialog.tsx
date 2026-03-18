import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { tasksApi, workspacesApi } from '@/services/api'
import { toast } from '@/hooks/use-toast'
import { X, Plus } from 'lucide-react'

interface Member {
  id: string
  name: string
  email: string
}

interface CreateTaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  defaultStatus?: string
}

export default function CreateTaskDialog({ open, onOpenChange, workspaceId, defaultStatus = 'todo' }: CreateTaskDialogProps) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState(defaultStatus)
  const [priority, setPriority] = useState('medium')
  const [category, setCategory] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([])

  const { data: membersData } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => workspacesApi.getMembers(workspaceId).then((r) => r.data),
    enabled: open,
  })

  const members: Member[] = membersData?.members?.map((m: { user: Member }) => m.user) || membersData || []

  const createMutation = useMutation({
    mutationFn: () =>
      tasksApi.create(workspaceId, {
        title: title.trim(),
        description: description.trim() || undefined,
        status,
        priority,
        category: category.trim() || undefined,
        tags,
        dueDate: dueDate || null,
        assigneeIds: selectedAssignees,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', workspaceId] })
      toast({ title: 'Task created!', description: `"${title}" has been added.` })
      handleClose()
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { error?: string } } }
      toast({ title: 'Error', description: error.response?.data?.error || 'Failed to create task', variant: 'destructive' })
    },
  })

  const handleClose = () => {
    setTitle('')
    setDescription('')
    setStatus(defaultStatus)
    setPriority('medium')
    setCategory('')
    setDueDate('')
    setTagInput('')
    setTags([])
    setSelectedAssignees([])
    onOpenChange(false)
  }

  const addTag = () => {
    const t = tagInput.trim()
    if (t && !tags.includes(t)) {
      setTags([...tags, t])
    }
    setTagInput('')
  }

  const removeTag = (tag: string) => setTags(tags.filter((t) => t !== tag))

  const toggleAssignee = (userId: string) => {
    setSelectedAssignees((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    )
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    createMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Task</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="task-title">Title *</Label>
            <Input
              id="task-title"
              placeholder="What needs to be done?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="task-desc">Description</Label>
            <Textarea
              id="task-desc"
              placeholder="Add more details..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          {/* Status & Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
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
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Category & Due Date */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="task-category">Category</Label>
              <Input
                id="task-category"
                placeholder="e.g., Frontend, Backend"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-due">Due Date</Label>
              <Input
                id="task-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Add tag..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); addTag() }
                }}
              />
              <Button type="button" variant="outline" size="icon" onClick={addTag}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {tags.map((tag) => (
                  <span key={tag} className="flex items-center gap-1 bg-secondary text-secondary-foreground text-xs px-2 py-1 rounded-full">
                    {tag}
                    <button type="button" onClick={() => removeTag(tag)} className="hover:text-destructive">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Assignees */}
          {members.length > 0 && (
            <div className="space-y-2">
              <Label>Assignees</Label>
              <div className="border rounded-md p-2 space-y-1 max-h-32 overflow-y-auto">
                {members.map((member) => (
                  <label key={member.id} className="flex items-center gap-2 cursor-pointer hover:bg-accent rounded p-1">
                    <input
                      type="checkbox"
                      checked={selectedAssignees.includes(member.id)}
                      onChange={() => toggleAssignee(member.id)}
                      className="rounded"
                    />
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-[10px] font-semibold">
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm">{member.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending || !title.trim()}>
              {createMutation.isPending ? 'Creating...' : 'Create Task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
