import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
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
    return new Date(expiresAt).getTime() - 60_000 < Date.now()
  }

  private getApiUrl(): string {
    return (process.env.EASSIST_API_URL ?? this.data?.apiUrl ?? 'https://eassist.forsysinc.com').replace(/\/$/, '')
  }

  async getValidToken(): Promise<string> {
    if (!this.data) this.data = this.load()

    if (this.data?.accessToken && !this.isExpired(this.data.expiresAt)) {
      return this.data.accessToken
    }

    if (this.data?.refreshToken) {
      try {
        const apiUrl = this.getApiUrl()
        const res = await axios.post(`${apiUrl}/api/auth/refresh`, { refreshToken: this.data.refreshToken })
        const { token, refreshToken, expiresAt } = res.data as { token: string; refreshToken: string; expiresAt: string }
        this.store({ ...this.data, accessToken: token, refreshToken, expiresAt })
        return token
      } catch {
        // Refresh failed — fall through to OAuth
      }
    }

    await this.triggerOAuthFlow()
    return this.data!.accessToken
  }

  async triggerOAuthFlow(): Promise<void> {
    const apiUrl = this.getApiUrl()
    const sessionId = crypto.randomBytes(16).toString('hex')

    const authUrl = `${apiUrl}/api/auth/mcp?session_id=${sessionId}`

    console.error('\n' + '='.repeat(60))
    console.error('  EAssist Authentication Required')
    console.error('='.repeat(60))
    console.error('\n  Open this URL in your browser to sign in:\n')
    console.error(`  ${authUrl}\n`)
    console.error('  (If the browser opens automatically, complete sign-in there)')
    console.error('='.repeat(60) + '\n')

    try {
      const { default: open } = await import('open')
      await open(authUrl)
    } catch {
      // URL already printed above — user can copy-paste it
    }

    // Poll the backend until it has the token (user completes OAuth in browser)
    const pollUrl = `${apiUrl}/api/auth/mcp/result?session_id=${sessionId}`
    const deadline = Date.now() + 5 * 60 * 1000

    while (Date.now() < deadline) {
      await new Promise<void>(r => setTimeout(r, 2000))
      try {
        const res = await axios.get<{
          token: string
          refreshToken: string
          expiresAt: string
          name: string
          email: string
        }>(pollUrl)
        const { token, refreshToken, expiresAt, name, email } = res.data
        this.store({ apiUrl, accessToken: token, refreshToken, expiresAt, name, email })
        return
      } catch {
        // 404 = not ready yet, any other error = retry
      }
    }

    throw new Error('Authentication timed out. Please try again.')
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
