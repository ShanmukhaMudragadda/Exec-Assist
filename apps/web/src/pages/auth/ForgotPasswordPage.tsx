import { useState } from 'react'
import { Link } from 'react-router-dom'
import { authApi } from '@/services/api'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const res = await authApi.forgotPassword(email.trim())
      setMessage(res.data.message)
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Something went wrong. Please try again.')
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

        <header className="mb-6 text-center">
          <h2 className="text-[24px] font-bold text-[#0f172a] tracking-[-0.03em] mb-1">Reset your password</h2>
          <p className="text-[14px] text-slate-500">
            We'll email you a link to set a new password. Not set up yet? Use the link in your invitation email.
            Forsys staff sign in with Google.
          </p>
        </header>

        {message ? (
          <div className="mb-6 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700 font-medium text-center">
            {message}
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 font-medium text-center">{error}</div>
            )}
            <form onSubmit={handleSubmit} className="space-y-3">
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
              <button
                type="submit"
                disabled={submitting}
                className="w-full h-10 bg-[#4648d4] hover:bg-[#3730a3] disabled:opacity-60 text-white rounded text-[14px] font-semibold transition-colors"
              >
                {submitting ? 'Sending…' : 'Send link'}
              </button>
            </form>
          </>
        )}

        <div className="mt-6 text-center">
          <Link to="/auth/login" className="text-[13px] text-[#4648d4] font-semibold hover:underline">← Back to sign in</Link>
        </div>
      </div>
    </main>
  )
}
