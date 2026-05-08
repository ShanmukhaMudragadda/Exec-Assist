import { useAuthStore } from '@/store/authStore'

export function useFeatureFlag(feature: string): boolean {
  const user = useAuthStore((s) => s.user)
  return user?.featureFlags?.find((f) => f.feature === feature)?.enabled ?? false
}
