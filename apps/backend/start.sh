#!/bin/bash
set -e

echo "[1/3] Installing dependencies and generating Prisma client..."
npm install && npx prisma generate

echo "[2/3] Building..."
npm run build

echo "[3/3] Starting server..."
# Kill any previously running instance
pkill -f "node dist/index.js" 2>/dev/null || true

nohup sh -c "npx prisma migrate deploy && node dist/index.js" > app.log 2>&1 &

echo "Server started. Logs: app.log (use 'tail -f app.log' to follow)"
