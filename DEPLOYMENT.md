# Deployment Guide

**Local machine:** Windows
**Server:** Rocky Linux at `172.16.138.14` (uses Podman instead of Docker)
**Workflow:** Build Docker images on Windows → push to Docker Hub → pull and run on server via podman-compose

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

### SSH into the server

```bash
ssh shanmukh@172.16.138.14
```

### Verify podman-compose is installed

```bash
podman-compose version
```

If not installed:
```bash
sudo dnf install -y python3-pip
sudo pip3 install podman-compose
```

### Create project folders

```bash
mkdir -p ~/executive-management/nginx
cd ~/executive-management
```

### Open firewall ports

The server uses `iptables` directly (FirewallD is not running):

```bash
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 8080 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 3000 -j ACCEPT

# Save rules so they persist after reboot
sudo dnf install -y iptables-services
sudo service iptables save
sudo systemctl enable iptables
```

Verify ports are open:
```bash
sudo iptables -L INPUT -n | grep -E "80|8080|3000"
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

### `.env` (project root)

The `.env` file at `C:\Users\shanmukha.mudragadda\Desktop\Executive-Management\.env` should contain:

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
SMTP_FROM=TaskZilla <noreply@forsysinc.com>

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

---

## Every Deploy — Step by Step

### Step 1 — Build images on Windows (PowerShell)

```powershell
cd C:\Users\shanmukha.mudragadda\Desktop\Executive-Management

# Backend
docker build -t shanmukhamudragadda/exec-backend:latest ./apps/backend

# Web app
docker build --build-arg VITE_API_URL=http://172.16.138.14:3000 -t shanmukhamudragadda/exec-web:latest ./apps/web

# Mobile web
docker build --build-arg EXPO_PUBLIC_API_URL=http://172.16.138.14:3000 -t shanmukhamudragadda/exec-mobile-web:latest -f ./apps/mobile/Dockerfile.web ./apps/mobile
```

### Step 2 — Push images to Docker Hub

```powershell
docker push shanmukhamudragadda/exec-backend:latest
docker push shanmukhamudragadda/exec-web:latest
docker push shanmukhamudragadda/exec-mobile-web:latest
```

### Step 3 — Copy config files to server

```powershell
scp C:\Users\shanmukha.mudragadda\Desktop\Executive-Management\docker-compose.prod.yml shanmukh@172.16.138.14:~/executive-management/

scp C:\Users\shanmukha.mudragadda\Desktop\Executive-Management\deploy.sh shanmukh@172.16.138.14:~/executive-management/

scp C:\Users\shanmukha.mudragadda\Desktop\Executive-Management\.env shanmukh@172.16.138.14:~/executive-management/

scp C:\Users\shanmukha.mudragadda\Desktop\Executive-Management\nginx\nginx.conf shanmukh@172.16.138.14:~/executive-management/nginx/
```

### Step 4 — Deploy on server

```bash
ssh shanmukh@172.16.138.14
cd ~/executive-management
chmod +x deploy.sh
./deploy.sh
```

### Step 5 — Run migrations (first deploy only)

```bash
podman-compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy
```

---

## Verify Deployment

```bash
podman-compose -f docker-compose.prod.yml ps
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
| `http://172.16.138.14` | React web app login page |
| `http://172.16.138.14:8080` | Mobile app in browser |
| `http://172.16.138.14:3000/health` | `{"status":"ok"}` |

---

## Future Deploys

Whenever you make code changes:

1. Build and push updated images from Windows (Step 1 & 2 above — only rebuild changed services)
2. Copy any updated config files if changed (Step 3)
3. SSH into server and run `./deploy.sh`

Migrations run automatically on every deploy via `deploy.sh`.

---

## Useful Commands (on server)

```bash
# Check container status
podman-compose -f docker-compose.prod.yml ps

# Follow all logs
podman-compose -f docker-compose.prod.yml logs -f

# Follow logs for one service
podman-compose -f docker-compose.prod.yml logs -f backend

# Restart one service
podman-compose -f docker-compose.prod.yml restart backend

# Open a shell in the backend container
podman-compose -f docker-compose.prod.yml exec backend sh

# Open PostgreSQL shell
podman-compose -f docker-compose.prod.yml exec postgres psql -U postgres -d executive_management

# Run migrations manually
podman-compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy

# Stop everything (keeps data)
podman-compose -f docker-compose.prod.yml down

# Stop and delete all data (irreversible!)
podman-compose -f docker-compose.prod.yml down -v
```

---

## Troubleshooting

**Container keeps restarting:**
```bash
podman-compose -f docker-compose.prod.yml logs backend
```

**Cannot connect to database:**
```bash
podman-compose -f docker-compose.prod.yml ps postgres
# Must show: healthy
```

**Port already in use:**
```bash
sudo ss -tlnp | grep -E "80|8080|3000"
```

**Podman asks to select image registry:**
Make sure all images in `docker-compose.prod.yml` have `docker.io/` prefix:
```yaml
image: docker.io/shanmukhamudragadda/exec-backend:latest
```

**Port 80 blocked (Podman rootless):**
```bash
sudo sysctl net.ipv4.ip_unprivileged_port_start=80
```

**CORS errors after deployment:**
Make sure `FRONTEND_URL` in `.env` includes both frontend URLs separated by comma:
```env
FRONTEND_URL=http://172.16.138.14,http://172.16.138.14:8080
```

**SELinux blocking container networking:**
```bash
sudo setsebool -P httpd_can_network_connect 1
sudo setsebool -P httpd_can_network_relay 1
```

**Out of disk space:**
```bash
podman system prune -a
```
