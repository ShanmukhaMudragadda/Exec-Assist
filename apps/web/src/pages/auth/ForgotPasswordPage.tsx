import { useState } from 'react'
import { Link } from 'react-router-dom'
import { authApi } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { toast } from '@/hooks/use-toast'
import { Mail, CheckCircle2, ArrowLeft } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await authApi.requestReset(email.trim())
      setSent(true)
    } catch {
      // Always show success to avoid email enumeration
      setSent(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center">
            <Mail className="text-white w-6 h-6" />
          </div>
          <CardTitle className="text-2xl">Forgot Password</CardTitle>
          <CardDescription>
            Enter your email and we'll send you a reset link
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          {sent ? (
            <div className="text-center space-y-4 py-2">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-9 h-9 text-green-600" />
              </div>
              <div>
                <p className="font-semibold text-lg">Check your inbox</p>
                <p className="text-muted-foreground text-sm mt-1">
                  If <span className="font-medium">{email}</span> is registered, you'll receive a reset link shortly.
                </p>
              </div>
              <Button asChild variant="outline" className="w-full gap-2">
                <Link to="/auth/login">
                  <ArrowLeft className="w-4 h-4" /> Back to Login
                </Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !email.trim()}>
                {loading ? 'Sending...' : 'Send Reset Link'}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                <Link to="/auth/login" className="text-primary hover:underline inline-flex items-center gap-1">
                  <ArrowLeft className="w-3 h-3" /> Back to Login
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
