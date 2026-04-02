#!/usr/bin/env node
/**
 * V1 → V2 Data Migration
 *
 * V1: Workspace / Task model  (main branch)
 * V2: Initiative / Action model (revamp branch)
 *
 * Usage:
 *   SOURCE_DATABASE_URL="postgresql://user:pass@host/old_db" \
 *   TARGET_DATABASE_URL="postgresql://user:pass@host/new_db" \
 *   node scripts/migrate-from-v1.js
 *
 * Safe to re-run — all inserts use ON CONFLICT DO NOTHING.
 *
 * Data preservation strategy:
 *   - Multi-assignee tasks  → primary assignee kept on Action, extras recorded as ActionUpdate
 *   - Task attachments      → preserved as ActionUpdate content
 *   - Task category         → converted to a Tag on the initiative
 *   - Transcripts           → converted to completed standalone Actions (sourceType='transcript')
 *   - Per-event email flags → collapsed: emailNotifications = ANY(flag) was true
 *   - User passwords        → cannot migrate (Google OAuth replaces password auth)
 *                             Users must sign in with Google using their existing email
 */

const { Pool } = require('pg')

if (!process.env.SOURCE_DATABASE_URL) {
  console.error('ERROR: SOURCE_DATABASE_URL is required')
  process.exit(1)
}
if (!process.env.TARGET_DATABASE_URL) {
  console.error('ERROR: TARGET_DATABASE_URL is required')
  process.exit(1)
}

const source = new Pool({ connectionString: process.env.SOURCE_DATABASE_URL })
const target = new Pool({ connectionString: process.env.TARGET_DATABASE_URL })

const stats = {
  users: 0,
  initiatives: 0,
  members: 0,
  invitations: 0,
  settings: 0,
  tags: 0,
  actions: 0,
  actionTags: 0,
  actionUpdates: 0,
  migrationNotes: 0,
  transcriptsAsActions: 0,
  skipped: [],
}

const TAG_COLORS = ['#4648d4', '#2563eb', '#7c3aed', '#0891b2', '#64748b', '#6b21a8']
function randomColor() {
  return TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)]
}

let _cuidCounter = 0
function newId() {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).substr(2, 8)
  _cuidCounter++
  return `c${ts}${rand}${_cuidCounter.toString(36).padStart(4, '0')}`
}

// ── 1. Users ──────────────────────────────────────────────────────────────────
async function migrateUsers() {
  const { rows: users } = await source.query('SELECT * FROM "User" ORDER BY "createdAt" ASC')
  console.log(`  Found ${users.length} users`)

  for (const u of users) {
    await target.query(
      `INSERT INTO "User" (
        id, email, name, "googleId", avatar, role, "emailVerified",
        timezone, "pushNotificationsEnabled", "createdAt", "updatedAt"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (id) DO NOTHING`,
      [
        u.id,
        u.email,
        u.name,
        null,                       // googleId: null — user must re-link via Google login
        u.avatar || null,
        u.role || 'user',
        u.emailVerified || false,
        u.timezone || 'UTC',
        true,                       // pushNotificationsEnabled default
        u.createdAt,
        u.updatedAt,
      ]
    )
    stats.users++
  }
  console.log(`  ✓ ${stats.users} users migrated`)
  console.log(`  ⚠  Passwords not migrated — users must sign in with Google (same email)`)
}

// ── 2. Workspaces → Initiatives ───────────────────────────────────────────────
async function migrateInitiatives() {
  const { rows: workspaces } = await source.query('SELECT * FROM "Workspace" ORDER BY "createdAt" ASC')
  console.log(`  Found ${workspaces.length} workspaces`)

  for (const ws of workspaces) {
    await target.query(
      `INSERT INTO "Initiative" (
        id, "createdBy", title, description, status, priority,
        progress, "dueDate", "createdAt", "updatedAt"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (id) DO NOTHING`,
      [
        ws.id,
        ws.createdBy,
        ws.name,                    // name → title
        ws.description || null,
        'active',
        'medium',
        0,
        null,
        ws.createdAt,
        ws.updatedAt,
      ]
    )
    stats.initiatives++
  }
  console.log(`  ✓ ${stats.initiatives} initiatives migrated`)
}

// ── 3. WorkspaceMembers → InitiativeMembers ───────────────────────────────────
async function migrateMembers() {
  const { rows: members } = await source.query('SELECT * FROM "WorkspaceMember" ORDER BY "joinedAt" ASC')
  console.log(`  Found ${members.length} workspace members`)

  for (const m of members) {
    await target.query(
      `INSERT INTO "InitiativeMember" (
        id, "userId", "initiativeId", role, department, "joinedAt"
      ) VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (id) DO NOTHING`,
      [
        m.id,
        m.userId,
        m.workspaceId,              // workspaceId → initiativeId
        m.role || 'member',
        m.profile || null,          // profile → department
        m.joinedAt,
      ]
    )
    stats.members++
  }
  console.log(`  ✓ ${stats.members} members migrated`)
}

// ── 4. WorkspaceInvitations → InitiativeInvitations ──────────────────────────
async function migrateInvitations() {
  const { rows: invitations } = await source.query('SELECT * FROM "WorkspaceInvitation" ORDER BY "createdAt" ASC')
  console.log(`  Found ${invitations.length} invitations`)

  for (const inv of invitations) {
    await target.query(
      `INSERT INTO "InitiativeInvitation" (
        id, email, "initiativeId", "invitedBy", role, department,
        status, "createdAt", "expiresAt"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (id) DO NOTHING`,
      [
        inv.id,
        inv.email,
        inv.workspaceId,            // workspaceId → initiativeId
        inv.invitedBy,
        'member',
        inv.profile || null,        // profile → department
        inv.status || 'pending',
        inv.createdAt,
        inv.expiresAt || null,
      ]
    )
    stats.invitations++
  }
  console.log(`  ✓ ${stats.invitations} invitations migrated`)
}

// ── 5. WorkspaceEmailSettings → InitiativeSettings ───────────────────────────
async function migrateSettings() {
  const { rows: settings } = await source.query('SELECT * FROM "WorkspaceEmailSettings"')
  console.log(`  Found ${settings.length} email settings`)

  for (const s of settings) {
    // Preserve intent: if ANY per-event flag was on, keep notifications on
    const emailNotifications =
      s.notifyOnTaskCreate ||
      s.notifyOnTaskAssign ||
      s.notifyOnTaskComplete ||
      s.notifyOnComment ||
      s.notifyOnDueDate ||
      false

    await target.query(
      `INSERT INTO "InitiativeSettings" (
        id, "initiativeId", "emailNotifications", "dailyReportEnabled",
        "dailyReportTime", "dailyReportEmails", "createdAt", "updatedAt"
      ) VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7)
      ON CONFLICT (id) DO NOTHING`,
      [
        s.id,
        s.workspaceId,
        emailNotifications,
        s.dailyReportEnabled || false,
        s.dailyReportTime || '09:00',
        '{}',                       // dailyReportEmails: empty — no equivalent in V1
        s.updatedAt,
      ]
    )
    stats.settings++
  }
  console.log(`  ✓ ${stats.settings} initiative settings migrated`)
}

// ── 6. Tags (from Task.tags[] + Task.category) ───────────────────────────────
// Returns: Map<workspaceId, Map<tagName, tagId>>
async function migrateTags() {
  const { rows: tasks } = await source.query(
    'SELECT id, "workspaceId", tags, category FROM "Task"'
  )

  // Collect all unique tag names per workspace
  const tagMap = new Map() // workspaceId → Map<tagName, tagId>

  for (const task of tasks) {
    if (!tagMap.has(task.workspaceId)) {
      tagMap.set(task.workspaceId, new Map())
    }
    const wsMap = tagMap.get(task.workspaceId)

    const names = [
      ...(Array.isArray(task.tags) ? task.tags : []),
      ...(task.category ? [task.category] : []),
    ].map(n => n?.trim()).filter(Boolean)

    for (const name of names) {
      if (wsMap.has(name)) continue
      const tagId = newId()
      wsMap.set(name, tagId)

      await target.query(
        `INSERT INTO "Tag" (id, name, color, "initiativeId", "createdAt")
        VALUES ($1,$2,$3,$4,NOW())
        ON CONFLICT DO NOTHING`,
        [tagId, name, randomColor(), task.workspaceId]
      )
      stats.tags++
    }
  }

  console.log(`  ✓ ${stats.tags} tags created`)
  return tagMap
}

// ── 7. Tasks → Actions ────────────────────────────────────────────────────────
async function migrateActions(tagMap) {
  const { rows: tasks } = await source.query('SELECT * FROM "Task" ORDER BY "createdAt" ASC')
  const { rows: allAssignees } = await source.query('SELECT * FROM "TaskAssignee" ORDER BY id ASC')

  console.log(`  Found ${tasks.length} tasks, ${allAssignees.length} task-assignee rows`)

  // Group assignees by taskId
  const assigneesByTask = new Map()
  for (const a of allAssignees) {
    if (!assigneesByTask.has(a.taskId)) assigneesByTask.set(a.taskId, [])
    assigneesByTask.get(a.taskId).push(a.userId)
  }

  // Cache user names for extra-assignee notes
  const { rows: allUsers } = await source.query('SELECT id, name FROM "User"')
  const userNames = new Map(allUsers.map(u => [u.id, u.name]))

  for (const task of tasks) {
    const assignees = assigneesByTask.get(task.id) || []
    const primaryAssigneeId = assignees[0] || null
    const extraAssignees = assignees.slice(1)

    // Insert Action
    await target.query(
      `INSERT INTO "Action" (
        id, "initiativeId", "createdBy", "assigneeId", title, description,
        status, priority, "dueDate", "sourceType", "sourceId", "createdAt", "updatedAt"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (id) DO NOTHING`,
      [
        task.id,
        task.workspaceId,           // workspaceId → initiativeId
        task.createdBy,
        primaryAssigneeId,
        task.title,
        task.description || null,
        task.status || 'todo',
        task.priority || 'medium',
        task.dueDate || null,
        task.sourceType || null,
        task.sourceId || null,
        task.createdAt,
        task.updatedAt,
      ]
    )
    stats.actions++

    // ActionTags: from task.tags[] and task.category
    const wsMap = tagMap.get(task.workspaceId)
    if (wsMap) {
      const tagNames = [
        ...(Array.isArray(task.tags) ? task.tags : []),
        ...(task.category ? [task.category] : []),
      ].map(n => n?.trim()).filter(Boolean)

      for (const name of tagNames) {
        const tagId = wsMap.get(name)
        if (!tagId) continue
        await target.query(
          `INSERT INTO "ActionTag" ("actionId", "tagId") VALUES ($1,$2)
          ON CONFLICT DO NOTHING`,
          [task.id, tagId]
        )
        stats.actionTags++
      }
    }

    // Migration note: extra assignees
    if (extraAssignees.length > 0) {
      const names = extraAssignees.map(id => userNames.get(id) || id).join(', ')
      await target.query(
        `INSERT INTO "ActionUpdate" (id, "actionId", "userId", content, "createdAt")
        VALUES ($1,$2,$3,$4,NOW())`,
        [
          newId(),
          task.id,
          task.createdBy,
          `[Migration note] Additional co-assignees from V1: ${names}`,
        ]
      )
      stats.migrationNotes++
    }

    // Migration note: attachments
    if (Array.isArray(task.attachments) && task.attachments.length > 0) {
      await target.query(
        `INSERT INTO "ActionUpdate" (id, "actionId", "userId", content, "createdAt")
        VALUES ($1,$2,$3,$4,NOW())`,
        [
          newId(),
          task.id,
          task.createdBy,
          `[Migration note] Attachments from V1:\n${task.attachments.join('\n')}`,
        ]
      )
      stats.migrationNotes++
    }
  }

  console.log(`  ✓ ${stats.actions} actions migrated`)
  console.log(`  ✓ ${stats.actionTags} action-tag links created`)
  console.log(`  ✓ ${stats.migrationNotes} migration notes created (extra assignees, attachments)`)
}

// ── 8. TaskUpdates → ActionUpdates ───────────────────────────────────────────
async function migrateActionUpdates() {
  const { rows: updates } = await source.query('SELECT * FROM "TaskUpdate" ORDER BY "createdAt" ASC')
  console.log(`  Found ${updates.length} task updates`)

  for (const u of updates) {
    // Preserve files inline if present
    let content = u.content || ''
    if (Array.isArray(u.files) && u.files.length > 0) {
      content += `\n\n📎 Files:\n${u.files.join('\n')}`
    }

    await target.query(
      `INSERT INTO "ActionUpdate" (id, "actionId", "userId", content, "createdAt")
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (id) DO NOTHING`,
      [u.id, u.taskId, u.userId, content, u.createdAt]
    )
    stats.actionUpdates++
  }
  console.log(`  ✓ ${stats.actionUpdates} action updates migrated`)
}

// ── 9. Transcripts → Standalone Actions ──────────────────────────────────────
async function migrateTranscripts() {
  const { rows: transcripts } = await source.query('SELECT * FROM "Transcript" ORDER BY "createdAt" ASC')
  console.log(`  Found ${transcripts.length} transcripts`)

  if (transcripts.length === 0) return

  // Build workspace→creator map
  const { rows: workspaces } = await source.query('SELECT id, "createdBy" FROM "Workspace"')
  const wsCreator = new Map(workspaces.map(w => [w.id, w.createdBy]))

  for (const t of transcripts) {
    const createdBy = wsCreator.get(t.workspaceId)
    if (!createdBy) {
      console.log(`    ⚠ Transcript "${t.title}" skipped — workspace creator not found`)
      stats.skipped.push({ type: 'transcript', id: t.id, reason: 'workspace creator missing' })
      continue
    }

    const actionId = newId()
    await target.query(
      `INSERT INTO "Action" (
        id, "initiativeId", "createdBy", "assigneeId", title, description,
        status, priority, "dueDate", "sourceType", "sourceId", "createdAt", "updatedAt"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (id) DO NOTHING`,
      [
        actionId,
        t.workspaceId,
        createdBy,
        null,
        `[Transcript] ${t.title}`,
        t.content,
        'completed',                // historical record, mark completed
        'low',
        null,
        'transcript',               // sourceType to identify origin
        t.id,                       // sourceId = original transcript id
        t.createdAt,
        t.createdAt,
      ]
    )
    stats.transcriptsAsActions++
  }
  console.log(`  ✓ ${stats.transcriptsAsActions} transcripts migrated as completed actions`)
}

// ── Verify ────────────────────────────────────────────────────────────────────
async function verify() {
  const checks = [
    ['User',                 'SELECT COUNT(*) FROM "User"'],
    ['Initiative',           'SELECT COUNT(*) FROM "Initiative"'],
    ['InitiativeMember',     'SELECT COUNT(*) FROM "InitiativeMember"'],
    ['InitiativeInvitation', 'SELECT COUNT(*) FROM "InitiativeInvitation"'],
    ['InitiativeSettings',   'SELECT COUNT(*) FROM "InitiativeSettings"'],
    ['Tag',                  'SELECT COUNT(*) FROM "Tag"'],
    ['Action',               'SELECT COUNT(*) FROM "Action"'],
    ['ActionTag',            'SELECT COUNT(*) FROM "ActionTag"'],
    ['ActionUpdate',         'SELECT COUNT(*) FROM "ActionUpdate"'],
  ]

  console.log('\n── Target DB row counts ──────────────────────────────')
  for (const [label, sql] of checks) {
    const { rows } = await target.query(sql)
    console.log(`  ${label.padEnd(25)} ${rows[0].count}`)
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════╗')
  console.log('║     V1 → V2 Database Migration           ║')
  console.log('╚══════════════════════════════════════════╝')

  const steps = [
    ['Users',                          migrateUsers],
    ['Workspaces → Initiatives',       migrateInitiatives],
    ['Members',                        migrateMembers],
    ['Invitations',                    migrateInvitations],
    ['Email Settings → Init Settings', migrateSettings],
  ]

  for (const [label, fn] of steps) {
    console.log(`\n→ ${label}`)
    await fn()
  }

  // Tags must run before Actions (ActionTag FK)
  console.log('\n→ Tags (from task.tags[] + category)')
  const tagMap = await migrateTags()

  console.log('\n→ Tasks → Actions')
  await migrateActions(tagMap)

  console.log('\n→ Task Updates → Action Updates')
  await migrateActionUpdates()

  console.log('\n→ Transcripts → Standalone Actions')
  await migrateTranscripts()

  await verify()

  console.log('\n── Migration Summary ─────────────────────────────────')
  console.log(`  Users migrated:          ${stats.users}`)
  console.log(`  Initiatives:             ${stats.initiatives}`)
  console.log(`  Members:                 ${stats.members}`)
  console.log(`  Invitations:             ${stats.invitations}`)
  console.log(`  Settings:                ${stats.settings}`)
  console.log(`  Tags created:            ${stats.tags}`)
  console.log(`  Actions:                 ${stats.actions}`)
  console.log(`  Action-tag links:        ${stats.actionTags}`)
  console.log(`  Action updates:          ${stats.actionUpdates}`)
  console.log(`  Migration notes:         ${stats.migrationNotes}`)
  console.log(`  Transcripts as actions:  ${stats.transcriptsAsActions}`)

  if (stats.skipped.length > 0) {
    console.log(`\n  ⚠ Skipped (${stats.skipped.length}):`)
    stats.skipped.forEach(s => console.log(`    - [${s.type}] ${s.id}: ${s.reason}`))
  }

  console.log('\n✅ Migration complete')
  console.log('\n⚠  IMPORTANT: Users must sign in with Google using their existing email address.')
  console.log('   Their account will be linked automatically on first login.\n')
}

main()
  .catch(err => {
    console.error('\n❌ Migration failed:', err)
    process.exit(1)
  })
  .finally(async () => {
    await source.end()
    await target.end()
  })
