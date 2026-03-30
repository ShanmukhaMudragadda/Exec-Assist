import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'

interface AppLayoutProps {
  children: React.ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [avatarError, setAvatarError] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/auth/login')
  }

  const isDashboard = location.pathname === '/dashboard' || location.pathname === '/'
  const isInitiatives = location.pathname.startsWith('/initiatives')
  const isCommandCenter = location.pathname.startsWith('/command-center')

  const userInitials = user?.name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'U'

  const navItems = [
    { icon: 'space_dashboard', label: 'Dashboard', to: '/dashboard', active: isDashboard },
    { icon: 'rocket_launch', label: 'Initiatives', to: '/initiatives', active: isInitiatives },
    { icon: 'layers', label: 'Command Center', to: '/command-center', active: isCommandCenter },
  ]

  return (
    <div className="flex min-h-screen" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* ── Desktop Sidebar ───────────────────────────────────────────── */}
      <aside
        className="hidden md:flex w-[216px] fixed left-0 top-0 h-full flex-col z-50"
        style={{
          background: 'linear-gradient(180deg, #0f1629 0%, #131b2e 100%)',
          borderRight: '1px solid rgba(255,255,255,0.04)',
        }}
      >
        {/* Brand */}
        <div className="px-4 pt-6 pb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#4648d4] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-white text-[15px]" style={{ fontVariationSettings: "'FILL' 1, 'wght' 600" }}>bolt</span>
            </div>
            <span className="text-[16px] font-bold tracking-tight text-white">ExecAssist</span>
          </div>
        </div>

        <div className="px-4 mb-1.5">
          <p className="text-[10px] font-semibold text-[#4b5563] uppercase tracking-widest">Navigation</p>
        </div>

        <nav className="flex-1 flex flex-col gap-0.5 px-3">
          {navItems.map(({ icon, label, to, active }) => (
            <Link
              key={label}
              to={to}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150',
                active ? 'bg-white/10 text-white' : 'text-[#6b7280] hover:text-[#c9d1d9] hover:bg-white/5'
              )}
            >
              <span
                className="material-symbols-outlined text-[17px] shrink-0"
                style={{ fontVariationSettings: active ? "'FILL' 1, 'wght' 400" : "'FILL' 0, 'wght' 300" }}
              >
                {icon}
              </span>
              {label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto px-3 pb-4 space-y-0.5">
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} className="pt-4 mb-3 mx-1" />
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors cursor-pointer group">
            {user?.avatar && !avatarError ? (
              <img src={user.avatar} alt={user.name} className="w-7 h-7 rounded-full object-cover shrink-0" onError={() => setAvatarError(true)} />
            ) : (
              <div className="w-7 h-7 rounded-full bg-[#4648d4] flex items-center justify-center text-white text-[11px] font-bold shrink-0 ring-2 ring-[#4648d4]/30">
                {userInitials}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-white/90 truncate leading-tight">{user?.name}</div>
              <div className="text-[11px] text-[#4b5563] truncate capitalize">{user?.role || 'Executive'}</div>
            </div>
          </div>
          <Link
            to="/profile"
            className={cn(
              'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150',
              location.pathname === '/profile' ? 'bg-white/10 text-white' : 'text-[#6b7280] hover:text-[#c9d1d9] hover:bg-white/5'
            )}
          >
            <span className="material-symbols-outlined text-[17px] shrink-0">settings</span>
            Settings
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[#6b7280] hover:text-[#c9d1d9] hover:bg-white/5 transition-all rounded-lg text-[13px] font-medium"
          >
            <span className="material-symbols-outlined text-[17px] shrink-0">logout</span>
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Mobile top bar ────────────────────────────────────────────── */}
      <header
        className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-end justify-between px-4 pb-3"
        style={{
          minHeight: 56,
          paddingTop: 'var(--header-pt)',
          background: 'linear-gradient(180deg, #0f1629 0%, #131b2e 100%)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-[#4648d4] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-white text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
          </div>
          <span className="text-[15px] font-bold text-white tracking-tight">ExecAssist</span>
        </div>
        <Link to="/profile">
          {user?.avatar && !avatarError ? (
            <img src={user.avatar} alt={user.name} className="w-7 h-7 rounded-full object-cover" onError={() => setAvatarError(true)} />
          ) : (
            <div className="w-7 h-7 rounded-full bg-[#4648d4] flex items-center justify-center text-white text-[11px] font-bold">
              {userInitials}
            </div>
          )}
        </Link>
      </header>

      {/* ── Main content ──────────────────────────────────────────────── */}
      <div
        className="md:ml-[216px] flex-1 bg-[#f9fafb] min-h-screen"
        style={{ paddingTop: 'var(--content-pt)', paddingBottom: 'var(--content-pb)' }}
      >
        {children}
      </div>

      {/* ── Mobile bottom nav ─────────────────────────────────────────── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around px-2"
        style={{
          minHeight: 60,
          background: 'linear-gradient(180deg, #0f1629 0%, #131b2e 100%)',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {navItems.map(({ icon, label, to, active }) => (
          <Link
            key={label}
            to={to}
            className="flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-all"
          >
            <span
              className="material-symbols-outlined text-[24px]"
              style={{
                color: active ? '#ffffff' : 'rgba(255,255,255,0.35)',
                fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0",
              }}
            >
              {icon}
            </span>
            <span className="text-[10px] font-semibold" style={{ color: active ? '#ffffff' : 'rgba(255,255,255,0.35)' }}>
              {label === 'Command Center' ? 'Actions' : label}
            </span>
          </Link>
        ))}
        <Link
          to="/profile"
          className="flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-all"
        >
          <span
            className="material-symbols-outlined text-[24px]"
            style={{
              color: location.pathname === '/profile' ? '#ffffff' : 'rgba(255,255,255,0.35)',
              fontVariationSettings: location.pathname === '/profile' ? "'FILL' 1" : "'FILL' 0",
            }}
          >
            settings
          </span>
          <span className="text-[10px] font-semibold" style={{ color: location.pathname === '/profile' ? '#ffffff' : 'rgba(255,255,255,0.35)' }}>
            Settings
          </span>
        </Link>
      </nav>
    </div>
  )
}
