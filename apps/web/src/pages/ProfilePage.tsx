import { useState, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import AppLayout from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { usersApi } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/hooks/use-toast'
import { User, Bell, Shield, Save } from 'lucide-react'

export default function ProfilePage() {
  const { user, setUser } = useAuthStore()
  const [name, setName] = useState(user?.name || '')
  const [emailNotifications, setEmailNotifications] = useState(user?.emailNotifications ?? true)
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    const changed =
      name !== user?.name ||
      emailNotifications !== user?.emailNotifications
    setHasChanges(changed)
  }, [name, emailNotifications, user])

  const updateMutation = useMutation({
    mutationFn: (data: { name?: string; emailNotifications?: boolean }) =>
      usersApi.updateProfile(data),
    onSuccess: (res) => {
      const updatedUser = res.data?.user || res.data
      if (updatedUser) setUser(updatedUser)
      setHasChanges(false)
      toast({ title: 'Profile updated!', description: 'Your settings have been saved.' })
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { error?: string } } }
      toast({ title: 'Error', description: error.response?.data?.error || 'Failed to update profile', variant: 'destructive' })
    },
  })

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    updateMutation.mutate({
      name: name.trim(),
      emailNotifications,
    })
  }

  return (
    <AppLayout>
      <div className="max-w-12xl mx-auto p-8 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Profile</h1>
          <p className="text-muted-foreground mt-1">Manage your account settings and preferences</p>
        </div>

        {/* Profile Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-2xl font-bold">
                {user?.name?.charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 className="text-xl font-semibold">{user?.name}</h2>
                <p className="text-muted-foreground">{user?.email}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant={user?.emailVerified ? 'default' : 'secondary'} className="text-xs">
                    {user?.emailVerified ? 'Verified' : 'Unverified'}
                  </Badge>
                  <Badge variant="outline" className="text-xs capitalize">{user?.role}</Badge>
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Personal Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <User className="w-4 h-4" />
                Personal Information
              </CardTitle>
              <CardDescription>Update your name and personal details.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="profile-name">Full Name</Label>
                <Input
                  id="profile-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                />
              </div>
              <div className="space-y-2">
                <Label>Email Address</Label>
                <Input value={user?.email || ''} disabled className="bg-muted cursor-not-allowed" />
                <p className="text-xs text-muted-foreground">Email cannot be changed.</p>
              </div>
            </CardContent>
          </Card>

          {/* Notifications */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="w-4 h-4" />
                Notifications
              </CardTitle>
              <CardDescription>Configure how you receive notifications.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium text-sm">Email Notifications</p>
                  <p className="text-xs text-muted-foreground">Receive email updates about tasks and mentions</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={emailNotifications}
                  onClick={() => setEmailNotifications(!emailNotifications)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
                    emailNotifications ? 'bg-primary' : 'bg-input'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      emailNotifications ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Security Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Account Security
              </CardTitle>
              <CardDescription>Information about your account security.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div>
                  <p className="text-sm font-medium">Password</p>
                  <p className="text-xs text-muted-foreground">Last changed: unknown</p>
                </div>
                <Badge variant="secondary" className="text-xs">Protected</Badge>
              </div>
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div>
                  <p className="text-sm font-medium">Email Verification</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                </div>
                <Badge
                  className={`text-xs ${user?.emailVerified ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}
                  variant="outline"
                >
                  {user?.emailVerified ? 'Verified' : 'Pending'}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={updateMutation.isPending || !hasChanges}
              className="gap-2 min-w-32"
            >
              {updateMutation.isPending ? (
                'Saving...'
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </AppLayout>
  )
}
