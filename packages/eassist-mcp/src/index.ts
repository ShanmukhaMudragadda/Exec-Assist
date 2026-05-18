#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { auth } from './auth.js'
import { reportingToolSchemas, handleReportingTool } from './tools/reporting.js'
import { actionToolSchemas, handleActionTool } from './tools/actions.js'
import { initiativeToolSchemas, handleInitiativeTool } from './tools/initiatives.js'
import { clearCache } from './resolve.js'

const server = new McpServer({
  name: 'eassist-mcp',
  version: '1.0.0',
})

const allTools = [
  ...reportingToolSchemas,
  ...actionToolSchemas,
  ...initiativeToolSchemas,
  {
    name: 'whoami',
    description: 'Returns the currently authenticated user and the API URL in use.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'logout',
    description: 'Log out of EAssist — clears stored tokens. Next tool call will prompt for login again.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'refresh_cache',
    description: 'Clear the in-memory member and initiative cache so the next lookup fetches fresh data.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
]

type PropDef = { type: string; enum?: string[]; items?: unknown; description?: string }
type ToolSchema = { properties?: Record<string, PropDef> }

function buildZodShape(schema: ToolSchema): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {}
  if (!schema.properties) return shape
  for (const [key, prop] of Object.entries(schema.properties)) {
    if (prop.enum) {
      shape[key] = z.enum(prop.enum as [string, ...string[]]).optional()
    } else if (prop.type === 'number') {
      shape[key] = z.number().optional()
    } else if (prop.type === 'array') {
      shape[key] = z.array(z.string()).optional()
    } else {
      shape[key] = z.string().optional()
    }
  }
  return shape
}

const reportingNames = new Set(reportingToolSchemas.map(t => t.name))
const actionNames = new Set(actionToolSchemas.map(t => t.name))
const initiativeNames = new Set(initiativeToolSchemas.map(t => t.name))

for (const tool of allTools) {
  const zodShape = buildZodShape(tool.inputSchema as ToolSchema)

  server.tool(
    tool.name,
    tool.description,
    zodShape,
    async (args) => {
      try {
        const rawArgs = args as Record<string, unknown>
        let text: string

        if (reportingNames.has(tool.name)) {
          text = await handleReportingTool(tool.name, rawArgs)
        } else if (actionNames.has(tool.name)) {
          text = await handleActionTool(tool.name, rawArgs)
        } else if (initiativeNames.has(tool.name)) {
          text = await handleInitiativeTool(tool.name, rawArgs)
        } else if (tool.name === 'whoami') {
          const name = auth.getStoredName()
          const apiUrl = process.env.EASSIST_API_URL ?? 'not set'
          text = `**Logged in as:** ${name}\n**API:** ${apiUrl}`
        } else if (tool.name === 'logout') {
          auth.clearTokens()
          text = 'Logged out. Stored tokens cleared. Next tool call will prompt for login.'
        } else if (tool.name === 'refresh_cache') {
          clearCache()
          text = 'Cache cleared.'
        } else {
          text = `Unknown tool: ${tool.name}`
        }

        return { content: [{ type: 'text' as const, text }] }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        return { content: [{ type: 'text' as const, text: `Error: ${msg}` }], isError: true }
      }
    },
  )
}

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('[eassist-mcp] Server started. Waiting for requests...')
}

main().catch(err => {
  console.error('[eassist-mcp] Fatal error:', err)
  process.exit(1)
})
