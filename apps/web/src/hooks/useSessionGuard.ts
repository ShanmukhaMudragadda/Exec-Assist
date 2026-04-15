import { useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000  // 30 minutes
const WARNING_BEFORE_MS     =  1 * 60 * 1000  // show warning 1 min before logout
const TOKEN_CHECK_INTERVAL  =  1 * 60 * 1000  // re-check token expiry every minute

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'] as const

/** Decode JWT exp claim (no signature verification — client-side only) */
function getTokenExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.exp === 'number' ? payload.exp : null
  } catch {
    return null
  }
}

function isTokenExpired(token: string): boolean {
  const exp = getTokenExp(token)
  if (exp === null) return false
  return Date.now() >= exp * 1000
}

/** Returns seconds until token expires, or null */
function secondsUntilExpiry(token: string): number | null {
  const exp = getTokenExp(token)
  if (exp === null) return null
  return Math.floor(exp - Date.now() / 1000)
}

export function useSessionGuard() {
  const { token, logout, isAuthenticated } = useAuthStore()
  const navigate = useNavigate()

  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warningTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warningShown    = useRef(false)
  const warningEl       = useRef<HTMLDivElement | null>(null)

  const doLogout = useCallback((reason: 'inactivity' | 'token_expired') => {
    removeWarningBanner()
    logout()
    navigate(`/auth/login?reason=${reason}`, { replace: true })
  }, [logout, navigate])

  // ── Warning banner ─────────────────────────────────────────────────────────
  function removeWarningBanner() {
    warningShown.current = false
    if (warningEl.current) {
      warningEl.current.remove()
      warningEl.current = null
    }
  }

  function showWarningBanner(secondsLeft: number) {
    if (warningShown.current) return
    warningShown.current = true

    const div = document.createElement('div')
    div.style.cssText = [
      'position:fixed', 'bottom:24px', 'left:50%', 'transform:translateX(-50%)',
      'z-index:99999', 'background:#1f2937', 'color:#f9fafb',
      'padding:14px 20px', 'border-radius:12px',
      'box-shadow:0 8px 32px rgba(0,0,0,0.3)',
      'display:flex', 'align-items:center', 'gap:16px',
      'font-family:system-ui,sans-serif', 'font-size:13px', 'font-weight:500',
      'min-width:320px', 'max-width:480px',
    ].join(';')

    const countdown = document.createElement('span')
    countdown.style.cssText = 'color:#fbbf24;font-weight:700;min-width:28px;display:inline-block'
    countdown.textContent = `${secondsLeft}s`

    const msg = document.createElement('span')
    msg.style.cssText = 'flex:1'
    msg.textContent = 'Session expiring due to inactivity. Move your mouse to stay signed in.'

    const stayBtn = document.createElement('button')
    stayBtn.textContent = 'Stay signed in'
    stayBtn.style.cssText = [
      'background:#4648d4', 'color:#fff', 'border:none', 'border-radius:8px',
      'padding:6px 14px', 'font-size:12px', 'font-weight:600',
      'cursor:pointer', 'white-space:nowrap',
    ].join(';')
    stayBtn.onclick = () => { resetInactivityTimer(); removeWarningBanner() }

    div.appendChild(msg)
    div.appendChild(countdown)
    div.appendChild(stayBtn)
    document.body.appendChild(div)
    warningEl.current = div

    // Update countdown every second
    let remaining = secondsLeft
    const tick = setInterval(() => {
      remaining -= 1
      if (remaining <= 0 || !warningEl.current) { clearInterval(tick); return }
      countdown.textContent = `${remaining}s`
    }, 1000)
  }

  // ── Inactivity timer ───────────────────────────────────────────────────────
  const resetInactivityTimer = useCallback(() => {
    if (!isAuthenticated) return
    removeWarningBanner()

    if (inactivityTimer.current) clearTimeout(inactivityTimer.current)
    if (warningTimer.current)    clearTimeout(warningTimer.current)

    // Show warning WARNING_BEFORE_MS before the full timeout
    warningTimer.current = setTimeout(() => {
      showWarningBanner(Math.round(WARNING_BEFORE_MS / 1000))
    }, INACTIVITY_TIMEOUT_MS - WARNING_BEFORE_MS)

    // Logout after full inactivity timeout
    inactivityTimer.current = setTimeout(() => {
      doLogout('inactivity')
    }, INACTIVITY_TIMEOUT_MS)
  }, [isAuthenticated, doLogout])

  // ── Token expiry periodic check ────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated || !token) return

    // Check immediately on mount
    if (isTokenExpired(token)) {
      doLogout('token_expired')
      return
    }

    // Schedule logout exactly when the token expires (if within a reasonable window)
    const secs = secondsUntilExpiry(token)
    let tokenExpiryTimer: ReturnType<typeof setTimeout> | null = null
    if (secs !== null && secs > 0 && secs < 8 * 24 * 3600) {
      tokenExpiryTimer = setTimeout(() => doLogout('token_expired'), secs * 1000)
    }

    // Also poll every minute as a safety net (handles clock skew, tab resume)
    const interval = setInterval(() => {
      if (token && isTokenExpired(token)) doLogout('token_expired')
    }, TOKEN_CHECK_INTERVAL)

    return () => {
      clearInterval(interval)
      if (tokenExpiryTimer) clearTimeout(tokenExpiryTimer)
    }
  }, [isAuthenticated, token, doLogout])

  // ── Activity listeners + inactivity timer ─────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return

    resetInactivityTimer()

    const handleActivity = () => resetInactivityTimer()
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, handleActivity, { passive: true }))

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, handleActivity))
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current)
      if (warningTimer.current)    clearTimeout(warningTimer.current)
      removeWarningBanner()
    }
  }, [isAuthenticated, resetInactivityTimer])

  // ── Visibility change — recheck token when tab becomes active again ────────
  useEffect(() => {
    if (!isAuthenticated) return
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && token && isTokenExpired(token)) {
        doLogout('token_expired')
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [isAuthenticated, token, doLogout])
}
