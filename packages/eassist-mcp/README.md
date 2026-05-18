# eassist-mcp

MCP server for [EAssist](https://eassist.forsysinc.com) — query and manage actions & initiatives via Claude.

## Setup

Add to your Claude config (`claude_desktop_config.json` or MCP settings):

```json
{
  "mcpServers": {
    "eassist": {
      "command": "npx",
      "args": ["-y", "eassist-mcp"],
      "env": {
        "EASSIST_API_URL": "https://eassist.forsysinc.com"
      }
    }
  }
}
```

**That's it.** On first use, a browser window opens for Google login. Tokens are stored at `~/.eassist-mcp/auth.json` and refreshed automatically — you'll only ever log in once.

## What you can do

Just talk to Claude naturally:

- *"What are the overdue actions?"*
- *"What is Srini working on?"*
- *"Create an action: Review Q2 budget, assign to Arpit, due June 15"*
- *"Mark action abc123 as complete"*
- *"Give me the executive summary"*
- *"Show me all actions in the JananiMitra initiative"*
- *"List all members"*

## Available Tools (20)

### Read / Reporting
| Tool | Description |
|------|-------------|
| `get_overdue_actions` | All overdue actions across the org |
| `get_user_actions` | Actions assigned to a specific person |
| `get_executive_summary` | Full ELT dashboard — workload, risks, stale actions |
| `get_executive_brief` | Short executive brief |
| `search_actions` | Keyword search across all actions |
| `get_action_detail` | Full detail + comments for one action |
| `list_initiatives` | All initiatives with status and progress |
| `get_initiative_report` | Initiative detail + all its actions |
| `list_members` | All members across all initiatives |

### Create / Update / Delete
| Tool | Description |
|------|-------------|
| `create_action` | Create a new action (optional: link to initiative) |
| `update_action` | Update title, status, priority, due date, assignees |
| `complete_action` | Mark an action as completed |
| `assign_action` | Assign/reassign an action |
| `delete_action` | Delete an action permanently |
| `bulk_update_actions` | Update multiple actions at once |
| `add_comment` | Add a comment/update to an action |
| `create_initiative` | Create a new initiative |

### Auth / Utility
| Tool | Description |
|------|-------------|
| `whoami` | Show logged-in user and API URL |
| `logout` | Clear stored tokens (triggers re-login on next call) |
| `refresh_cache` | Force fresh fetch of members and initiatives |

## Auth details

- Tokens stored at: `~/.eassist-mcp/auth.json`
- Access token: 7-day JWT, auto-refreshed silently
- Refresh token: 30-day, rotated on each refresh
- If both expire: browser re-opens automatically

## Requirements

- Node.js 18+
- Access to [eassist.forsysinc.com](https://eassist.forsysinc.com)
