import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppLayout from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { workspacesApi } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/hooks/use-toast'
import {
  ArrowLeft, Trash2, UserPlus, Shield, Crown, User,
  Bell, Clock, Settings, Users, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface WorkspaceMember {
  id: string
  userId: string
  role: string
  profile?: string
  user: {
    id: string
    name: string
    email: string
    avatar?: string | null
  }
}

type Section = 'general' | 'members' | 'invite' | 'notifications' | 'daily-report'

const DEPARTMENTS = ['Sales', 'Engineering', 'Pre-Sales', 'Delivery', 'Product']

export default function WorkspaceSettingsPage() {
  const { id: workspaceId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()

  const [activeSection, setActiveSection] = useState<Section>('general')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('member')
  const [inviteProfile, setInviteProfile] = useState('none')
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [isEditingInfo, setIsEditingInfo] = useState(false)

  // ── Workspace query ─────────────────────────────────────────────────────────
  const { data: workspaceData } = useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: () => workspacesApi.get(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  })

  const workspace = workspaceData?.workspace || workspaceData

  useEffect(() => {
    if (workspace) {
      setEditName(workspace.name || '')
      setEditDesc(workspace.description || '')
    }
  }, [workspace?.id])

  // ── Members query ───────────────────────────────────────────────────────────
  const { data: membersData } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => workspacesApi.getMembers(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  })

  const members: WorkspaceMember[] = membersData?.members || membersData || []
  const myMember = members.find((m) => m.user?.id === user?.id || m.userId === user?.id)
  const myRole = myMember?.role
  const isOwner = myRole === 'owner'
  const isOwnerOrAdmin = myRole === 'owner' || myRole === 'admin'

  // ── Email settings query ────────────────────────────────────────────────────
  const { data: emailSettingsData, isLoading: emailSettingsLoading } = useQuery({
    queryKey: ['workspace-email-settings', workspaceId],
    queryFn: () =>
      (workspacesApi as any).getEmailSettings(workspaceId!).then((r: any) => r.data.settings),
    enabled: !!workspaceId && isOwnerOrAdmin,
  })
  const emailSettings = emailSettingsData as
    | (Record<string, boolean> & { dailyReportEnabled?: boolean; dailyReportTime?: string })
    | undefined

  // ── Mutations ───────────────────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: (data: { name: string; description?: string }) =>
      workspacesApi.update(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] })
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
      setIsEditingInfo(false)
      toast({ title: 'Workspace updated!' })
    },
    onError: () =>
      toast({ title: 'Error', description: 'Failed to update workspace', variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: () => workspacesApi.delete(workspaceId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
      toast({ title: 'Workspace deleted' })
      navigate('/workspaces')
    },
    onError: () =>
      toast({ title: 'Error', description: 'Failed to delete workspace', variant: 'destructive' }),
  })

  const inviteMutation = useMutation({
    mutationFn: () =>
      workspacesApi.sendInvitation(workspaceId!, {
        email: inviteEmail.trim(),
        role: inviteRole,
        ...(inviteProfile && inviteProfile !== 'none' ? { profile: inviteProfile } : {}),
      }),
    onSuccess: () => {
      setInviteEmail('')
      setInviteRole('member')
      setInviteProfile('none')
      toast({ title: 'Invitation sent!', description: `Invite sent to ${inviteEmail}` })
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { error?: string } } }
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to send invitation',
        variant: 'destructive',
      })
    },
  })

  const updateMemberMutation = useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: { role?: string; profile?: string } }) =>
      (workspacesApi as any).updateMember(workspaceId!, userId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-members', workspaceId] })
      toast({ title: 'Member updated!' })
    },
    onError: () =>
      toast({ title: 'Error', description: 'Failed to update member', variant: 'destructive' }),
  })

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => workspacesApi.removeMember(workspaceId!, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-members', workspaceId] })
      toast({ title: 'Member removed' })
    },
    onError: () =>
      toast({ title: 'Error', description: 'Failed to remove member', variant: 'destructive' }),
  })

  const updateEmailSettingsMutation = useMutation({
    mutationFn: (data: Record<string, boolean | string>) =>
      (workspacesApi as any).updateEmailSettings(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-email-settings', workspaceId] })
      toast({ title: 'Email settings updated!' })
    },
    onError: () =>
      toast({
        title: 'Error',
        description: 'Failed to update email settings',
        variant: 'destructive',
      }),
  })

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const getRoleIcon = (role: string) => {
    if (role === 'owner') return <Crown className="w-3.5 h-3.5 text-yellow-500" />
    if (role === 'admin') return <Shield className="w-3.5 h-3.5 text-blue-500" />
    return <User className="w-3.5 h-3.5 text-muted-foreground" />
  }

  const getRoleBadge = (role: string) => {
    const map: Record<string, string> = {
      owner: 'bg-yellow-100 text-yellow-700',
      admin: 'bg-blue-100 text-blue-700',
      member: 'bg-gray-100 text-gray-700',
    }
    return map[role] || map.member
  }

  const navItems: { key: Section; label: string; icon: React.ReactNode; ownerOnly?: boolean }[] = [
    { key: 'general', label: 'General', icon: <Settings className="w-4 h-4" /> },
    { key: 'members', label: 'Members & Roles', icon: <Users className="w-4 h-4" /> },
    ...(isOwnerOrAdmin
      ? [
          { key: 'invite' as Section, label: 'Invite Member', icon: <UserPlus className="w-4 h-4" /> },
          { key: 'notifications' as Section, label: 'Notifications', icon: <Bell className="w-4 h-4" /> },
        ]
      : []),
    ...(isOwner
      ? [{ key: 'daily-report' as Section, label: 'Daily Report', icon: <Clock className="w-4 h-4" />, ownerOnly: true }]
      : []),
  ]

  // ── Sections ─────────────────────────────────────────────────────────────────

  const SectionGeneral = (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">General</h2>
        <p className="text-sm text-muted-foreground">Update your workspace name and description.</p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          {isEditingInfo ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (!editName.trim()) return
                updateMutation.mutate({ name: editName.trim(), description: editDesc.trim() || undefined })
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>Workspace Name</Label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Workspace name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Describe your workspace..."
                  rows={3}
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setIsEditingInfo(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Name</p>
                <p className="font-medium">{workspace?.name}</p>
              </div>
              {workspace?.description && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Description</p>
                  <p className="text-sm">{workspace.description}</p>
                </div>
              )}
              {isOwnerOrAdmin && (
                <Button size="sm" variant="outline" onClick={() => setIsEditingInfo(true)}>
                  Edit
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {isOwner && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-base text-destructive">Danger Zone</CardTitle>
            <CardDescription>Irreversible actions for this workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg">
              <div>
                <p className="font-medium text-sm">Delete Workspace</p>
                <p className="text-xs text-muted-foreground">
                  Permanently delete this workspace and all its data.
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                className="gap-2"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  if (confirm(`Are you sure you want to delete "${workspace?.name}"? This cannot be undone.`)) {
                    deleteMutation.mutate()
                  }
                }}
              >
                <Trash2 className="w-4 h-4" />
                {deleteMutation.isPending ? 'Deleting...' : 'Delete Workspace'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )

  const SectionMembers = (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Members & Roles</h2>
        <p className="text-sm text-muted-foreground">
          Manage workspace members, their roles, and departments.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No members found.</p>
          ) : (
            members.map((member) => {
              const memberId = member.user?.id || member.userId
              return (
                <div key={member.id || memberId} className="flex items-start gap-3 py-2 border-b last:border-0">
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-sm font-semibold shrink-0">
                    {member.user.name.charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <p className="text-sm font-medium">{member.user.name}</p>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium inline-flex items-center gap-1 ${getRoleBadge(member.role)}`}
                      >
                        {getRoleIcon(member.role)}
                        {member.role}
                      </span>
                      {member.profile && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-purple-100 text-purple-700">
                          {member.profile}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{member.user.email}</p>
                  </div>

                  {/* Edit controls (owner/admin only, not for owner) */}
                  {isOwnerOrAdmin && memberId !== user?.id && member.role !== 'owner' && (
                    <div className="flex items-center gap-2 shrink-0 pt-0.5">
                      {/* Role select */}
                      <Select
                        value={member.role}
                        onValueChange={(role) =>
                          updateMemberMutation.mutate({ userId: memberId, data: { role } })
                        }
                      >
                        <SelectTrigger className="h-7 w-24 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="member">Member</SelectItem>
                        </SelectContent>
                      </Select>

                      {/* Department select */}
                      <Select
                        value={member.profile || 'none'}
                        onValueChange={(profile) =>
                          updateMemberMutation.mutate({
                            userId: memberId,
                            data: { profile: profile === 'none' ? '' : profile },
                          })
                        }
                      >
                        <SelectTrigger className="h-7 w-32 text-xs">
                          <SelectValue placeholder="Department" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No Dept.</SelectItem>
                          {DEPARTMENTS.map((d) => (
                            <SelectItem key={d} value={d}>{d}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* Remove */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          if (confirm(`Remove ${member.user.name} from workspace?`)) {
                            removeMemberMutation.mutate(memberId)
                          }
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
    </div>
  )

  const SectionInvite = (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Invite Member</h2>
        <p className="text-sm text-muted-foreground">
          Send an email invitation to add someone to this workspace.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!inviteEmail.trim()) return
              inviteMutation.mutate()
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Email Address</Label>
              <Input
                type="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="member">Member</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Department</Label>
                <Select value={inviteProfile} onValueChange={setInviteProfile}>
                  <SelectTrigger>
                    <SelectValue placeholder="Department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {DEPARTMENTS.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button type="submit" disabled={inviteMutation.isPending} className="gap-2 w-full">
              <UserPlus className="w-4 h-4" />
              {inviteMutation.isPending ? 'Sending...' : 'Send Invitation'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )

  const SectionNotifications = (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Email Notifications</h2>
        <p className="text-sm text-muted-foreground">
          Choose which events send email notifications to workspace members.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          {emailSettingsLoading ? (
            <div className="text-sm text-muted-foreground py-4">Loading...</div>
          ) : (
            <div className="space-y-0">
              {[
                { key: 'notifyOnTaskCreate', label: 'Task Created', desc: 'When a new task is created' },
                { key: 'notifyOnTaskAssign', label: 'Task Assigned', desc: 'When a task is assigned to a member' },
                { key: 'notifyOnTaskComplete', label: 'Task Completed', desc: 'When a task is marked completed' },
                { key: 'notifyOnComment', label: 'New Update', desc: 'When a new update/comment is posted' },
                { key: 'notifyOnDueDate', label: 'Due Date Reminder', desc: 'When a task is approaching its due date' },
              ].map(({ key, label, desc }, i, arr) => (
                <div
                  key={key}
                  className={cn('flex items-center justify-between py-4', i < arr.length - 1 && 'border-b')}
                >
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      updateEmailSettingsMutation.mutate({
                        [key]: !(emailSettings as Record<string, boolean>)?.[key],
                      })
                    }
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      (emailSettings as Record<string, boolean>)?.[key] ? 'bg-primary' : 'bg-muted'
                    }`}
                    disabled={updateEmailSettingsMutation.isPending}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow ${
                        (emailSettings as Record<string, boolean>)?.[key]
                          ? 'translate-x-4'
                          : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )

  const SectionDailyReport = (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Daily Report</h2>
        <p className="text-sm text-muted-foreground">
          Send a daily task digest email to all workspace members.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <p className="font-medium text-sm">Enable Daily Report</p>
              <p className="text-xs text-muted-foreground">Send a workspace summary email each day</p>
            </div>
            <button
              type="button"
              role="switch"
              onClick={() =>
                updateEmailSettingsMutation.mutate({
                  dailyReportEnabled: !emailSettings?.dailyReportEnabled,
                })
              }
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                emailSettings?.dailyReportEnabled ? 'bg-primary' : 'bg-input'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  emailSettings?.dailyReportEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {emailSettings?.dailyReportEnabled && (
            <div className="flex items-center gap-3 p-4 border rounded-lg">
              <div className="flex-1">
                <p className="font-medium text-sm">Report Time</p>
                <p className="text-xs text-muted-foreground">Time to send the daily digest</p>
              </div>
              <input
                type="time"
                value={emailSettings?.dailyReportTime || '08:00'}
                onChange={(e) =>
                  updateEmailSettingsMutation.mutate({ dailyReportTime: e.target.value })
                }
                className="border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary w-36"
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )

  const sectionContent: Record<Section, React.ReactNode> = {
    general: SectionGeneral,
    members: SectionMembers,
    invite: SectionInvite,
    notifications: SectionNotifications,
    'daily-report': SectionDailyReport,
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Top bar */}
        <div className="border-b px-6 py-3 flex items-center gap-3 bg-background shrink-0">
          <button
            onClick={() => navigate(`/workspace/${workspaceId}`)}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium">{workspace?.name}</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm text-muted-foreground">Settings</span>
        </div>

        {/* Body: sidebar + content */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Sidebar */}
          <aside className="w-56 border-r bg-muted/30 flex-shrink-0 py-4 overflow-y-auto">
            <nav className="px-2 space-y-0.5">
              {navItems.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setActiveSection(item.key)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm transition-colors text-left',
                    activeSection === item.key
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                >
                  {item.icon}
                  <span className="flex-1">{item.label}</span>
                  {activeSection === item.key && (
                    <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                  )}
                </button>
              ))}
            </nav>
          </aside>

          {/* Main content */}
          <main className="flex-1 overflow-y-auto p-8">
            <div className="max-w-2xl">
              {sectionContent[activeSection]}
            </div>
          </main>
        </div>
      </div>
    </AppLayout>
  )
}
