# Deployment Guide

**Local machine:** Windows
**Server:** Rocky Linux at `172.16.138.14` (root user, Docker CE)
**Workflow:** Build Docker images on Windows → push to Docker Hub → pull and run on server via docker compose

---

## Architecture

```
Internet (port 80 / 8080 / 3000)
        │
   [ Nginx Proxy ]  ← exec_nginx
        │
   ┌────┼────────────────┐
   │    │                │
[Web]  [API]        [Mobile Web]
exec_web  exec_backend  exec_mobile_web
(Vite/React) (Node/Express) (Expo Web)
                │
          [ PostgreSQL ]
           exec_postgres
```

| Container | What it does | Public URL |
|---|---|---|
| `exec_postgres` | Database | Internal only |
| `exec_backend` | REST API + WebSockets | `http://172.16.138.14:3000` |
| `exec_web` | React web app | `http://172.16.138.14` |
| `exec_mobile_web` | Mobile app on web | `http://172.16.138.14:8080` |
| `exec_nginx` | Reverse proxy | Ports 80, 8080, 3000 |

---

## One-Time Server Setup

### SSH into the server as root

```bash
ssh root@172.16.138.14
```

### Install Docker CE

```bash
# Remove podman if present
dnf remove -y podman podman-compose buildah

# Add Docker repo
dnf config-manager --add-repo https://download.docker.com/linux/rhel/docker-ce.repo

# Install Docker
dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Start and enable Docker
systemctl start docker
systemctl enable docker

# Verify
docker --version
docker compose version
```

### Create project folder

```bash
mkdir -p ~/executive-management/nginx
cd ~/executive-management
```

### Open firewall ports

```bash
# If firewalld is running
firewall-cmd --permanent --add-port=80/tcp
firewall-cmd --permanent --add-port=8080/tcp
firewall-cmd --permanent --add-port=3000/tcp
firewall-cmd --reload

# Verify
firewall-cmd --list-ports
```

If firewalld is not running, use iptables:
```bash
iptables -I INPUT -p tcp --dport 80 -j ACCEPT
iptables -I INPUT -p tcp --dport 8080 -j ACCEPT
iptables -I INPUT -p tcp --dport 3000 -j ACCEPT

# Save rules
dnf install -y iptables-services
service iptables save
systemctl enable iptables
```

---

## One-Time Local Setup

### Docker Hub account

1. Create a free account at [hub.docker.com](https://hub.docker.com)
2. Log in from PowerShell:
   ```powershell
   docker login
   ```

---

## Configuration Files

### `.env` (project root — Windows)

```env
# Docker Hub
DOCKER_USERNAME=shanmukhamudragadda

# Database
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_db_password
POSTGRES_DB=executive_management

# Backend
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d

# Google Gemini AI
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@forsysinc.com
SMTP_PASSWORD=your_app_password
SMTP_FROM=EAssist <noreply@forsysinc.com>

# URLs — for server deployment
FRONTEND_URL=http://172.16.138.14,http://172.16.138.14:8080
VITE_API_URL=http://172.16.138.14:3000

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

> For local testing change `FRONTEND_URL=http://localhost,http://localhost:8080` and `VITE_API_URL=http://localhost:3000`

### `nginx/nginx.conf`

```nginx
events { worker_connections 1024; }

http {
  include /etc/nginx/mime.types;
  default_type application/octet-stream;

  # Web app — http://172.16.138.14
  server {
    listen 80;
    server_name _;
    location / {
      proxy_pass http://web:80;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
    }
  }

  # Mobile web — http://172.16.138.14:8080
  server {
    listen 8080;
    server_name _;
    location / {
      proxy_pass http://mobile-web:80;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
    }
  }

  # Backend API — http://172.16.138.14:3000
  server {
    listen 3000;
    server_name _;
    client_max_body_size 50M;
    location / {
      proxy_pass         http://backend:3000;
      proxy_http_version 1.1;
      proxy_set_header   Upgrade $http_upgrade;
      proxy_set_header   Connection "upgrade";
      proxy_set_header   Host $host;
      proxy_set_header   X-Real-IP $remote_addr;
      proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_read_timeout 300s;
    }
  }
}
```

### `deploy.sh`

```bash
#!/bin/bash
set -e
echo "==> Pulling latest images..."
docker compose -f docker-compose.prod.yml pull
echo "==> Restarting services..."
docker compose -f docker-compose.prod.yml up -d --remove-orphans
echo "==> Done!"
docker compose -f docker-compose.prod.yml ps
```

---

## Every Deploy — Step by Step

### Step 1 — Build images on Windows (PowerShell)

```powershell
cd C:\Users\shanmukha.mudragadda\Desktop\Executive-Management

# Backend (only if backend code changed)
docker build -t shanmukhamudragadda/exec-backend:latest ./apps/backend

# Web app (only if web code changed)
docker build --build-arg VITE_API_URL=http://172.16.138.14:3000 -t shanmukhamudragadda/exec-web:latest ./apps/web

# Mobile web (only if mobile code changed)
docker build --build-arg EXPO_PUBLIC_API_URL=http://172.16.138.14:3000 -t shanmukhamudragadda/exec-mobile-web:latest -f ./apps/mobile/Dockerfile.web ./apps/mobile
```

> Only rebuild the services whose code changed to save time.

### Step 2 — Push images to Docker Hub

```powershell
docker push shanmukhamudragadda/exec-backend:latest
docker push shanmukhamudragadda/exec-web:latest
docker push shanmukhamudragadda/exec-mobile-web:latest
```

### Step 3 — Copy config files to server (first deploy or when configs change)

```powershell
scp docker-compose.prod.yml root@172.16.138.14:~/executive-management/
scp deploy.sh root@172.16.138.14:~/executive-management/
scp .env root@172.16.138.14:~/executive-management/
scp nginx/nginx.conf root@172.16.138.14:~/executive-management/nginx/
```

### Step 4 — Deploy on server

```bash
ssh root@172.16.138.14
cd ~/executive-management
chmod +x deploy.sh
./deploy.sh
```

### Step 5 — Run migrations (first deploy only)

```bash
docker compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy
```

---

## Verify Deployment

```bash
docker compose -f docker-compose.prod.yml ps
```

All 5 containers should show `Up`:
- `exec_postgres`
- `exec_backend`
- `exec_web`
- `exec_mobile_web`
- `exec_nginx`

Open in browser:

| URL | Expected |
|---|---|
| `http://172.16.138.14` | EAssist web app login page |
| `http://172.16.138.14:8080` | Mobile app in browser |
| `http://172.16.138.14:3000/health` | `{"status":"ok"}` |

---

## Future Deploys (routine code changes)

1. Build only the changed service images (Step 1)
2. Push to Docker Hub (Step 2)
3. SSH into server and run `./deploy.sh` (Step 4)

> Config files (Step 3) only need to be copied when `.env`, `nginx.conf`, `docker-compose.prod.yml`, or `deploy.sh` change.

---

## Useful Commands (on server)

```bash
# Check container status
docker compose -f docker-compose.prod.yml ps

# Follow all logs
docker compose -f docker-compose.prod.yml logs -f

# Follow logs for one service
docker compose -f docker-compose.prod.yml logs -f backend

# Restart one service
docker compose -f docker-compose.prod.yml restart backend

# Open a shell in the backend container
docker compose -f docker-compose.prod.yml exec backend sh

# Open PostgreSQL shell
docker compose -f docker-compose.prod.yml exec postgres psql -U postgres -d executive_management

# Run migrations manually
docker compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy

# Stop everything (keeps data)
docker compose -f docker-compose.prod.yml down

# Stop and delete all data (irreversible!)
docker compose -f docker-compose.prod.yml down -v

# Remove unused images to free disk space
docker image prune -a
```

---

## Troubleshooting

**Container keeps restarting:**
```bash
docker compose -f docker-compose.prod.yml logs backend
```

**Cannot connect to database:**
```bash
docker compose -f docker-compose.prod.yml ps postgres
# Must show: healthy
```

**Port already in use:**
```bash
ss -tlnp | grep -E "80|8080|3000"
```

**New code changes not showing after deploy:**
```bash
# Force remove cached images and re-pull
docker compose -f docker-compose.prod.yml down
docker rmi shanmukhamudragadda/exec-web:latest
docker rmi shanmukhamudragadda/exec-mobile-web:latest
docker compose -f docker-compose.prod.yml up -d
```
Then hard-refresh browser with `Ctrl+Shift+R`.

**CORS errors after deployment:**
Make sure `FRONTEND_URL` in `.env` includes both frontend URLs separated by comma:
```env
FRONTEND_URL=http://172.16.138.14,http://172.16.138.14:8080
```

**SELinux blocking container networking:**
```bash
setsebool -P httpd_can_network_connect 1
setsebool -P httpd_can_network_relay 1
```

**Out of disk space:**
```bash
docker system prune -a
```
