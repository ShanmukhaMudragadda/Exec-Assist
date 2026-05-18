import axios from 'axios'
import { auth } from './auth.js'

function getApiUrl(): string {
  const url = process.env.EASSIST_API_URL
  if (!url) throw new Error('EASSIST_API_URL environment variable is required')
  return url.replace(/\/$/, '')
}

async function headers() {
  const token = await auth.getValidToken()
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

export async function apiGet<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
  const res = await axios.get<T>(`${getApiUrl()}${path}`, { headers: await headers(), params })
  return res.data
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await axios.post<T>(`${getApiUrl()}${path}`, body, { headers: await headers() })
  return res.data
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  const res = await axios.patch<T>(`${getApiUrl()}${path}`, body, { headers: await headers() })
  return res.data
}

export async function apiDelete<T>(path: string, data?: unknown): Promise<T> {
  const res = await axios.delete<T>(`${getApiUrl()}${path}`, { headers: await headers(), data })
  return res.data
}
