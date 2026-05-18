import { apiGet } from './client.js'
import type { Initiative, Member } from './types.js'

// Cache members for the session to avoid repeated API calls
let memberCache: { id: string; name: string; email: string }[] | null = null
let initiativeCache: { id: string; title: string }[] | null = null

async function getMembers(): Promise<{ id: string; name: string; email: string }[]> {
  if (memberCache) return memberCache
  const data = await apiGet<{ initiatives: Initiative[] }>('/initiatives')
  const seen = new Set<string>()
  const members: { id: string; name: string; email: string }[] = []
  for (const init of data.initiatives) {
    try {
      const m = await apiGet<{ members: Member[] }>(`/initiatives/${init.id}/members`)
      for (const member of m.members) {
        if (!seen.has(member.user.id)) {
          seen.add(member.user.id)
          members.push({ id: member.user.id, name: member.user.name, email: member.user.email })
        }
      }
    } catch { /* skip inaccessible */ }
  }
  memberCache = members
  return members
}

async function getInitiatives(): Promise<{ id: string; title: string }[]> {
  if (initiativeCache) return initiativeCache
  const data = await apiGet<{ initiatives: Initiative[] }>('/initiatives')
  initiativeCache = data.initiatives.map(i => ({ id: i.id, title: i.title }))
  return initiativeCache
}

export function fuzzyMatch(query: string, name: string): boolean {
  const q = query.toLowerCase()
  const n = name.toLowerCase()
  return n.includes(q) || q.includes(n)
}

export async function resolveUser(name: string): Promise<{ id: string; name: string } | { error: string }> {
  const members = await getMembers()
  const matches = members.filter(m => fuzzyMatch(name, m.name) || fuzzyMatch(name, m.email))
  if (matches.length === 1) return matches[0]
  if (matches.length === 0) return { error: `No user found matching "${name}". Use list_members to see available users.` }
  return { error: `Multiple users match "${name}": ${matches.map(m => m.name).join(', ')}. Please be more specific.` }
}

export async function resolveInitiative(name: string): Promise<{ id: string; title: string } | { error: string }> {
  const inits = await getInitiatives()
  const matches = inits.filter(i => fuzzyMatch(name, i.title))
  if (matches.length === 1) return matches[0]
  if (matches.length === 0) return { error: `No initiative found matching "${name}". Use list_initiatives to see available initiatives.` }
  if (matches.length <= 5) return { error: `Multiple initiatives match "${name}": ${matches.map(i => i.title).join(', ')}. Please be more specific.` }
  return { error: `Too many initiatives match "${name}". Please be more specific.` }
}

export function clearCache(): void {
  memberCache = null
  initiativeCache = null
}
