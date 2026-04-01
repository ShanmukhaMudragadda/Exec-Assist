import { useState, useEffect, useCallback } from 'react'
import { api } from '@/services/api'

type PermissionState = 'default' | 'granted' | 'denied' | 'unsupported'

export interface UsePushNotificationsReturn {
  permissionState: PermissionState
  isSubscribed: boolean
  isLoading: boolean
  subscribe: () => Promise<boolean>   // returns true = subscribed, false = user cancelled/denied
  unsubscribe: () => Promise<void>
  isSupported: boolean
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

async function sendSubscriptionToBackend(subscription: PushSubscription): Promise<void> {
  const key = subscription.getKey('p256dh')
  const auth = subscription.getKey('auth')
  if (!key || !auth) throw new Error('Subscription keys missing')
  await api.post('/push/subscribe', {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: btoa(String.fromCharCode(...new Uint8Array(key))),
      auth: btoa(String.fromCharCode(...new Uint8Array(auth))),
    },
    userAgent: navigator.userAgent,
  })
}

export function usePushNotifications(): UsePushNotificationsReturn {
  const isSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window

  const [permissionState, setPermissionState] = useState<PermissionState>(
    isSupported ? (Notification.permission as PermissionState) : 'unsupported'
  )
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // Check current subscription state on mount
  useEffect(() => {
    if (!isSupported) return
    navigator.serviceWorker.getRegistrations().then((regs) => {
      if (!regs.length) return
      regs[0].pushManager.getSubscription().then((sub) => {
        setIsSubscribed(!!sub)
      })
    })
  }, [isSupported])

  // Listen for SW messages (subscription rotation + notification click navigation)
  useEffect(() => {
    if (!isSupported) return
    const handler = async (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_SUBSCRIPTION_CHANGED') {
        try {
          const sub = JSON.parse(event.data.subscription as string) as PushSubscription
          await sendSubscriptionToBackend(sub)
        } catch (err) {
          console.error('[push] re-register failed:', err)
        }
      }
      if (event.data?.type === 'NAVIGATE') {
        const url = event.data.url as string
        if (url && url !== window.location.pathname) {
          window.history.pushState(null, '', url)
          window.dispatchEvent(new PopStateEvent('popstate'))
        }
      }
    }
    navigator.serviceWorker.addEventListener('message', handler)
    return () => navigator.serviceWorker.removeEventListener('message', handler)
  }, [isSupported])

  // Returns: true = successfully subscribed, false = user cancelled/denied (not an error)
  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) throw new Error('Push notifications are not supported in this browser.')
    if (!window.isSecureContext) throw new Error('Push notifications require HTTPS. Access the app via localhost or a secure URL.')

    setIsLoading(true)
    try {
      // 1. Request permission
      const permission = await Notification.requestPermission()
      setPermissionState(permission as PermissionState)
      if (permission === 'denied') throw new Error('Notifications are blocked. Enable them in your browser settings and try again.')
      if (permission !== 'granted') return false  // user dismissed dialog — not an error

      // 2. Fetch VAPID public key
      let vapidKey: string
      try {
        const { data } = await api.get<{ key: string }>('/push/vapid-public-key')
        vapidKey = data.key
      } catch {
        throw new Error('Could not reach server. Is the backend running?')
      }

      const keyBytes = urlBase64ToUint8Array(vapidKey)
      const applicationServerKey = keyBytes.buffer.slice(
        keyBytes.byteOffset,
        keyBytes.byteOffset + keyBytes.byteLength
      ) as ArrayBuffer

      // 3. Get service worker registration
      const registrations = await navigator.serviceWorker.getRegistrations()
      if (!registrations.length) throw new Error('Service worker not found. Reload the page and try again.')
      const registration = registrations[0]

      // 4. Subscribe to push service
      let subscription: PushSubscription
      try {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        })
      } catch (err) {
        const e = err as Error
        if (e.name === 'NotAllowedError') throw new Error('Notification permission was denied.')
        if (e.name === 'AbortError') throw new Error('Push service unavailable. Check your internet connection.')
        throw new Error(`Subscription failed: ${e.message}`)
      }

      // 5. Save to backend
      await sendSubscriptionToBackend(subscription)
      setIsSubscribed(true)
      return true
    } finally {
      setIsLoading(false)
    }
  }, [isSupported])

  const unsubscribe = useCallback(async (): Promise<void> => {
    if (!isSupported) return
    setIsLoading(true)
    try {
      const registrations = await navigator.serviceWorker.getRegistrations()
      if (registrations.length) {
        const subscription = await registrations[0].pushManager.getSubscription()
        if (subscription) {
          await api.delete('/push/unsubscribe', { data: { endpoint: subscription.endpoint } })
          await subscription.unsubscribe()
        }
      }
      setIsSubscribed(false)
    } catch (err) {
      console.error('[push] unsubscribe failed:', err)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [isSupported])

  return { permissionState, isSubscribed, isLoading, subscribe, unsubscribe, isSupported }
}
