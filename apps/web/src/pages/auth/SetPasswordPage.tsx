import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { authApi } from '@/services/api'

const MIN_LENGTH = 10

const inputClass =
  'w-full h-10 px-3 border border-slate-300 rounded text-[14px] focus:outline-none focus:ring-2 focus:ring-[#4648d4]/20 focus:border-[#4648d4]'

export default function SetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const setAuth = useAuthStore((s) => s.setAuth)

  const [account, setAccount] = useState<{ email: string; name: string; hasPassword: boolean } | null>(null)
  const [linkError, setLinkError] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) {
      setLinkError('This link is invalid or has expired.')
      return
    }
    authApi.verifyPasswordToken(token)
      .then((res) => {
        setAccount(res.data)
        setName(res.data.name)
      })
      .catch((err) => setLinkError(err?.response?.data?.error || 'This link is invalid or has expired.'))
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < MIN_LENGTH) return setError(`Password must be at least ${MIN_LENGTH} characters.`)
    if (password !== confirm) return setError('Passwords do not match.')

    setSubmitting(true)
    try {
      const res = await authApi.setPassword(token, password, account?.hasPassword ? undefined : name.trim())
      const { token: jwt, user } = res.data
      setAuth(user, jwt)
      navigate('/dashboard', { replace: true })
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not set password. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen w-full bg-white flex items-center justify-center px-4" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div className="w-full max-w-[380px]">
        <div className="mb-8 text-center">
          <span className="text-[48px] font-extrabold text-[#4648d4] leading-none tracking-tighter">EA</span>
          <p className="text-[13px] text-slate-400 font-medium mt-1">ExecAssist</p>
        </div>

        {linkError ? (
          <div className="text-center">
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 font-medium">{linkError}</div>
            <p className="mb-4 text-[13px] text-slate-500">
              If this was an invitation, ask the person who invited you to send it again.
            </p>
            <Link to="/auth/forgot-password" className="text-[13px] text-[#4648d4] font-semibold hover:underline">
              Already have a password? Reset it →
            </Link>
          </div>
        ) : !account ? (
          <p className="text-center text-[14px] text-slate-400">Checking your link…</p>
        ) : (
          <>
            <header className="mb-6 text-center">
              <h2 className="text-[24px] font-bold text-[#0f172a] tracking-[-0.03em] mb-1">
                {account.hasPassword ? 'Reset your password' : 'Set your password'}
              </h2>
              <p className="text-[14px] text-slate-500">{account.email}</p>
            </header>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 font-medium text-center">{error}</div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              {!account.hasPassword && (
                <input
                  type="text"
                  required
                  minLength={2}
                  autoComplete="name"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                />
              )}
              <input
                type="password"
                required
                autoComplete="new-password"
                autoFocus
                placeholder={`New password (at least ${MIN_LENGTH} characters)`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
              <input
                type="password"
                required
                autoComplete="new-password"
                placeholder="Confirm password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={inputClass}
              />
              <button
                type="submit"
                disabled={submitting}
                className="w-full h-10 bg-[#4648d4] hover:bg-[#3730a3] disabled:opacity-60 text-white rounded text-[14px] font-semibold transition-colors"
              >
                {submitting ? 'Saving…' : 'Set password and sign in'}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  )
}
