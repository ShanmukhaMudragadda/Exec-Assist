import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import LoginPage from './pages/auth/LoginPage'
import VerifyEmailPage from './pages/auth/VerifyEmailPage'
import HomeRedirect from './pages/HomeRedirect'
import WorkspacesPage from './pages/WorkspacesPage'
import WorkspacePage from './pages/WorkspacePage'
import TaskDetailPage from './pages/TaskDetailPage'
import TranscriptsPage from './pages/TranscriptsPage'
import WorkspaceSettingsPage from './pages/WorkspaceSettingsPage'
import ProfilePage from './pages/ProfilePage'
import AcceptInvitationPage from './pages/AcceptInvitationPage'
import SmartCreatePage from './pages/SmartCreatePage'
import { Toaster } from './components/ui/toaster'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return isAuthenticated ? <>{children}</> : <Navigate to="/auth/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth/login" element={<LoginPage />} />
        <Route path="/auth/verify-email" element={<VerifyEmailPage />} />

        {/* Home: auto-redirect to first workspace */}
        <Route path="/" element={<PrivateRoute><HomeRedirect /></PrivateRoute>} />
        <Route path="/dashboard" element={<PrivateRoute><HomeRedirect /></PrivateRoute>} />

        {/* Workspace board — the main screen */}
        <Route path="/workspace/:id" element={<PrivateRoute><WorkspacePage /></PrivateRoute>} />

        {/* Supporting pages (accessible from profile dropdown) */}
        <Route path="/workspace/:workspaceId/tasks/:taskId" element={<PrivateRoute><TaskDetailPage /></PrivateRoute>} />
        <Route path="/workspace/:id/transcripts" element={<PrivateRoute><TranscriptsPage /></PrivateRoute>} />
        <Route path="/workspace/:id/settings" element={<PrivateRoute><WorkspaceSettingsPage /></PrivateRoute>} />
        <Route path="/workspace/:id/smart-create" element={<PrivateRoute><SmartCreatePage /></PrivateRoute>} />
        <Route path="/workspaces" element={<PrivateRoute><WorkspacesPage /></PrivateRoute>} />
        <Route path="/profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
        <Route path="/invitations/:invitationId/accept" element={<PrivateRoute><AcceptInvitationPage /></PrivateRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  )
}
