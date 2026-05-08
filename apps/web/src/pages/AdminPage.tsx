import { useEffect, useState, useCallback } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import { adminApi } from '@/services/api'
import { useToast } from '@/hooks/use-toast'

interface FeatureFlag {
  feature: string
  enabled: boolean
}

interface AdminUser {
  id: string
  name: string
  email: string
  role: string
  createdAt: string
  featureFlags: FeatureFlag[]
}

interface Stats {
  users: number
  initiatives: number
  actions: number
}

export default function AdminPage() {
  const { toast } = useToast()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const fetchData = useCallback(async (q?: string) => {
    setLoading(true)
    try {
      const [usersRes, statsRes] = await Promise.all([
        adminApi.listUsers(q),
        adminApi.getStats(),
      ])
      setUsers(usersRes.data.users)
      setStats(statsRes.data)
    } catch {
      toast({ title: 'Failed to load admin data', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { fetchData() }, [fetchData])

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    fetchData(search || undefined)
  }

  const toggleElt = async (user: AdminUser) => {
    const current = user.featureFlags.find((f) => f.feature === 'elt_dashboard')?.enabled ?? false
    setTogglingId(user.id)
    try {
      await adminApi.updateUserFeature(user.id, 'elt_dashboard', !current)
      setUsers((prev) =>
        prev.map((u) => {
          if (u.id !== user.id) return u
          const flags = u.featureFlags.filter((f) => f.feature !== 'elt_dashboard')
          return { ...u, featureFlags: [...flags, { feature: 'elt_dashboard', enabled: !current }] }
        })
      )
      toast({ title: `ELT Dashboard ${!current ? 'enabled' : 'disabled'} for ${user.name}` })
    } catch {
      toast({ title: 'Failed to update feature flag', variant: 'destructive' })
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
          <p className="text-sm text-gray-500 mt-1">System management — super-admin only</p>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Total Users', value: stats.users, icon: 'group' },
              { label: 'Initiatives', value: stats.initiatives, icon: 'rocket_launch' },
              { label: 'Actions', value: stats.actions, icon: 'task_alt' },
            ].map(({ label, value, icon }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-100 p-5 flex items-center gap-4 shadow-sm">
                <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-indigo-600 text-[20px]">{icon}</span>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</div>
                  <div className="text-xs text-gray-500">{label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* User Access Management */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-base font-semibold text-gray-900">User Access Management</h2>
              <p className="text-xs text-gray-500 mt-0.5">Toggle ELT Dashboard access per user</p>
            </div>
            <form onSubmit={handleSearchSubmit} className="flex gap-2">
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[16px]">search</span>
                <input
                  value={search}
                  onChange={handleSearchChange}
                  placeholder="Search users…"
                  className="pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-56"
                />
              </div>
              <button type="submit" className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
                Search
              </button>
            </form>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <span className="material-symbols-outlined animate-spin text-[32px] mr-3">progress_activity</span>
              Loading…
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">No users found</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {users.map((u) => {
                const eltEnabled = u.featureFlags.find((f) => f.feature === 'elt_dashboard')?.enabled ?? false
                const isSA = u.role === 'superadmin'
                return (
                  <div key={u.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors">
                    <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[13px] font-bold shrink-0">
                      {u.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 truncate">{u.name}</span>
                        {isSA && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">
                            <span className="material-symbols-outlined text-[11px]">shield</span>
                            Super Admin
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 truncate">{u.email}</div>
                    </div>
                    <div className="text-xs text-gray-400 hidden sm:block">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <span className="text-xs text-gray-500">ELT Dashboard</span>
                      <button
                        onClick={() => toggleElt(u)}
                        disabled={togglingId === u.id || isSA}
                        title={isSA ? 'Super admin always has access' : undefined}
                        className={[
                          'relative w-10 h-5 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1',
                          isSA
                            ? 'bg-indigo-300 cursor-not-allowed'
                            : eltEnabled
                            ? 'bg-indigo-600 hover:bg-indigo-700 cursor-pointer'
                            : 'bg-gray-200 hover:bg-gray-300 cursor-pointer',
                        ].join(' ')}
                      >
                        <span
                          className={[
                            'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200',
                            (eltEnabled || isSA) ? 'translate-x-5' : 'translate-x-0',
                          ].join(' ')}
                        />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
