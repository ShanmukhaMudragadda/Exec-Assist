import { useAuthStore } from '@/store/authStore'

/** External (password sign-in) users — no AI features, no initiative creation, no standalone actions. */
export function useIsExternal(): boolean {
  return useAuthStore((s) => s.user?.isExternal) ?? false
}
