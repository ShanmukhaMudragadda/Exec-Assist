import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { authApi } from '@/services/api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'

export default function VerifyEmailPage() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setMessage('No verification token provided.')
      return
    }
    authApi.verifyEmail(token)
      .then(() => setStatus('success'))
      .catch((err: unknown) => {
        const error = err as { response?: { data?: { error?: string } } }
        setStatus('error')
        setMessage(error.response?.data?.error || 'This link is invalid or has expired.')
      })
  }, [token])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center">
            <span className="text-white font-bold text-xl">EA</span>
          </div>
          <CardTitle className="text-2xl">Email Verification</CardTitle>
          <CardDescription>Confirming your email address</CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-5 pt-4">
          {status === 'loading' && (
            <>
              <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
              <p className="text-muted-foreground">Verifying your email address...</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-9 h-9 text-green-600" />
              </div>
              <div>
                <p className="font-semibold text-lg text-foreground">Email verified!</p>
                <p className="text-muted-foreground text-sm mt-1">
                  Your account is fully activated. You can now use all features.
                </p>
              </div>
              <Button asChild className="w-full">
                <Link to="/dashboard">Go to Dashboard</Link>
              </Button>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                <XCircle className="w-9 h-9 text-red-500" />
              </div>
              <div>
                <p className="font-semibold text-lg text-foreground">Verification failed</p>
                <p className="text-muted-foreground text-sm mt-1">{message}</p>
              </div>
              <Button asChild variant="outline" className="w-full">
                <Link to="/auth/login">Back to Login</Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
