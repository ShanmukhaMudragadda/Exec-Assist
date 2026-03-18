import { GoogleLogin } from '@react-oauth/google'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { authApi } from '@/services/api'
import { toast } from '@/hooks/use-toast'

export default function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)

  const handleGoogleSuccess = async (credentialResponse: { credential?: string }) => {
    if (!credentialResponse.credential) return
    try {
      const res = await authApi.googleLogin(credentialResponse.credential)
      setAuth(res.data.user, res.data.token)
      navigate('/dashboard')
    } catch {
      toast({ title: 'Google sign-in failed', description: 'Please try again', variant: 'destructive' })
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      <div className="w-full max-w-sm text-center">
        {/* Logo */}
        <div className="mx-auto mb-6 w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200">
          <span className="text-white font-bold text-2xl">EA</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">EAssist</h1>
        <p className="text-sm text-gray-500 mb-8">Executive task management, simplified.</p>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Welcome</h2>
          <p className="text-sm text-gray-500 mb-6">Sign in with your Google account to continue</p>

          <div className="flex justify-center">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => toast({ title: 'Google sign-in failed', variant: 'destructive' })}
              shape="rectangular"
              size="large"
              width="280"
              text="signin_with"
            />
          </div>

          <p className="text-xs text-gray-400 mt-6">
            By signing in, you agree to our terms of service and privacy policy.
          </p>
        </div>
      </div>
    </div>
  )
}
