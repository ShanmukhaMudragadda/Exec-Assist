# Executive Management Tool - Quick Setup Guide

## Prerequisites
- Node.js 20+
- PostgreSQL 15+
- Docker & Docker Compose (optional, for easy PostgreSQL setup)

> **No Redis required.** Emails are sent directly and the daily report scheduler runs via node-cron.

---

## Option A: Run with Docker (Recommended)

```bash
# 1. Copy env file and fill in your values
cp .env.example .env

# 2. Start PostgreSQL + backend
docker compose up -d

# 3. Run DB migrations (first time only)
docker compose exec backend npx prisma migrate deploy

# 4. Install & start web frontend
cd apps/web
cp .env.example .env
npm install
npm run dev
```

Access the app at: http://localhost:5173

---

## Option B: Run Locally

### 1. Database Setup
```bash
# Start only PostgreSQL via Docker (no Redis needed)
docker compose up postgres -d

# Or use an existing local PostgreSQL instance — just set DATABASE_URL in .env
```

### 2. Backend Setup
```bash
cd apps/backend
cp ../../.env.example .env
# Edit .env — at minimum set DATABASE_URL, JWT_SECRET, GEMINI_API_KEY

npm install
npx prisma generate
npx prisma migrate dev  # Creates all tables

npm run dev  # Starts on http://localhost:3000
```

### 3. Web Frontend Setup
```bash
cd apps/web
cp .env.example .env
npm install
npm run dev  # Starts on http://localhost:5173
```

### 4. Mobile App Setup
```bash
cd apps/mobile
cp .env.example .env
# If testing on a physical device, set EXPO_PUBLIC_API_URL to your machine's local IP
# e.g. EXPO_PUBLIC_API_URL=http://192.168.1.10:3000

npm install
npx expo start
# Press 'a' for Android emulator, 'i' for iOS simulator, 'w' for browser
```

---

## Environment Variables

### Minimum required to run:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Any random string, min 32 characters |

### Required for AI features:

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Google Gemini API key (free tier available) |
| `GEMINI_MODEL` | Model to use — default: `gemini-1.5-flash` |

**Get a Gemini API key (free):**
1. Go to https://aistudio.google.com/app/apikey
2. Click "Get API Key"
3. Paste into your `.env` as `GEMINI_API_KEY=...`

### Required for email notifications:

| Variable | Description |
|----------|-------------|
| `SMTP_HOST` | e.g. `smtp.gmail.com` |
| `SMTP_PORT` | `587` (TLS) or `465` (SSL) |
| `SMTP_USER` | Your email address |
| `SMTP_PASSWORD` | App password (not your login password) |
| `SMTP_FROM` | Sender address shown in emails |

> Email is optional for local testing. The app runs fine without it — email calls fail silently.

**Gmail setup:** Go to Google Account → Security → App Passwords → generate one for "Mail".

---

## How Email Works (No Redis)

Emails are sent directly, fire-and-forget:
- **Task assignment** — sent immediately when a task is assigned
- **Workspace invitation** — sent when a member is invited
- **@mention** — sent when someone is @mentioned in a comment
- **Daily report** — scheduled via `node-cron`, runs every minute and sends to users whose `dailyReportTime` matches the current time (set in Profile settings)

---

## Feature Overview

| Feature | Endpoint / Route |
|---------|-----------------|
| Register / Login | `POST /auth/register`, `POST /auth/login` |
| Create Workspace | `POST /workspaces` |
| Invite Members | `POST /workspaces/:id/invitations` |
| Create Tasks | `POST /workspaces/:id/tasks` |
| Filter Tasks | `GET /workspaces/:id/tasks?status=todo&priority=high&tags=backend` |
| Real-time Updates | Socket.io — `task:created`, `task:updated`, `task:deleted`, `task:commented` |
| Upload Audio | `POST /workspaces/:id/transcripts/upload` |
| Paste Transcript | `POST /workspaces/:id/transcripts/text` |
| AI Task Generation | `POST /workspaces/:id/transcripts/:id/generate-tasks` |
| Analytics | `GET /workspaces/:id/analytics` |
| Health Check | `GET /health` |

---

## Production Deployment

### Backend → Railway
```bash
cd apps/backend
npm run build
# Push to Railway — it auto-detects the Dockerfile
# Set these env vars in the Railway dashboard:
#   DATABASE_URL, JWT_SECRET, GEMINI_API_KEY, SMTP_*, FRONTEND_URL
```

### Frontend → Vercel
```bash
cd apps/web
npm run build
vercel --prod
# Set VITE_API_URL=https://your-backend.railway.app in Vercel project settings
```

### Mobile → EAS Build
```bash
cd apps/mobile
npm install -g eas-cli
eas login
eas build --platform all
# Builds for iOS and Android via Expo's cloud build service
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `prisma migrate dev` fails | Check `DATABASE_URL` is correct and PostgreSQL is running |
| Backend starts but emails don't send | Check `SMTP_*` vars; email errors are logged but don't crash the app |
| AI task generation returns empty | Verify `GEMINI_API_KEY` is valid; test at https://aistudio.google.com |
| Mobile can't reach backend | Use your machine's LAN IP in `EXPO_PUBLIC_API_URL`, not `localhost` |
| Socket.io not connecting | Ensure `FRONTEND_URL` in backend `.env` matches the web app's URL |
