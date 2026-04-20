import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'

/* ─────────────────────────────────────────────────────────
   Navigation structure
───────────────────────────────────────────────────────── */
const NAV = [
  { id: 'overview',       icon: 'info',          label: 'Overview' },
  { id: 'getting-started',icon: 'rocket_launch',  label: 'Getting Started' },
  { id: 'dashboard',      icon: 'space_dashboard',label: 'Dashboard' },
  { id: 'initiatives',    icon: 'flag',           label: 'Initiatives' },
  { id: 'command-center', icon: 'layers',         label: 'Command Center' },
  { id: 'actions',        icon: 'task_alt',       label: 'Actions' },
  { id: 'ai-upload',      icon: 'auto_awesome',   label: 'AI Upload' },
  { id: 'notifications',  icon: 'notifications',  label: 'Notifications' },
  { id: 'roles',          icon: 'shield_person',  label: 'Roles & Permissions' },
  { id: 'faq',            icon: 'help',           label: 'FAQ' },
]

const TOC: Record<string, string[]> = {
  'overview':        ['What is ExecAssist?', 'Key Features'],
  'getting-started': ['Signing In', 'Navigating the App'],
  'dashboard':       ['Stat Cards', 'Executive Brief', 'Priority Queue'],
  'initiatives':     ['Creating an Initiative', 'Status Types', 'Managing Members', 'Daily Digest'],
  'command-center':  ['Filter Tabs', 'Search', 'Kanban Columns', 'Priority Indicators'],
  'actions':         ['Creating Actions', 'Action Fields', 'Multiple Assignees', 'Tags', 'Comments & Mentions', 'Deleting an Action'],
  'ai-upload':       ['Meeting Transcript', 'Spreadsheet Upload', 'Live Voice Recording', 'AI Settings'],
  'notifications':   ['Email Notifications', 'Push Notifications', 'Daily Digest'],
  'roles':           ['Role Definitions', 'Permissions Matrix'],
  'faq':             ['Common Questions'],
}

/* ─────────────────────────────────────────────────────────
   Page
───────────────────────────────────────────────────────── */
export default function UserGuidePage() {
  const navigate = useNavigate()
  const [activeId, setActiveId] = useState('overview')
  const mainRef = useRef<HTMLDivElement>(null)

  /* Scroll-spy via IntersectionObserver */
  useEffect(() => {
    const observers: IntersectionObserver[] = []
    NAV.forEach(({ id }) => {
      const el = document.getElementById(`section-${id}`)
      if (!el) return
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveId(id) },
        { rootMargin: '-20% 0px -70% 0px' }
      )
      obs.observe(el)
      observers.push(obs)
    })
    return () => observers.forEach((o) => o.disconnect())
  }, [])

  const scrollTo = (id: string) => {
    document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActiveId(id)
  }

  const activeIndex = NAV.findIndex((n) => n.id === activeId)

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>

      {/* ── Top bar ─────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-50 flex items-center gap-3 px-5 border-b"
        style={{
          height: 52,
          background: '#0f1629',
          borderColor: 'rgba(255,255,255,0.07)',
        }}
      >
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-[#6b7280] hover:text-white transition-colors text-[13px] font-medium"
        >
          <span className="material-symbols-outlined text-[17px]" style={{ fontVariationSettings: "'FILL' 0" }}>arrow_back</span>
          Back
        </button>
        <span className="text-white/10">|</span>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-[#4648d4] flex items-center justify-center">
            <span className="material-symbols-outlined text-white text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
          </div>
          <span className="text-[13px] font-semibold text-white/80">ExecAssist</span>
          <span className="text-white/20 text-[12px] mx-0.5">/</span>
          <span className="text-[13px] text-white/45">User Guide</span>
        </div>
      </header>

      {/* ── Three-column body ───────────────────────────────────── */}
      <div className="flex">

        {/* ── LEFT SIDEBAR ── */}
        <aside
          className="hidden lg:flex flex-col w-[240px] shrink-0 border-r border-[#f0f0f0]"
          style={{ position: 'sticky', top: 52, height: 'calc(100vh - 52px)', overflowY: 'auto' }}
        >
          <div className="px-4 pt-7 pb-3">
            <p className="text-[10.5px] font-bold tracking-widest uppercase text-[#9ca3af] mb-3 px-2">Contents</p>
            <nav className="space-y-0.5">
              {NAV.map(({ id, icon, label }) => (
                <button
                  key={id}
                  onClick={() => scrollTo(id)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-left transition-all duration-100',
                    activeId === id
                      ? 'bg-[#eef0fd] text-[#4648d4] font-semibold'
                      : 'text-[#6b7280] hover:text-[#111827] hover:bg-[#f5f5f5] font-medium'
                  )}
                >
                  <span
                    className="material-symbols-outlined text-[15px] shrink-0"
                    style={{ fontVariationSettings: activeId === id ? "'FILL' 1" : "'FILL' 0" }}
                  >
                    {icon}
                  </span>
                  {label}
                </button>
              ))}
            </nav>
          </div>

          {/* Prev / Next */}
          <div className="mt-auto px-4 pb-6 pt-4 border-t border-[#f0f0f0] space-y-1">
            {activeIndex > 0 && (
              <button
                onClick={() => scrollTo(NAV[activeIndex - 1].id)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] text-[#6b7280] hover:text-[#4648d4] hover:bg-[#eef0fd] transition-all"
              >
                <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 0" }}>arrow_upward</span>
                {NAV[activeIndex - 1].label}
              </button>
            )}
            {activeIndex < NAV.length - 1 && (
              <button
                onClick={() => scrollTo(NAV[activeIndex + 1].id)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] text-[#6b7280] hover:text-[#4648d4] hover:bg-[#eef0fd] transition-all"
              >
                <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 0" }}>arrow_downward</span>
                {NAV[activeIndex + 1].label}
              </button>
            )}
          </div>
        </aside>

        {/* ── MAIN DOCUMENT ── */}
        <main ref={mainRef} className="flex-1 min-w-0 px-8 md:px-14 py-10 max-w-[780px]">

          {/* Hero */}
          <div className="mb-12">
            <div className="flex items-center gap-2 text-[12px] text-[#9ca3af] mb-4 font-medium">
              <span>Documentation</span>
              <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'FILL' 0" }}>chevron_right</span>
              <span className="text-[#4648d4]">User Guide</span>
            </div>
            <h1 className="text-[32px] font-bold text-[#111827] tracking-tight leading-tight mb-3">
              ExecAssist User Guide
            </h1>
            <p className="text-[15px] text-[#6b7280] leading-relaxed max-w-[560px]">
              Everything you need to know — from signing in for the first time to generating action items from a meeting transcript with AI.
            </p>
            <div className="flex items-center gap-4 mt-4 pt-4 border-t border-[#f3f4f6]">
              <span className="text-[12px] text-[#9ca3af]">Version 1.0</span>
              <span className="text-[#e5e7eb]">·</span>
              <span className="text-[12px] text-[#9ca3af]">April 2026</span>
              <span className="text-[#e5e7eb]">·</span>
              <span className="text-[12px] text-[#9ca3af]">Web + Mobile</span>
            </div>
          </div>

          {/* ── SECTION: Overview ── */}
          <DocSection id="overview" title="Overview" icon="info">
            <P>
              <strong>ExecAssist</strong> is an AI-powered executive management platform built for teams that need to capture, organize, and track action items — fast. Instead of buried email threads and scattered notes, ExecAssist gives every team member a single source of truth for what needs to happen, who owns it, and when it is due.
            </P>
            <P>
              The platform integrates directly with your meetings: paste a transcript, upload a recording, or drop in a spreadsheet — and the built-in AI (powered by Google Gemini) automatically extracts action items, suggests owners, and estimates deadlines.
            </P>

            <H3>Key Features</H3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 mb-6">
              {[
                { icon: 'flag',          title: 'Initiatives',       desc: 'Organize work into strategic projects with members, progress, and deadlines.' },
                { icon: 'task_alt',      title: 'Actions',           desc: 'Tasks with priorities, multi-assignees, tags, due dates, and threaded comments.' },
                { icon: 'auto_awesome',  title: 'AI Generation',     desc: 'Turn transcripts, audio, or spreadsheets into structured action items in seconds.' },
                { icon: 'article',       title: 'Executive Brief',   desc: 'AI-generated daily summary — perfect for leadership stand-ups.' },
                { icon: 'layers',        title: 'Command Center',    desc: 'Unified Kanban of every action across every initiative.' },
                { icon: 'notifications', title: 'Notifications',     desc: 'Email and push alerts for assignments, @mentions, and daily digests.' },
              ].map((f) => (
                <div key={f.title} className="flex gap-3 p-3.5 rounded-xl border border-[#e5e7eb] bg-[#fafafa]">
                  <div className="w-7 h-7 rounded-lg bg-[#eef0fd] flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[#4648d4] text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>{f.icon}</span>
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-[#111827] mb-0.5">{f.title}</p>
                    <p className="text-[12.5px] text-[#6b7280] leading-snug">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </DocSection>

          {/* ── SECTION: Getting Started ── */}
          <DocSection id="getting-started" title="Getting Started" icon="rocket_launch">
            <H3>Signing In</H3>
            <P>
              ExecAssist uses <strong>Google Sign-In</strong> — no separate password required. Simply use your work Google account (e.g. <Code>@forsysinc.com</Code>).
            </P>
            <Steps items={[
              { title: 'Open the login page',          desc: 'Navigate to the ExecAssist URL provided by your administrator.' },
              { title: 'Click "Sign in with Google"',  desc: 'A Google OAuth popup appears — select your work account.' },
              { title: 'Grant permissions',            desc: 'ExecAssist requests only your basic profile and email — nothing else.' },
              { title: "You're in!",                   desc: 'New users are registered automatically. Pending invitations are accepted on first login.' },
            ]} />
            <Callout type="tip">
              If a colleague invited you before you signed up, that initiative appears in your workspace the moment you complete sign-in — no extra steps needed.
            </Callout>

            <H3>Navigating the App</H3>
            <P>The left sidebar is your primary navigation and is always visible on desktop.</P>
            <GuideTable
              headers={['Section', 'Purpose']}
              rows={[
                ['Dashboard',      'High-level overview, stats, and the AI Executive Brief'],
                ['Initiatives',    'Create and manage your strategic initiatives and their members'],
                ['Command Center', 'All actions across all initiatives in one unified Kanban view'],
                ['Upload / AI',    'Generate actions from transcripts, audio recordings, or spreadsheets'],
                ['Settings',       'Edit your profile and manage notification preferences'],
              ]}
            />
          </DocSection>

          {/* ── SECTION: Dashboard ── */}
          <DocSection id="dashboard" title="Dashboard" icon="space_dashboard">
            <P>
              The Dashboard is your landing page after login — a newspaper-style overview of everything that matters right now. It is divided into three main areas.
            </P>

            <H3>Stat Cards</H3>
            <P>Four metric cards at the top of the page give you an instant pulse of the workspace:</P>
            <ul className="doc-list">
              <li><strong>Total Initiatives</strong> — Count of all initiatives you belong to.</li>
              <li><strong>Active Actions</strong> — Actions not yet marked as Completed.</li>
              <li><strong>Overdue Items</strong> — Actions whose due date has passed. The card turns red when the count is greater than zero — clicking it takes you to the Command Center filtered to overdue actions.</li>
              <li><strong>Team Members</strong> — Total unique collaborators across all your initiatives.</li>
            </ul>

            <H3>Executive Brief</H3>
            <P>
              The Executive Brief is an AI-generated (Google Gemini) summary of all activity across your initiatives. It is regenerated once per day and cached — so multiple people reading it won't incur extra AI costs. The brief covers key accomplishments, items at risk, upcoming deadlines, and open decisions.
            </P>
            <P>
              Click the <strong>Refresh</strong> button (top-right of the brief panel) to generate a fresh summary on demand. The timestamp shows when it was last generated.
            </P>
            <Callout type="note">
              The Executive Brief is cached daily. If you click Refresh multiple times in quick succession, only the first call generates a new summary — subsequent calls return the cached version until the cache expires.
            </Callout>

            <H3>Priority Queue</H3>
            <P>
              Below the Executive Brief, the Priority Queue highlights your most urgent open actions — sorted by priority: <PriorityPill level="urgent" /> then <PriorityPill level="high" /> then <PriorityPill level="medium" />. Click any item to jump directly to its detail page.
            </P>
          </DocSection>

          {/* ── SECTION: Initiatives ── */}
          <DocSection id="initiatives" title="Initiatives" icon="flag">
            <P>
              An <strong>Initiative</strong> is a workspace — think of it as a strategic project or program. All related actions, members, tags, and settings live inside an initiative.
            </P>

            <H3>Creating an Initiative</H3>
            <Steps items={[
              { title: 'Click "New Initiative"',        desc: 'The button is in the top-right corner of the Initiatives page.' },
              { title: 'Fill in the details',           desc: 'Enter a Title, Description, Status, Priority, and Due Date.' },
              { title: 'Click "Create Initiative"',     desc: 'You become the Owner of the initiative automatically.' },
            ]} />

            <H3>Status Types</H3>
            <GuideTable
              headers={['Status', 'Meaning']}
              rows={[
                [<StatusBadge label="Active"    color="green"  />, 'Work is in progress — the default for new initiatives.'],
                [<StatusBadge label="Completed" color="blue"   />, 'All major deliverables are done.'],
                [<StatusBadge label="Paused"    color="gray"   />, 'Work is temporarily on hold.'],
                [<StatusBadge label="At-Risk"   color="red"    />, 'At risk of missing deadline or goals.'],
              ]}
            />

            <H3>Managing Members</H3>
            <P>
              Inside an initiative, go to <strong>Settings → Members</strong> to invite colleagues by email. Choose their role (Admin or Member) and click <strong>Add Member</strong>. An invitation email is sent immediately. If the user has not yet signed up, the invitation stays pending and is auto-accepted on their first login.
            </P>

            <H3>Daily Digest</H3>
            <P>
              Owners can configure a per-initiative daily digest email. Go to <strong>Settings → Notifications</strong> inside the initiative to toggle it on, set a delivery time, and choose which members receive it.
            </P>
            <Callout type="danger">
              Only the <strong>Owner</strong> can delete an initiative. Deleting permanently removes all its actions and cannot be undone. A confirmation dialog will appear before deletion proceeds.
            </Callout>
          </DocSection>

          {/* ── SECTION: Command Center ── */}
          <DocSection id="command-center" title="Command Center" icon="layers">
            <P>
              The <strong>Command Center</strong> is a global Kanban board showing every action across every initiative you belong to — in one unified view. It is the fastest way to see what needs attention without switching between workspaces.
            </P>

            <H3>Filter Tabs</H3>
            <GuideTable
              headers={['Tab', 'Shows']}
              rows={[
                ['All',       'Every action across all your initiatives, regardless of status.'],
                ['Open',      'Actions in To Do, In Progress, or In Review.'],
                ['Overdue',   'Open actions whose due date has passed.'],
                ['Completed', 'Actions marked as done.'],
                ['Mine',      'Only actions assigned to you — your personal to-do list.'],
              ]}
            />

            <H3>Search</H3>
            <P>
              The search bar (top-right) filters actions by title or description keyword in real time. Combine it with any filter tab for precision — for example, <strong>Mine</strong> + search <Code>quarterly</Code> instantly finds all your quarterly-related actions.
            </P>

            <H3>Kanban Columns</H3>
            <P>Actions are organized into four status columns which mirror the action lifecycle:</P>
            <div className="flex flex-wrap gap-2 my-3">
              {([
                { label: 'To Do',       bg: '#f3f4f6', color: '#374151' },
                { label: 'In Progress', bg: '#dbeafe', color: '#1e40af' },
                { label: 'In Review',   bg: '#ede9fe', color: '#5b21b6' },
                { label: 'Completed',   bg: '#dcfce7', color: '#166534' },
              ] as const).map((s) => (
                <span key={s.label} className="px-3 py-1 rounded-full text-[12px] font-semibold" style={{ background: s.bg, color: s.color }}>{s.label}</span>
              ))}
            </div>
            <P>Click any action card to open its full detail page without leaving the Command Center.</P>

            <H3>Priority Indicators</H3>
            <P>Each action card has a colored left border indicating its priority level:</P>
            <div className="flex flex-wrap gap-2 my-3">
              <PriorityPill level="urgent" /> <PriorityPill level="high" /> <PriorityPill level="medium" /> <PriorityPill level="low" />
            </div>
          </DocSection>

          {/* ── SECTION: Actions ── */}
          <DocSection id="actions" title="Actions" icon="task_alt">
            <P>
              An <strong>Action</strong> is the core unit of work in ExecAssist — equivalent to a task or to-do item. Actions can live inside an initiative or as standalone items accessible only to you and your assignees.
            </P>

            <H3>Creating Actions</H3>
            <ul className="doc-list">
              <li><strong>Inside an Initiative</strong> — Open the initiative and click <strong>+ New Action</strong>.</li>
              <li><strong>From Command Center</strong> — Click <strong>+ Add Action</strong> at the top of any Kanban column.</li>
              <li><strong>Via AI Upload</strong> — Generate multiple actions at once from a transcript (see the AI Upload section).</li>
            </ul>

            <H3>Action Fields</H3>
            <GuideTable
              headers={['Field', 'Description']}
              rows={[
                ['Title',       'Brief, action-oriented name. Click to edit inline.'],
                ['Description', 'Detailed context. Supports multi-line text.'],
                ['Status',      'To Do → In Progress → In Review → Completed'],
                ['Priority',    'Low / Medium / High / Urgent'],
                ['Due Date',    'Target completion date. Displayed in red when overdue.'],
                ['Assignees',   'One or more team members. Each receives an assignment notification.'],
                ['Tags',        'Color-coded labels. Create new tags inline or reuse existing ones.'],
                ['Initiative',  'The parent initiative. Change it to move the action to a different workspace.'],
              ]}
            />

            <H3>Multiple Assignees</H3>
            <P>
              ExecAssist supports assigning a single action to multiple team members simultaneously. Open the Assignees field and select as many people as needed. Each assigned member receives an email notification, sees the action in their <strong>Mine</strong> filter in Command Center, and gets a push notification if subscribed.
            </P>

            <H3>Tags</H3>
            <P>
              Tags help you categorize and filter actions. Each tag has a custom color. To <strong>add a tag</strong>, click the tag input on the action detail page, type to search existing tags or enter a new name, and press Enter. To <strong>remove a tag</strong>, click the ✕ on the tag pill. Tags are scoped per initiative or can be global across all initiatives.
            </P>

            <H3>Comments & Mentions</H3>
            <P>
              The right panel of the Action detail page is a threaded discussion board. Type your comment in the text box and click <strong>Post Update</strong>. Use <Code>@name</Code> to mention a teammate — they receive an email and push notification instantly. You can edit or delete your own comments using the ⋯ menu on each comment. File attachments can be uploaded directly in comments.
            </P>

            <H3>Deleting an Action</H3>
            <Callout type="danger">
              Deleting an action permanently removes it along with all its comments and history. Only the action creator or initiative Admins/Owners can delete. A confirmation dialog will appear before deletion proceeds.
            </Callout>
          </DocSection>

          {/* ── SECTION: AI Upload ── */}
          <DocSection id="ai-upload" title="AI Upload" icon="auto_awesome">
            <P>
              The <strong>Upload</strong> page is ExecAssist's most powerful feature. Instead of manually creating actions one by one, you feed it raw meeting content and the AI automatically generates structured action items — complete with titles, descriptions, assignees, due dates, and priorities.
            </P>

            <H3>Meeting Transcript</H3>
            <P>
              Use this mode when you have the text of a meeting (from Zoom, Teams, Otter.ai, Google Meet, or manual notes).
            </P>
            <Steps items={[
              { title: 'Select the "Transcript" tab',    desc: 'The default mode when you open the Upload page.' },
              { title: 'Paste your transcript',          desc: 'Paste the full meeting text into the large textarea. There is no length limit.' },
              { title: 'Configure AI Settings',          desc: 'Toggle Auto-assign owners, Extract deadlines, Priority detection, and Executive focus as needed.' },
              { title: 'Select an Initiative (optional)', desc: 'Choose which initiative the generated actions will belong to, or leave blank for standalone actions.' },
              { title: 'Click "Generate Actions"',       desc: 'The AI analyzes the transcript and returns proposed actions within seconds.' },
              { title: 'Review and save',                desc: 'Edit any field, deselect items you don\'t want, then click "Save All Actions".' },
            ]} />

            <H3>Spreadsheet Upload</H3>
            <P>
              Upload a <Code>.csv</Code> or <Code>.xlsx</Code> file containing existing task lists or data exports. The AI parses column headers (e.g. Task, Owner, Due Date, Priority) and maps them to action fields — even for unstructured spreadsheets where column names are non-standard. Review the parsed preview before saving.
            </P>
            <Callout type="note">
              Old <Code>.xls</Code> format is not supported. Open the file in Excel and use <strong>Save As → .xlsx</strong> first.
            </Callout>

            <H3>Live Voice Recording</H3>
            <P>
              Record audio directly in the browser — ideal for voice memos or live meeting capture.
            </P>
            <Steps items={[
              { title: 'Click the "Live Voice" tab',  desc: 'Allow microphone access when the browser permission prompt appears.' },
              { title: 'Press "Start Recording"',     desc: 'A live audio waveform and a seconds counter appear while you speak.' },
              { title: 'Press "Stop Recording"',      desc: 'The audio is transcribed in real time and the transcript text appears below the waveform.' },
              { title: 'Generate and save',           desc: 'Review the transcript, click "Generate Actions", then save.' },
            ]} />

            <H3>AI Settings</H3>
            <GuideTable
              headers={['Setting', 'What it does']}
              rows={[
                ['Auto-assign Owners',  'Matches names mentioned in the transcript to initiative members and pre-fills the assignee field.'],
                ['Extract Deadlines',   'Parses date/time references ("by Friday", "end of Q2") and converts them to due dates.'],
                ['Priority Detection',  'Infers urgency from language ("ASAP", "critical", "when you get a chance") and sets priority.'],
                ['Executive Focus',     'Filters only C-suite / leadership-level actions, ignoring operational minutiae.'],
              ]}
            />
            <Callout type="tip">
              When running the AI on a long all-hands transcript, enable <strong>Executive Focus</strong> to surface only leadership decisions and commitments — filtering out low-level operational tasks.
            </Callout>
          </DocSection>

          {/* ── SECTION: Notifications ── */}
          <DocSection id="notifications" title="Notifications" icon="notifications">
            <P>
              ExecAssist keeps you informed through two channels: <strong>Email</strong> and <strong>Browser Push</strong>. Both can be configured per user in the Profile settings.
            </P>

            <H3>Email Notifications</H3>
            <P>Emails are sent automatically when:</P>
            <ul className="doc-list">
              <li>You are <strong>assigned</strong> to an action.</li>
              <li>You are <strong>@mentioned</strong> in a comment.</li>
              <li>You receive an <strong>initiative invitation</strong>.</li>
              <li>Your configured <strong>Daily Digest</strong> time arrives (if enabled per initiative).</li>
            </ul>
            <P>Toggle email notifications on or off at <strong>Profile → Notification Preferences</strong>.</P>

            <H3>Push Notifications</H3>
            <P>Browser push notifications deliver real-time alerts even when ExecAssist is not in your active tab.</P>
            <Steps items={[
              { title: 'Go to Profile → Notification Preferences', desc: 'Find the Push Notifications section.' },
              { title: 'Click "Subscribe to Push Notifications"',  desc: 'Your browser shows a permission prompt — click Allow.' },
              { title: "You're subscribed",                        desc: 'The status changes to Subscribed. Push alerts will now arrive for @mentions and assignments.' },
            ]} />
            <Callout type="note">
              Push notifications require Chrome, Edge, or Firefox. Safari on iOS has limited support. If your browser does not support push, the subscribe button will be hidden with an explanation.
            </Callout>

            <H3>Daily Digest</H3>
            <P>
              Each initiative can have its own digest schedule, configured by the Owner or Admin. The digest email covers: actions due today or overdue, actions completed in the past 24 hours, and new actions created since the last digest. Set the delivery time to 15 minutes before your team stand-up so everyone arrives pre-briefed.
            </P>
          </DocSection>

          {/* ── SECTION: Roles ── */}
          <DocSection id="roles" title="Roles & Permissions" icon="shield_person">
            <P>
              Every user in ExecAssist has a role within each initiative they belong to. Roles control what you can see and do within that workspace.
            </P>

            <H3>Role Definitions</H3>
            <GuideTable
              headers={['Role', 'Who', 'Description']}
              rows={[
                [<StatusBadge label="Owner"  color="purple" />, 'Initiative creator',    'Full control — create, edit, delete, manage members, and configure all settings.'],
                [<StatusBadge label="Admin"  color="blue"   />, 'Promoted by Owner',     'Can manage all actions but cannot delete the initiative or transfer ownership.'],
                [<StatusBadge label="Member" color="green"  />, 'Standard collaborator', 'Can create and edit their own actions, comment on any action, and view everything.'],
              ]}
            />

            <H3>Permissions Matrix</H3>
            <GuideTable
              headers={['Permission', 'Owner', 'Admin', 'Member']}
              rows={[
                ['Create Initiative',        '✅', '—',  '—'],
                ['Edit / Delete Initiative', '✅', '—',  '—'],
                ['Invite Members',           '✅', '✅', '—'],
                ['Change Member Roles',      '✅', '—',  '—'],
                ['Create Actions',           '✅', '✅', '✅'],
                ['Edit Any Action',          '✅', '✅', 'Own only'],
                ['Delete Any Action',        '✅', '✅', 'Own only'],
                ['Comment on Actions',       '✅', '✅', '✅'],
                ['Configure Daily Digest',   '✅', '✅', '—'],
                ['Use AI Upload',            '✅', '✅', '✅'],
                ['View Executive Brief',     '✅', '✅', '✅'],
              ]}
            />
          </DocSection>

          {/* ── SECTION: FAQ ── */}
          <DocSection id="faq" title="FAQ" icon="help">
            <H3>Common Questions</H3>
            {([
              {
                q: 'Can I use ExecAssist without joining an initiative?',
                a: "Yes. You can create standalone actions that don't belong to any initiative. They're accessible from Command Center and visible only to you and your assignees.",
              },
              {
                q: "What happens if I'm invited before I've signed in?",
                a: 'Your invitation stays pending until you log in with Google for the first time — at that point all pending invitations are auto-accepted and those initiatives appear immediately.',
              },
              {
                q: 'Can I move an action to a different initiative?',
                a: 'Yes. Open the action detail page and use the Initiative dropdown to move it, or clear the field to make it a standalone action.',
              },
              {
                q: 'How accurate is the AI transcript parsing?',
                a: 'Accuracy depends on transcript quality. Clean, speaker-labeled transcripts (from Zoom or Teams) produce the best results. Always review the generated preview before saving.',
              },
              {
                q: 'What file types does Spreadsheet upload support?',
                a: '.csv and .xlsx (Excel). Old .xls format is not supported — open the file in Excel and save it as .xlsx first.',
              },
              {
                q: 'Is there a mobile app?',
                a: "Yes — a React Native app (iOS and Android) is available via your organization's distribution channel. Contact your administrator for installation instructions.",
              },
              {
                q: 'How do I leave an initiative?',
                a: 'The Owner or Admin must remove you from the Members list. Contact them to be removed.',
              },
              {
                q: 'Who can see the Executive Brief?',
                a: 'All logged-in users can view the Executive Brief. It summarizes activity across all initiatives you belong to.',
              },
            ] as {q:string;a:string}[]).map((item) => (
              <div key={item.q} className="mb-5">
                <p className="text-[14px] font-semibold text-[#111827] mb-1">{item.q}</p>
                <p className="text-[13.5px] text-[#6b7280] leading-relaxed">{item.a}</p>
              </div>
            ))}
          </DocSection>

          {/* Bottom nav */}
          <div className="mt-12 pt-6 border-t border-[#f0f0f0] flex items-center justify-between">
            <p className="text-[12px] text-[#9ca3af]">ExecAssist User Guide · v1.0 · April 2026</p>
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="flex items-center gap-1.5 text-[12px] text-[#6b7280] hover:text-[#4648d4] transition-colors"
            >
              <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 0" }}>arrow_upward</span>
              Back to top
            </button>
          </div>

        </main>

        {/* ── RIGHT TOC ── */}
        <aside
          className="hidden xl:block w-[200px] shrink-0"
          style={{ position: 'sticky', top: 52, height: 'calc(100vh - 52px)', overflowY: 'auto' }}
        >
          <div className="pt-10 pr-6 pl-4">
            <p className="text-[10.5px] font-bold tracking-widest uppercase text-[#9ca3af] mb-3">On this page</p>
            <nav className="space-y-1">
              {(TOC[activeId] ?? []).map((heading) => (
                <p key={heading} className="text-[12.5px] text-[#6b7280] leading-snug py-0.5 pl-2 border-l-2 border-[#e5e7eb] hover:border-[#4648d4] hover:text-[#4648d4] cursor-default transition-colors">
                  {heading}
                </p>
              ))}
            </nav>
          </div>
        </aside>

      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────
   Document primitives
───────────────────────────────────────────────────────── */

function DocSection({ id, title, icon, children }: { id: string; title: string; icon: string; children: React.ReactNode }) {
  return (
    <section id={`section-${id}`} className="mb-14 scroll-mt-6">
      <div className="flex items-center gap-3 mb-5 pb-3 border-b border-[#f0f0f0]">
        <div className="w-7 h-7 rounded-lg bg-[#eef0fd] flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-[#4648d4] text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
        </div>
        <h2 className="text-[20px] font-bold text-[#111827] tracking-tight">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[14.5px] font-bold text-[#111827] mt-7 mb-2">{children}</h3>
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[14px] text-[#374151] leading-[1.75] mb-3">{children}</p>
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-[#f3f4f6] text-[#4648d4] rounded px-1.5 py-0.5 text-[12.5px] font-mono">
      {children}
    </code>
  )
}

function Steps({ items }: { items: { title: string; desc: string }[] }) {
  return (
    <ol className="space-y-2.5 my-4">
      {items.map((s, i) => (
        <li key={i} className="flex gap-3">
          <div className="w-5 h-5 rounded-full bg-[#4648d4] flex items-center justify-center shrink-0 mt-0.5">
            <span className="text-white text-[10px] font-bold">{i + 1}</span>
          </div>
          <p className="text-[13.5px] text-[#374151] leading-relaxed">
            <strong className="text-[#111827]">{s.title}</strong> — {s.desc}
          </p>
        </li>
      ))}
    </ol>
  )
}

function Callout({ type, children }: { type: 'tip' | 'note' | 'warn' | 'danger'; children: React.ReactNode }) {
  const map = {
    tip:    { bg: '#f0fdf4', border: '#86efac', icon: 'lightbulb', color: '#16a34a', label: 'Tip' },
    note:   { bg: '#eff6ff', border: '#93c5fd', icon: 'info',      color: '#2563eb', label: 'Note' },
    warn:   { bg: '#fffbeb', border: '#fcd34d', icon: 'warning',   color: '#d97706', label: 'Warning' },
    danger: { bg: '#fff1f2', border: '#fca5a5', icon: 'dangerous', color: '#dc2626', label: 'Caution' },
  }
  const { bg, border, icon, color, label } = map[type]
  return (
    <div className="flex gap-3 rounded-lg p-4 my-4" style={{ background: bg, borderLeft: `3px solid ${border}` }}>
      <span className="material-symbols-outlined text-[17px] shrink-0 mt-0.5" style={{ color, fontVariationSettings: "'FILL' 1" }}>{icon}</span>
      <div>
        <p className="text-[12px] font-bold uppercase tracking-wide mb-1" style={{ color }}>{label}</p>
        <p className="text-[13.5px] text-[#374151] leading-relaxed m-0">{children as React.ReactNode}</p>
      </div>
    </div>
  )
}

function GuideTable({ headers, rows }: { headers: string[]; rows: (string | React.ReactNode)[][] }) {
  return (
    <div className="overflow-x-auto my-4 rounded-lg border border-[#e5e7eb]">
      <table className="w-full text-[13px] border-collapse">
        <thead>
          <tr className="bg-[#f8f9fa]">
            {headers.map((h) => (
              <th key={h} className="text-left px-4 py-2.5 font-semibold text-[#374151] border-b border-[#e5e7eb] text-[12px] uppercase tracking-wide">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-[#f3f4f6] last:border-0 hover:bg-[#fafafa] transition-colors">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3 text-[#374151] align-top">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StatusBadge({ label, color }: { label: string; color: 'green' | 'blue' | 'gray' | 'red' | 'purple' | 'yellow' }) {
  const styles = {
    green:  'bg-[#dcfce7] text-[#166534]',
    blue:   'bg-[#dbeafe] text-[#1e40af]',
    gray:   'bg-[#f3f4f6] text-[#374151]',
    red:    'bg-[#fee2e2] text-[#991b1b]',
    purple: 'bg-[#ede9fe] text-[#5b21b6]',
    yellow: 'bg-[#fef9c3] text-[#854d0e]',
  }
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold', styles[color])}>
      {label}
    </span>
  )
}

function PriorityPill({ level }: { level: 'urgent' | 'high' | 'medium' | 'low' }) {
  const map = {
    urgent: { label: '🔴 Urgent', bg: '#fee2e2', color: '#991b1b' },
    high:   { label: '🟠 High',   bg: '#fef3c7', color: '#92400e' },
    medium: { label: '🔵 Medium', bg: '#dbeafe', color: '#1e40af' },
    low:    { label: '⚪ Low',    bg: '#f3f4f6', color: '#4b5563' },
  }
  const { label, bg, color } = map[level]
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-semibold" style={{ background: bg, color }}>
      {label}
    </span>
  )
}
