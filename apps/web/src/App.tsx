import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from './store/authStore'
import { authApi, usersApi } from './services/api'
import { useSessionGuard } from './hooks/useSessionGuard'
import { useIsSuperAdmin } from './hooks/useIsSuperAdmin'
import { useFeatureFlag } from './hooks/useFeatureFlag'
import LoginPage from './pages/auth/LoginPage'
import DashboardPage from './pages/DashboardPage'
import ProfilePage from './pages/ProfilePage'
import InitiativesPage from './pages/InitiativesPage'
import CommandCenterPage from './pages/CommandCenterPage'
import UploadDataPage from './pages/UploadDataPage'
import ActionDetailPage from './pages/ActionDetailPage'
import UserGuidePage from './pages/UserGuidePage'
import AdminPage from './pages/AdminPage'
import EltDashboardPage from './pages/EltDashboardPage'
import { Toaster } from './components/ui/toaster'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const location = useLocation()
  if (!isAuthenticated) {
    const redirect = location.pathname + location.search
    return <Navigate to={`/auth/login?redirect=${encodeURIComponent(redirect)}`} replace />
  }
  return <>{children}</>
}

function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isSuperAdmin = useIsSuperAdmin()
  const location = useLocation()
  if (!isAuthenticated) {
    const redirect = location.pathname + location.search
    return <Navigate to={`/auth/login?redirect=${encodeURIComponent(redirect)}`} replace />
  }
  if (!isSuperAdmin) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function FeatureFlagRoute({ feature, children }: { feature: string; children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isSuperAdmin = useIsSuperAdmin()
  const flagEnabled = useFeatureFlag(feature)
  const location = useLocation()
  if (!isAuthenticated) {
    const redirect = location.pathname + location.search
    return <Navigate to={`/auth/login?redirect=${encodeURIComponent(redirect)}`} replace />
  }
  if (!flagEnabled && !isSuperAdmin) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function TimezoneSync() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const setUser = useAuthStore((s) => s.setUser)
  useEffect(() => {
    if (!isAuthenticated) return
    // Refresh user data from backend on every app load (picks up avatar, role changes, etc.)
    authApi.me().then((res) => setUser(res.data.user)).catch(() => {/* silent */})
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    usersApi.updateProfile({ timezone: tz }).catch(() => {/* silent */})
  }, [isAuthenticated])
  return null
}

/** Runs session guard (inactivity + token expiry) for authenticated users */
function SessionGuard() {
  useSessionGuard()
  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <TimezoneSync />
      <SessionGuard />
      <Routes>
        <Route path="/auth/login" element={<LoginPage />} />

        {/* Root → dashboard */}
        <Route path="/" element={<PrivateRoute><Navigate to="/dashboard" replace /></PrivateRoute>} />
        <Route path="/dashboard" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />

        {/* Initiatives */}
        <Route path="/initiatives" element={<PrivateRoute><InitiativesPage /></PrivateRoute>} />
        <Route path="/initiatives/:initiativeId" element={<PrivateRoute><Navigate to="/command-center" replace /></PrivateRoute>} />
        <Route path="/initiatives/:initiativeId/actions/:actionId" element={<PrivateRoute><ActionDetailPage /></PrivateRoute>} />

        {/* Standalone action (no initiative) */}
        <Route path="/actions/:actionId" element={<PrivateRoute><ActionDetailPage /></PrivateRoute>} />

        {/* Command Center */}
        <Route path="/command-center" element={<PrivateRoute><CommandCenterPage /></PrivateRoute>} />

        {/* Upload Data */}
        <Route path="/upload" element={<PrivateRoute><UploadDataPage /></PrivateRoute>} />

        {/* Profile */}
        <Route path="/profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />

        {/* User Guide — public, no login required */}
        <Route path="/user-guide" element={<UserGuidePage />} />

        {/* Admin — super-admin only */}
        <Route path="/admin" element={<SuperAdminRoute><AdminPage /></SuperAdminRoute>} />

        {/* ELT Dashboard — elt_dashboard flag or super-admin */}
        <Route path="/elt-dashboard" element={<FeatureFlagRoute feature="elt_dashboard"><EltDashboardPage /></FeatureFlagRoute>} />

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  )
}
