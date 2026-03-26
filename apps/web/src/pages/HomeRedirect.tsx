import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

// No workspace concept — redirect straight to dashboard
export default function HomeRedirect() {
  const navigate = useNavigate()

  useEffect(() => {
    navigate('/dashboard', { replace: true })
  }, [navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f7f9fb]">
      <div className="w-8 h-8 border-4 border-indigo-200 border-t-[#4648d4] rounded-full animate-spin" />
    </div>
  )
}
