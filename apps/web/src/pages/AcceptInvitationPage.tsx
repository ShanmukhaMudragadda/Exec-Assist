import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { workspacesApi } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { toast } from '@/hooks/use-toast'
import { useAuthStore } from '@/store/authStore'
import { Users, Check, X, Loader2 } from 'lucide-react'

export default function AcceptInvitationPage() {
  const { invitationId } = useParams<{ invitationId: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const [accepting, setAccepting] = useState(false)
  const [rejecting, setRejecting] = useState(false)

  const handleAccept = async () => {
    if (!invitationId) return
    setAccepting(true)
    try {
      const res = await workspacesApi.acceptInvitation(invitationId)
      const workspaceId = (res.data as { workspaceId?: string })?.workspaceId
      toast({ title: 'Invitation accepted!', description: 'Welcome to the workspace.' })
      navigate(workspaceId ? `/workspace/${workspaceId}` : '/dashboard')
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } }
      toast({
        title: 'Could not accept invitation',
        description: error.response?.data?.error || 'This invitation may have expired or already been used.',
        variant: 'destructive',
      })
      setAccepting(false)
    }
  }

  const handleDecline = async () => {
    if (!invitationId) return
    setRejecting(true)
    try {
      await workspacesApi.rejectInvitation(invitationId)
      toast({ title: 'Invitation declined.' })
      navigate('/dashboard')
    } catch {
      toast({ title: 'Failed to decline invitation', variant: 'destructive' })
      setRejecting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-2xl flex items-center justify-center">
            <Users className="text-white w-7 h-7" />
          </div>
          <CardTitle className="text-2xl">Workspace Invitation</CardTitle>
          <CardDescription>
            {user?.name ? `Hi ${user.name.split(' ')[0]}, you've` : "You've"} been invited to collaborate on a workspace in EAssist.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          <Button
            className="w-full gap-2 h-11"
            onClick={handleAccept}
            disabled={accepting || rejecting}
          >
            {accepting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Accepting...</>
            ) : (
              <><Check className="w-4 h-4" /> Accept Invitation</>
            )}
          </Button>

          <Button
            variant="outline"
            className="w-full gap-2 h-11"
            onClick={handleDecline}
            disabled={accepting || rejecting}
          >
            {rejecting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Declining...</>
            ) : (
              <><X className="w-4 h-4" /> Decline</>
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground pt-1">
            Signed in as <span className="font-medium">{user?.email}</span>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
