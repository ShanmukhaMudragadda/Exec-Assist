import { useState, useEffect, useRef } from 'react'
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
import { User, Bell, Shield, Save, Camera } from 'lucide-react'

export default function ProfilePage() {
  const { user, setUser } = useAuthStore()
  const [name, setName] = useState(user?.name || '')
  const [avatar, setAvatar] = useState<string | null>(user?.avatar || null)
  const [emailNotifications, setEmailNotifications] = useState(user?.emailNotifications ?? true)
  const [hasChanges, setHasChanges] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const changed =
      name !== user?.name ||
      avatar !== (user?.avatar ?? null) ||
      emailNotifications !== user?.emailNotifications
    setHasChanges(changed)
  }, [name, avatar, emailNotifications, user])

  const updateMutation = useMutation({
    mutationFn: (data: { name?: string; avatar?: string | null; emailNotifications?: boolean }) =>
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

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'Image too large', description: 'Please choose an image under 2 MB.', variant: 'destructive' })
      return
    }
    const reader = new FileReader()
    reader.onload = (ev) => {
      setAvatar(ev.target?.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    updateMutation.mutate({
      name: name.trim(),
      avatar,
      emailNotifications,
    })
  }

  const initials = user?.name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '?'

  return (
    <AppLayout>
      <div className="max-w-12xl mx-auto p-4 md:p-8 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Profile</h1>
          <p className="text-muted-foreground mt-1">Manage your account settings and preferences</p>
        </div>

        {/* Profile Card */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              {/* Avatar with upload button */}
              <div className="relative group">
                <div className="w-16 h-16 rounded-full overflow-hidden bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-2xl font-bold">
                  {avatar
                    ? <img src={avatar} alt={user?.name} className="w-full h-full object-cover" />
                    : initials
                  }
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Change photo"
                >
                  <Camera className="w-5 h-5 text-white" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
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
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-indigo-600 hover:underline mt-1"
                >
                  Change photo
                </button>
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
          <div className="flex justify-end sm:justify-end">
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
