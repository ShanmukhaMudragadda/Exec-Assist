import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from './store/authStore'
import { authApi, usersApi } from './services/api'
import LoginPage from './pages/auth/LoginPage'
import DashboardPage from './pages/DashboardPage'
import ProfilePage from './pages/ProfilePage'
import InitiativesPage from './pages/InitiativesPage'
import InitiativeDetailPage from './pages/InitiativeDetailPage'
import CommandCenterPage from './pages/CommandCenterPage'
import UploadDataPage from './pages/UploadDataPage'
import ActionDetailPage from './pages/ActionDetailPage'
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

export default function App() {
  return (
    <BrowserRouter>
      <TimezoneSync />
      <Routes>
        <Route path="/auth/login" element={<LoginPage />} />

        {/* Root → dashboard */}
        <Route path="/" element={<PrivateRoute><Navigate to="/dashboard" replace /></PrivateRoute>} />
        <Route path="/dashboard" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />

        {/* Initiatives */}
        <Route path="/initiatives" element={<PrivateRoute><InitiativesPage /></PrivateRoute>} />
        <Route path="/initiatives/:initiativeId" element={<PrivateRoute><InitiativeDetailPage /></PrivateRoute>} />
        <Route path="/initiatives/:initiativeId/actions/:actionId" element={<PrivateRoute><ActionDetailPage /></PrivateRoute>} />

        {/* Standalone action (no initiative) */}
        <Route path="/actions/:actionId" element={<PrivateRoute><ActionDetailPage /></PrivateRoute>} />

        {/* Command Center */}
        <Route path="/command-center" element={<PrivateRoute><CommandCenterPage /></PrivateRoute>} />

        {/* Upload Data */}
        <Route path="/upload" element={<PrivateRoute><UploadDataPage /></PrivateRoute>} />

        {/* Profile */}
        <Route path="/profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  )
}
