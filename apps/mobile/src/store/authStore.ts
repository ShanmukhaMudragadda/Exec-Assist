import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { User } from '../types'

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  setAuth: (user: User, token: string) => Promise<void>
  setUser: (user: User) => void
  logout: () => Promise<void>
  loadStoredAuth: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,

  setAuth: async (user, token) => {
    await AsyncStorage.setItem('token', token)
    await AsyncStorage.setItem('user', JSON.stringify(user))
    set({ user, token, isAuthenticated: true })
  },

  setUser: (user) => set({ user }),

  logout: async () => {
    await AsyncStorage.removeItem('token')
    await AsyncStorage.removeItem('user')
    set({ user: null, token: null, isAuthenticated: false })
  },

  loadStoredAuth: async () => {
    try {
      const token = await AsyncStorage.getItem('token')
      const userStr = await AsyncStorage.getItem('user')
      if (token && userStr) {
        const user = JSON.parse(userStr) as User
        set({ user, token, isAuthenticated: true })
      }
    } catch {
      // Storage read failed — stay unauthenticated
    }
  },
}))
