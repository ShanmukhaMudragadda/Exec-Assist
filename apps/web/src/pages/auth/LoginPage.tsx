import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { authApi } from '@/services/api'

const REASON_MESSAGES: Record<string, string> = {
  token_expired: 'Your session has expired. Please sign in again.',
  inactivity:    'You were signed out due to inactivity. Please sign in again.',
}

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { setAuth, isAuthenticated } = useAuthStore()
  const [error, setError] = useState('')
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const redirect = searchParams.get('redirect') || '/dashboard'
  const reason   = searchParams.get('reason') || ''
  const sessionMessage = REASON_MESSAGES[reason] || ''

  // If already authenticated, skip login
  useEffect(() => {
    if (isAuthenticated) navigate(redirect, { replace: true })
  }, [isAuthenticated])

  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    document.body.appendChild(script)

    script.onload = () => {
      if (window.google) {
        window.google.accounts.id.initialize({
          client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
          callback: handleCredentialResponse,
        })
        window.google.accounts.id.renderButton(
          document.getElementById('google-signin-btn')!,
          { theme: 'outline', size: 'large', width: 320, text: 'continue_with' }
        )
      }
    }

    return () => { document.body.removeChild(script) }
  }, [])

  const handleCredentialResponse = async (response: any) => {
    setError('')
    try {
      const res = await authApi.googleLogin(response.credential)
      const { token, user } = res.data
      setAuth(user, token)
      navigate(redirect, { replace: true })
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Unknown error'
      console.error('[Google Login] failed:', msg, err)
      setError(`Google sign-in failed: ${msg}`)
    }
  }

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const res = await authApi.passwordLogin(email.trim(), password)
      const { token, user } = res.data
      setAuth(user, token)
      navigate(redirect, { replace: true })
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Sign-in failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="flex h-screen w-full overflow-hidden" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* LEFT PANEL */}
      <section className="hidden lg:flex w-[45%] h-full bg-[#0b1326] relative flex-col justify-center px-16 lg:px-24">
        <div className="z-10">
          <div className="mb-6">
            <span className="text-[64px] font-extrabold text-white leading-none tracking-tighter" style={{ textShadow: '0 0 20px rgba(109, 112, 251, 0.4)' }}>EA</span>
          </div>
          <div className="space-y-1">
            <h1 className="text-[28px] font-bold text-white tracking-[-0.02em] uppercase">ExecAssist</h1>
            <p className="text-[15px] text-slate-400 font-medium">Your executive command center.</p>
          </div>
          <div className="w-12 h-[1px] bg-indigo-500 mt-8 mb-8" />
          <ul className="space-y-5">
            {[
              'Initiatives & actions — in one place',
              'AI-generated briefings, every morning',
              'Transcript to action, instantly',
            ].map((feat) => (
              <li key={feat} className="flex items-center space-x-3 text-[14px] text-slate-200 tracking-tight">
                <span className="w-1.5 h-1.5 bg-transparent border border-indigo-400 flex-shrink-0" style={{ borderWidth: 1 }} />
                <span>{feat}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="absolute bottom-12 left-16 lg:left-24">
          <span className="text-[11px] text-slate-600 font-mono tracking-widest uppercase">v3.0.0</span>
        </div>
        <div className="absolute inset-0 opacity-10 pointer-events-none overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #c0c1ff 1px, transparent 0)', backgroundSize: '48px 48px' }} />
        </div>
      </section>

      {/* RIGHT PANEL */}
      <section className="w-full lg:w-[55%] h-full bg-white flex flex-col items-center justify-center px-4 sm:px-8">
        <div className="w-full max-w-sm lg:max-w-[380px] flex flex-col items-center mx-auto">
          {/* Mobile logo */}
          <div className="lg:hidden mb-8 text-center">
            <span className="text-[48px] font-extrabold text-[#4648d4] leading-none tracking-tighter">EA</span>
            <p className="text-[13px] text-slate-400 font-medium mt-1">ExecAssist</p>
          </div>

          <header className="mb-10 text-center">
            <h2 className="text-[28px] font-bold text-[#0f172a] tracking-[-0.03em] mb-1">Welcome</h2>
            <p className="text-[14px] text-slate-500 font-medium">Sign in to continue to ExecAssist.</p>
          </header>

          {sessionMessage && (
            <div className="w-full mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700 font-medium text-center flex items-center gap-2 justify-center">
              <span>⚠️</span>
              {sessionMessage}
            </div>
          )}

          {error && (
            <div className="w-full mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 font-medium text-center">
              {error}
            </div>
          )}

          {/* Google Sign-In button rendered by Google SDK */}
          <div id="google-signin-btn" className="mb-4" />

          {/* Email + password — external users only */}
          <div className="w-full flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">External users</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          {!showPasswordForm ? (
            <button
              type="button"
              onClick={() => setShowPasswordForm(true)}
              className="w-[320px] max-w-full h-10 border border-slate-300 rounded text-[14px] font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Sign in with email
            </button>
          ) : (
            <form onSubmit={handlePasswordLogin} className="w-[320px] max-w-full space-y-3">
              <input
                type="email"
                required
                autoComplete="email"
                autoFocus
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-10 px-3 border border-slate-300 rounded text-[14px] focus:outline-none focus:ring-2 focus:ring-[#4648d4]/20 focus:border-[#4648d4]"
              />
              <input
                type="password"
                required
                autoComplete="current-password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-10 px-3 border border-slate-300 rounded text-[14px] focus:outline-none focus:ring-2 focus:ring-[#4648d4]/20 focus:border-[#4648d4]"
              />
              <button
                type="submit"
                disabled={submitting}
                className="w-full h-10 bg-[#4648d4] hover:bg-[#3730a3] disabled:opacity-60 text-white rounded text-[14px] font-semibold transition-colors"
              >
                {submitting ? 'Signing in…' : 'Sign in'}
              </button>
              <div className="text-center">
                <Link to="/auth/forgot-password" className="text-[12px] text-[#4648d4] font-medium hover:underline">
                  Forgot password?
                </Link>
              </div>
            </form>
          )}

          <p className="text-[11px] text-slate-400 max-w-[280px] mx-auto leading-relaxed text-center mt-6">
            By signing in, you agree to our{' '}
            <a className="underline" href="#">Terms</a> and{' '}
            <a className="underline" href="#">Privacy Policy</a>.
          </p>
        </div>
      </section>
    </main>
  )
}
