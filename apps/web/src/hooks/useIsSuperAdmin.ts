import { useAuthStore } from '@/store/authStore'

export function useIsSuperAdmin(): boolean {
  return useAuthStore((s) => s.user?.role === 'superadmin') ?? false
}
