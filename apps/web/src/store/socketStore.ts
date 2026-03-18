import { create } from 'zustand'
import { io, Socket } from 'socket.io-client'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000'

interface SocketState {
  socket: Socket | null
  connect: () => void
  disconnect: () => void
  joinWorkspace: (workspaceId: string) => void
  leaveWorkspace: (workspaceId: string) => void
}

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  connect: () => {
    const socket = io(SOCKET_URL, {
      auth: { token: localStorage.getItem('token') },
    })
    set({ socket })
  },
  disconnect: () => {
    const { socket } = get()
    socket?.disconnect()
    set({ socket: null })
  },
  joinWorkspace: (workspaceId) => {
    const { socket } = get()
    socket?.emit('join-workspace', workspaceId)
  },
  leaveWorkspace: (workspaceId) => {
    const { socket } = get()
    socket?.emit('leave-workspace', workspaceId)
  },
}))
