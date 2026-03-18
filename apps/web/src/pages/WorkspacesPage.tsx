import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppLayout from '@/components/layout/AppLayout'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { workspacesApi } from '@/services/api'
import { toast } from '@/hooks/use-toast'
import { Plus, Settings, Users, FileText, ArrowRight, FolderKanban } from 'lucide-react'

interface Workspace {
  id: string
  name: string
  description?: string
  icon?: string
  createdAt: string
  _count?: { members: number; tasks: number }
}

export default function WorkspacesPage() {
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => workspacesApi.list().then((r) => r.data),
  })

  const workspaces: Workspace[] = data?.workspaces || data || []

  const createMutation = useMutation({
    mutationFn: (d: { name: string; description?: string }) => workspacesApi.create(d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
      setCreateOpen(false)
      setName('')
      setDescription('')
      toast({ title: 'Workspace created!', description: 'Your new workspace is ready.' })
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { error?: string } } }
      toast({ title: 'Error', description: error.response?.data?.error || 'Failed to create workspace', variant: 'destructive' })
    },
  })

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    createMutation.mutate({ name: name.trim(), description: description.trim() || undefined })
  }

  return (
    <AppLayout>
      <div className="p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Workspaces</h1>
            <p className="text-muted-foreground mt-1">Manage your team workspaces</p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            New Workspace
          </Button>
        </div>

        {/* Workspace Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6">
                  <div className="h-10 w-10 bg-muted rounded-lg mb-4" />
                  <div className="h-5 bg-muted rounded w-3/4 mb-2" />
                  <div className="h-4 bg-muted rounded w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : workspaces.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 bg-muted rounded-2xl flex items-center justify-center mb-6">
              <FolderKanban className="w-10 h-10 text-muted-foreground opacity-50" />
            </div>
            <h2 className="text-xl font-semibold mb-2">No workspaces yet</h2>
            <p className="text-muted-foreground mb-6 max-w-sm">
              Create your first workspace to start organizing tasks and collaborating with your team.
            </p>
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Create Workspace
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workspaces.map((ws) => (
              <Card key={ws.id} className="hover:shadow-md transition-all group">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold text-lg">
                      {ws.icon || ws.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Link to={`/workspace/${ws.id}/settings`}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Settings className="w-4 h-4" />
                        </Button>
                      </Link>
                    </div>
                  </div>

                  <h3 className="font-semibold text-lg mb-1">{ws.name}</h3>
                  {ws.description && (
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{ws.description}</p>
                  )}

                  <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
                    <div className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      <span>{ws._count?.members ?? 0} members</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5" />
                      <span>{ws._count?.tasks ?? 0} tasks</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Link to={`/workspace/${ws.id}`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full gap-1 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                        Open Board
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    </Link>
                    <Link to={`/workspace/${ws.id}/transcripts`}>
                      <Button variant="ghost" size="sm" className="gap-1">
                        <FileText className="w-3.5 h-3.5" />
                        Transcripts
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Workspace Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Workspace</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ws-name">Workspace Name</Label>
              <Input
                id="ws-name"
                placeholder="e.g., Engineering, Marketing, Q1 2026"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ws-desc">Description (optional)</Label>
              <Textarea
                id="ws-desc"
                placeholder="What is this workspace for?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create Workspace'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  )
}
