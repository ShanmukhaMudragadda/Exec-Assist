import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { workspacesApi } from '@/services/api'

export default function HomeRedirect() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => workspacesApi.list().then((r) => r.data),
  })
  const workspaces: { id: string; name: string }[] =
    (data as { workspaces?: { id: string; name: string }[] })?.workspaces || []

  useEffect(() => {
    if (!isLoading && workspaces.length > 0) {
      navigate(`/workspace/${workspaces[0].id}`, { replace: true })
    }
  }, [isLoading, workspaces])

  const createMutation = useMutation({
    mutationFn: () => workspacesApi.create({ name: name.trim() }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
      const ws = (res.data as { workspace?: { id: string } })?.workspace || res.data as { id: string }
      navigate(`/workspace/${ws.id}`, { replace: true })
    },
  })

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // No workspaces — show create prompt
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      <div className="bg-card border rounded-2xl shadow-xl p-8 w-full max-w-md mx-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center mx-auto mb-4">
          <span className="text-white font-bold text-2xl">EA</span>
        </div>
        <h1 className="text-2xl font-bold mb-2">Welcome to EAssist</h1>
        <p className="text-muted-foreground mb-6">Create your first workspace to get started</p>
        <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) createMutation.mutate() }} className="space-y-3">
          <input
            autoFocus
            type="text"
            placeholder="e.g. My Team, Q2 Projects..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border rounded-lg px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            type="submit"
            disabled={!name.trim() || createMutation.isPending}
            className="w-full bg-primary text-primary-foreground rounded-lg py-2.5 text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Workspace'}
          </button>
        </form>
      </div>
    </div>
  )
}
