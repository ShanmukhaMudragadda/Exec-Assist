import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

export interface WorkspaceMemberForAI {
  id: string;
  name: string;
  profile?: string | null; // department / role e.g. "engineering", "presales"
}

export interface ExtractedTask {
  title: string;
  description?: string;
  category?: string;
  tags: string[];
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status?: 'todo' | 'in-progress' | 'in-review' | 'completed';
  dueDate?: string | null;
  assigneeIds: string[]; // user IDs from the provided member list
}

export interface AISettings {
  autoAssignOwners?: boolean;      // Use member list to assign tasks to named people
  includeDeadlines?: boolean;      // Extract deadlines from transcript
  priorityDetection?: boolean;     // AI infers priority from language signals
  executiveFocus?: boolean;        // Focus on strategic/CEO-level actions only
}

export async function extractTasksFromTranscript(
  transcriptContent: string,
  members: WorkspaceMemberForAI[] = [],
  settings: AISettings = {}
): Promise<ExtractedTask[]> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured. Add it to your .env file.');
  }

  // Build the members context block for the prompt
  const membersContext = members.length > 0
    ? `
WORKSPACE MEMBERS (use these to assign tasks):
${members.map((m) => `- id: "${m.id}", name: "${m.name}", department/profile: "${m.profile || 'unspecified'}"`).join('\n')}

ASSIGNMENT RULES:
1. Name mention: If the transcript explicitly mentions a person's name in context of doing a task (e.g. "John will handle this", "assign to Sarah", "Bob needs to fix", "this is for Alice"), set assigneeIds to that person's id from the list above. Match names case-insensitively and by first name or full name.
2. Profile/department match: If no name is mentioned but the task clearly belongs to a specific domain (e.g. an engineering/coding task → assign to members whose profile is "engineering"; a sales/client proposal task → assign to members with "presales" profile; a design task → "design" profile, etc.). Match the task's category/domain to the profile that best fits.
3. Multiple assignees: If multiple people are mentioned or the task fits multiple profiles, include all matching ids.
4. No match: If no name is mentioned and no profile clearly matches, return assigneeIds as an empty array [].
`
    : `
No workspace members provided. Return assigneeIds as [] for all tasks.
`;

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // Build settings modifiers
  const settingsInstructions: string[] = [];
  if (settings.autoAssignOwners === false) {
    settingsInstructions.push('- DO NOT assign owners — return assigneeIds as [] for all tasks.');
  }
  if (settings.includeDeadlines === false) {
    settingsInstructions.push('- DO NOT extract deadlines — return dueDate as null for all tasks.');
  }
  if (settings.priorityDetection === false) {
    settingsInstructions.push('- Set priority to "medium" for all tasks regardless of urgency signals.');
  }
  if (settings.executiveFocus === true) {
    settingsInstructions.push('- Only extract strategic, executive-level actions (decisions, approvals, key deliverables). Exclude minor operational tasks.');
  }
  const settingsBlock = settingsInstructions.length > 0
    ? `\nSETTINGS OVERRIDES:\n${settingsInstructions.join('\n')}\n`
    : '';

  const prompt = `You are an executive assistant. Today's date is ${today}. Analyze this meeting transcript and extract all actionable tasks.
${settingsBlock}
${membersContext}
For each task return these fields:

- title: Clear, specific action (max 100 chars)
- description: More detail about what needs to be done
- category: One of [Feature, Bug, Documentation, Meeting Note, Decision, Action Item, Follow-up, Engineering, Design, Presales, Sales, Marketing, HR, Finance, Legal, Operations]
- tags: Relevant tags for filtering (array of strings)

- priority: MUST be one of "urgent", "high", "medium", or "low". Infer from context:
  • "urgent" — words/phrases like: crucial, critical, blocker, ASAP, right away, immediately, top priority, must be done today, cannot wait, show-stopper
  • "high" — words/phrases like: important, high priority, needs to happen soon, key deliverable, significant, pressing, this week, major
  • "medium" — words/phrases like: should do, needed, planned, normal priority, next sprint, follow up (no urgency signal)
  • "low" — words/phrases like: nice to have, when possible, low priority, someday, no rush, minor, optional
  If no signal is present, default to "medium".

- dueDate: Today is ${today}. Extract deadline if mentioned. Return as YYYY-MM-DD. Rules:
  • Explicit dates: "June 15", "15th", "2024-06-15" → convert to YYYY-MM-DD
  • Relative dates: "tomorrow" → ${new Date(Date.now() + 86400000).toISOString().split('T')[0]}, "end of this week" / "by Friday" → upcoming Friday, "next week" → 7 days from today, "end of month" → last day of current month, "next Monday" → upcoming Monday, "in 2 weeks" → 14 days from today, etc.
  • If no due date is mentioned → null

- assigneeIds: Array of member ids from the workspace member list above. Follow the assignment rules strictly.

Return ONLY a valid JSON array with no markdown, no explanation, no code blocks.

Transcript:
---
${transcriptContent}
---

JSON Array:`;

  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Strip markdown code fences if present
    const cleaned = responseText.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();

    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const raw = JSON.parse(jsonMatch[0]) as ExtractedTask[];
      const validIds = new Set(members.map((m) => m.id));

      return raw.map((task) => ({
        title: task.title || 'Untitled Task',
        description: task.description,
        category: task.category,
        tags: Array.isArray(task.tags) ? task.tags : [],
        priority: (['low', 'medium', 'high', 'urgent'].includes(task.priority)
          ? task.priority
          : 'medium') as ExtractedTask['priority'],
        dueDate: task.dueDate || null,
        // Only keep IDs that actually exist in the workspace member list
        assigneeIds: Array.isArray(task.assigneeIds)
          ? task.assigneeIds.filter((id) => typeof id === 'string' && validIds.has(id))
          : [],
      }));
    }

    console.warn('No valid JSON array in Gemini response:', responseText.slice(0, 300));
    return [];
  } catch (error) {
    console.error('Gemini extractTasksFromTranscript error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to extract tasks: ${msg}`);
  }
}

export async function extractTasksFromExcel(
  sheetsText: string,
  members: WorkspaceMemberForAI[] = []
): Promise<ExtractedTask[]> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  const membersContext = members.length > 0
    ? `
WORKSPACE MEMBERS (use these to assign tasks):
${members.map((m) => `- id: "${m.id}", name: "${m.name}", department/profile: "${m.profile || 'unspecified'}"`).join('\n')}

ASSIGNMENT RULES:
1. If a cell value in the spreadsheet matches or closely resembles a member's name, set assigneeIds to that member's id.
2. If no name matches but the task domain matches a member's profile (engineering/presales/design/etc.), assign by profile.
3. If no match, return assigneeIds as [].
`
    : `No workspace members provided. Return assigneeIds as [] for all tasks.`;

  const today = new Date().toISOString().split('T')[0];

  const prompt = `You are an expert project manager. Today's date is ${today}.

Below is data extracted from a spreadsheet. Your job is to understand each row as a task and return rich, complete task data — not just copy column values, but also INFER and GENERATE missing fields using context from the row.

STEP 1 — MAP columns (case-insensitive, flexible naming):
- Title: "Task", "Title", "Name", "Item", "Action", "Task Name", "Action Item"
- Description: "Description", "Details", "Notes", "Summary", "Context", "Comments"
- Priority: "Priority", "Urgency", "Importance", "Severity", "P0/P1/P2/P3"
- Due date: "Due Date", "Deadline", "Target Date", "Due", "ETA", "Completion Date"
- Assignee: "Assigned To", "Owner", "Responsible", "Assignee", "Person", "Who"
- Status: "Status", "State", "Stage"
- Tags: "Tags", "Labels", "Keywords", "Category", "Type", "Area"
${membersContext}

STEP 2 — GENERATE missing fields (same as you would from a transcript):
- description: If no description column exists or the cell is empty, write 2-3 sentences describing what this task involves and why it matters, based on the title and any other cell values in the row. Never leave description empty.
- tags: If no tags column exists or it is empty, generate 2-4 relevant tags based on the task title and description (e.g. "engineering", "design", "frontend", "urgent-fix", "client-facing", "documentation"). Always return at least 1 tag.
- priority: If no priority column, infer from language in the title/description:
  • "urgent" → critical, blocker, ASAP, P0, show-stopper
  • "high" → important, P1, major, significant, this week
  • "medium" → normal, P2, planned (default)
  • "low" → nice-to-have, P3, minor, optional

STEP 3 — DATE HANDLING:
Convert any date value to YYYY-MM-DD. For relative expressions calculate from today (${today}). Return null if no date found.

STEP 4 — STATUS MAPPING:
Map to exactly one of: "todo" | "in-progress" | "in-review" | "completed". Default "todo" if unclear.

For each data row (skip header, blank, and summary rows) return ALL of these fields:
- title (string, required — concise action phrase)
- description (string, required — generate if not in sheet)
- priority: "urgent" | "high" | "medium" | "low"
- status: "todo" | "in-progress" | "in-review" | "completed"
- dueDate: YYYY-MM-DD or null
- assigneeIds: string array of member IDs (empty array [] if no match)
- tags: string array — ALWAYS include at least 1 tag, generate from context if not in sheet
- category (string, optional)

Return ONLY a valid JSON array. No markdown, no explanation, no code blocks.

Spreadsheet data:
---
${sheetsText}
---

JSON Array:`;

  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    const cleaned = responseText.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const raw = JSON.parse(jsonMatch[0]) as ExtractedTask[];
      const validIds = new Set(members.map((m) => m.id));
      return raw.map((task) => ({
        title: task.title || 'Untitled Task',
        description: task.description,
        category: task.category,
        tags: Array.isArray(task.tags) ? task.tags : [],
        priority: (['low', 'medium', 'high', 'urgent'].includes(task.priority)
          ? task.priority : 'medium') as ExtractedTask['priority'],
        status: (['todo', 'in-progress', 'in-review', 'completed'].includes(task.status ?? '')
          ? task.status : 'todo') as ExtractedTask['status'],
        dueDate: task.dueDate || null,
        assigneeIds: Array.isArray(task.assigneeIds)
          ? task.assigneeIds.filter((id) => typeof id === 'string' && validIds.has(id))
          : [],
      }));
    }
    console.warn('No valid JSON array in Gemini response for Excel:', responseText.slice(0, 300));
    return [];
  } catch (error) {
    console.error('Gemini extractTasksFromExcel error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to extract tasks from Excel: ${msg}`);
  }
}

export interface BriefContext {
  userName: string;
  initiatives: { title: string; status: string; progress: number; actionCount: number; overdueCount: number }[];
  totalActions: number;
  openActions: number;
  overdueActions: number;
  urgentActions: number;
  completedToday: number;
  dueToday: number;
}

export async function generateExecutiveBrief(ctx: BriefContext): Promise<{ headline: string; detail: string; metric: string | null; type: string }[]> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  const prompt = `You are a senior executive assistant writing a morning briefing for ${ctx.userName}. Write in the style of a high-quality newspaper — clear, direct, authoritative prose.

Current snapshot:
- Open actions: ${ctx.openActions}
- Overdue actions: ${ctx.overdueActions}
- Urgent actions: ${ctx.urgentActions}
- Due today: ${ctx.dueToday}
- Completed today: ${ctx.completedToday}
- Total initiatives: ${ctx.initiatives.length}

Initiatives breakdown:
${ctx.initiatives.map((i) => `- "${i.title}" — ${i.status}, ${i.progress}% complete, ${i.actionCount} actions, ${i.overdueCount} overdue`).join('\n')}

Return ONLY a JSON array of exactly 2 objects — the two highest-signal items only. Each object:
- "headline": a short, punchy newspaper-style headline in Title Case (5–8 words). Should read like a front-page headline — bold and declarative.
- "detail": 2 sentences of editorial prose. First sentence states the situation clearly with specifics (name initiatives, counts, owners where known). Second sentence gives context or a recommended action.
- "metric": null (not used in this format)
- "type": "critical" | "warning" | "success" | "info"

Type rules:
- "critical" → overdue items, blockers, missed deadlines, stalled initiatives
- "warning" → at-risk, due soon, low progress, urgent but not yet overdue
- "success" → completed work, on-track initiatives, strong momentum
- "info" → general portfolio status, neutral observations

Example (do NOT copy verbatim — generate from real data):
[
  { "headline": "Three Overdue Actions Demand Immediate Attention", "metric": null, "detail": "Product Launch and Q2 Planning each have overdue items that remain unaddressed. Ownership should be reassigned or escalated before further slippage occurs.", "type": "critical" },
  { "headline": "Q3 Roadmap Holds Steady at 72 Percent", "metric": null, "detail": "The Q3 Roadmap initiative continues on schedule with no open blockers reported this sprint. Momentum is strong and the team is tracking to hit the milestone on time.", "type": "success" }
]

Rules:
- Valid JSON array ONLY — no markdown fences, no extra text outside the array
- Skip insights where the underlying count is zero
- Use initiative titles by name when referencing specific work
- Prioritise critical and warning items first, success and info last
- Write for a senior executive — no jargon, no padding, every word earns its place`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  try {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]) as { headline: string; detail: string; metric: string | null; type: string }[];
  } catch {}
  return [{ headline: 'Daily Brief', detail: text, metric: null, type: 'info' }];
}

export interface DigestAction {
  actionNumber?: number | null;
  title: string;
  status: string;
  priority: string;
  assigneeName: string | null;
  dueDate: string | null;
  isOverdue: boolean;
  daysSinceUpdate: number;
}

export async function generateDailyDigestReport(
  initiativeTitle: string,
  actions: DigestAction[]
): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured.');

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  const today = new Date().toISOString().split('T')[0];
  const stale = actions.filter((a) => a.daysSinceUpdate >= 3 && a.status !== 'completed');
  const overdue = actions.filter((a) => a.isOverdue);
  const completed = actions.filter((a) => a.status === 'completed');
  const inProgress = actions.filter((a) => a.status === 'in-progress');
  const todo = actions.filter((a) => a.status === 'todo');

  const prompt = `You are a senior project manager. Write a 2-3 sentence executive insight for the daily report of initiative "${initiativeTitle}" as of ${today}.

Data:
- Total: ${actions.length} actions | Completed: ${completed.length} | In Progress: ${inProgress.length} | To Do: ${todo.length}
- Overdue: ${overdue.length} | Stale (3+ days no update): ${stale.length}
- Overdue items: ${overdue.map((a) => `"${a.title}" (${a.assigneeName || 'Unassigned'})`).join(', ') || 'none'}
- Stale items: ${stale.map((a) => `"${a.title}" — ${a.daysSinceUpdate}d`).join(', ') || 'none'}
- In progress: ${inProgress.map((a) => `"${a.title}" (${a.assigneeName || 'Unassigned'})`).join(', ') || 'none'}

Write ONLY plain text — 2-3 sharp, direct sentences. No HTML, no bullet points, no headings. Focus on what needs attention and overall health. Be specific about action names and owners.`;

  const result = await model.generateContent(prompt);
  return result.response.text().trim().replace(/```[a-z]*/gi, '').replace(/```/g, '');
}
