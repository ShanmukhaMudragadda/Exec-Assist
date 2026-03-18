import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { workspacesApi } from '@/services/api'
import { cn } from '@/lib/utils'
import {
  User, LogOut, Settings, FileText, FolderPlus,
  ChevronDown, Check, LayoutDashboard,
} from 'lucide-react'

interface AppLayoutProps {
  children: React.ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const { id: currentWorkspaceId } = useParams<{ id?: string }>()
  const [profileOpen, setProfileOpen] = useState(false)
  const [wsOpen, setWsOpen] = useState(false)
  const [createWsOpen, setCreateWsOpen] = useState(false)
  const [newWsName, setNewWsName] = useState('')
  const [creating, setCreating] = useState(false)

  const { data: workspacesData } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => workspacesApi.list().then((r) => r.data),
  })
  const workspaces: { id: string; name: string }[] =
    (workspacesData as { workspaces?: { id: string; name: string }[] })?.workspaces || []
  const currentWs = workspaces.find((w) => w.id === currentWorkspaceId) || workspaces[0]

  const handleLogout = () => {
    logout()
    navigate('/auth/login')
  }

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newWsName.trim()) return
    setCreating(true)
    try {
      const res = await workspacesApi.create({ name: newWsName.trim() })
      const ws = (res.data as { workspace?: { id: string } })?.workspace || res.data as { id: string }
      navigate(`/workspace/${ws.id}`)
      setCreateWsOpen(false)
      setNewWsName('')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Minimal header */}
      <header className="sticky top-0 z-40 w-full border-b bg-card shadow-sm h-14 flex items-center px-4 justify-between gap-4">

        {/* Left: logo + workspace switcher */}
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
              <span className="text-white font-bold text-xs">EA</span>
            </div>
            <span className="font-bold text-sm bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent hidden sm:block">
              EAssist
            </span>
          </Link>

          {workspaces.length > 0 && (
            <div className="relative">
              <button
                onClick={() => { setWsOpen((v) => !v); setProfileOpen(false) }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-background hover:bg-accent transition-colors text-sm font-medium max-w-[200px]"
              >
                <div className="w-5 h-5 rounded bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                  {currentWs?.name?.charAt(0).toUpperCase() || '?'}
                </div>
                <span className="truncate">{currentWs?.name || 'Select workspace'}</span>
                <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform', wsOpen && 'rotate-180')} />
              </button>

              {wsOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setWsOpen(false)} />
                  <div className="absolute left-0 mt-1 w-56 rounded-lg border bg-popover shadow-lg z-20 py-1 overflow-hidden">
                    <p className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Workspaces</p>
                    {workspaces.map((ws) => (
                      <button
                        key={ws.id}
                        onClick={() => { navigate(`/workspace/${ws.id}`); setWsOpen(false) }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
                      >
                        <div className="w-6 h-6 rounded bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                          {ws.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="flex-1 truncate">{ws.name}</span>
                        {ws.id === currentWorkspaceId && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                      </button>
                    ))}
                    <div className="border-t mt-1 pt-1">
                      <button
                        onClick={() => { setWsOpen(false); setCreateWsOpen(true) }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors text-left text-muted-foreground"
                      >
                        <FolderPlus className="w-4 h-4" /> Create new workspace
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Right: profile */}
        <div className="relative shrink-0">
          <button
            onClick={() => { setProfileOpen((v) => !v); setWsOpen(false) }}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-accent transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-semibold">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <span className="text-sm font-medium max-w-[120px] truncate hidden sm:block">{user?.name}</span>
            <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform hidden sm:block', profileOpen && 'rotate-180')} />
          </button>

          {profileOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setProfileOpen(false)} />
              <div className="absolute right-0 mt-1 w-56 rounded-lg border bg-popover shadow-lg z-20 py-1 overflow-hidden">
                <div className="px-3 py-2.5 border-b">
                  <p className="text-sm font-semibold truncate">{user?.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                </div>

                <Link to="/profile" onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent transition-colors">
                  <User className="w-4 h-4" /> Profile Settings
                </Link>

                {currentWorkspaceId && <>
                  <div className="border-t my-1" />
                  <Link to={`/workspace/${currentWorkspaceId}/settings`} onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent transition-colors">
                    <Settings className="w-4 h-4" /> Workspace Settings
                  </Link>
                  <Link to={`/workspace/${currentWorkspaceId}/transcripts`} onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent transition-colors">
                    <FileText className="w-4 h-4" /> Transcripts
                  </Link>
                </>}

                <div className="border-t my-1" />
                <button onClick={() => { setProfileOpen(false); setCreateWsOpen(true) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent transition-colors text-left">
                  <FolderPlus className="w-4 h-4" /> New Workspace
                </button>
                {workspaces.length > 1 && (
                  <button onClick={() => { setProfileOpen(false); navigate('/workspaces') }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent transition-colors text-left">
                    <LayoutDashboard className="w-4 h-4" /> All Workspaces
                  </button>
                )}

                <div className="border-t my-1" />
                <button onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-destructive hover:bg-accent transition-colors">
                  <LogOut className="w-4 h-4" /> Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      {/* Create workspace inline modal */}
      {createWsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card rounded-xl border shadow-xl p-6 w-full max-w-sm mx-4">
            <h2 className="text-lg font-bold mb-4">Create Workspace</h2>
            <form onSubmit={handleCreateWorkspace} className="space-y-4">
              <input autoFocus type="text" placeholder="Workspace name" value={newWsName}
                onChange={(e) => setNewWsName(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setCreateWsOpen(false)}
                  className="px-4 py-2 text-sm rounded-lg border hover:bg-accent transition-colors">Cancel</button>
                <button type="submit" disabled={creating || !newWsName.trim()}
                  className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <main className="flex-1">{children}</main>
    </div>
  )
}
