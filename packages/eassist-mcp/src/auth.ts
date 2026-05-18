import fs from 'fs'
import os from 'os'
import path from 'path'
import http from 'http'
import { URL } from 'url'
import axios from 'axios'
import type { AuthData } from './types.js'

const CONFIG_DIR = path.join(os.homedir(), '.eassist-mcp')
const CONFIG_FILE = path.join(CONFIG_DIR, 'auth.json')

class AuthManager {
  private data: AuthData | null = null

  private load(): AuthData | null {
    try {
      if (!fs.existsSync(CONFIG_FILE)) return null
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) as AuthData
    } catch {
      return null
    }
  }

  private store(data: AuthData): void {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf-8')
    this.data = data
  }

  private isExpired(expiresAt: string): boolean {
    // Add 60s buffer so we refresh before actual expiry
    return new Date(expiresAt).getTime() - 60_000 < Date.now()
  }

  private getApiUrl(): string {
    const url = process.env.EASSIST_API_URL ?? this.data?.apiUrl
    if (!url) throw new Error('EASSIST_API_URL environment variable is required')
    return url.replace(/\/$/, '')
  }

  async getValidToken(): Promise<string> {
    if (!this.data) this.data = this.load()

    // Valid access token
    if (this.data?.accessToken && !this.isExpired(this.data.expiresAt)) {
      return this.data.accessToken
    }

    // Try refresh
    if (this.data?.refreshToken) {
      try {
        const apiUrl = this.getApiUrl()
        const res = await axios.post(`${apiUrl}/auth/refresh`, { refreshToken: this.data.refreshToken })
        const { token, refreshToken, expiresAt } = res.data as { token: string; refreshToken: string; expiresAt: string }
        this.store({ ...this.data, accessToken: token, refreshToken, expiresAt })
        return token
      } catch {
        // Refresh failed — fall through to OAuth
      }
    }

    // Full OAuth flow
    await this.triggerOAuthFlow()
    return this.data!.accessToken
  }

  async triggerOAuthFlow(): Promise<void> {
    const apiUrl = this.getApiUrl()
    const port = await this.findFreePort()

    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        try {
          const url = new URL(req.url ?? '/', `http://localhost:${port}`)
          if (url.pathname !== '/callback') {
            res.end()
            return
          }

          const token = url.searchParams.get('token')
          const refreshToken = url.searchParams.get('refreshToken')
          const expiresAt = url.searchParams.get('expiresAt')
          const name = url.searchParams.get('name') ?? undefined
          const email = url.searchParams.get('email') ?? undefined

          if (!token || !refreshToken || !expiresAt) {
            res.end('Missing auth params')
            reject(new Error('OAuth callback missing params'))
            server.close()
            return
          }

          this.store({ apiUrl, accessToken: token, refreshToken, expiresAt, name, email })

          res.writeHead(200, { 'Content-Type': 'text/plain' })
          res.end('OK')
          server.close()
          resolve()
        } catch (err) {
          server.close()
          reject(err)
        }
      })

      server.listen(port, '127.0.0.1', async () => {
        const authUrl = `${apiUrl}/auth/mcp?port=${port}`
        console.error(`\n[eassist-mcp] Opening browser for authentication...\n${authUrl}\n`)
        try {
          const { default: open } = await import('open')
          await open(authUrl)
        } catch {
          console.error('[eassist-mcp] Could not open browser automatically. Please open the URL above manually.')
        }
      })

      server.on('error', reject)

      // Timeout after 5 minutes
      setTimeout(() => {
        server.close()
        reject(new Error('Authentication timed out. Please try again.'))
      }, 5 * 60 * 1000)
    })
  }

  private findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = http.createServer()
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address()
        server.close(() => {
          if (addr && typeof addr === 'object') resolve(addr.port)
          else reject(new Error('Could not find free port'))
        })
      })
    })
  }

  getStoredName(): string {
    return this.data?.name ?? this.data?.email ?? 'Unknown'
  }

  clearTokens(): void {
    try {
      if (fs.existsSync(CONFIG_FILE)) fs.unlinkSync(CONFIG_FILE)
    } catch { /* ignore */ }
    this.data = null
  }
}

export const auth = new AuthManager()
