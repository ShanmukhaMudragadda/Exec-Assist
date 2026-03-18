import { io, Socket } from 'socket.io-client'
import AsyncStorage from '@react-native-async-storage/async-storage'

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000'

let socket: Socket | null = null

export const getSocket = (): Socket => {
  if (!socket) {
    socket = io(API_URL, {
      autoConnect: false,
      transports: ['websocket'],
    })
  }
  return socket
}

export const connectSocket = async (): Promise<void> => {
  const token = await AsyncStorage.getItem('token')
  const s = getSocket()
  if (!s.connected) {
    s.auth = { token }
    s.connect()
  }
}

export const disconnectSocket = (): void => {
  if (socket?.connected) {
    socket.disconnect()
  }
}

export const joinWorkspaceRoom = (workspaceId: string): void => {
  getSocket().emit('join:workspace', workspaceId)
}

export const leaveWorkspaceRoom = (workspaceId: string): void => {
  getSocket().emit('leave:workspace', workspaceId)
}
