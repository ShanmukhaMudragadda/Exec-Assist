#!/bin/bash
# Run this script ON THE SERVER to pull latest images and restart services.
# Usage:
#   ./deploy.sh              → deploys revamped stack (ports 3001 / 8081)
#   ./deploy.sh prod         → deploys production stack (ports 3000 / 8080)
set -e

TARGET=${1:-revamped}

if [ "$TARGET" = "prod" ]; then
  COMPOSE_FILE="docker-compose.yml"
  STACK_LABEL="production"
else
  COMPOSE_FILE="docker-compose.revamped.yml"
  STACK_LABEL="revamped"
fi

echo "==> Deploying [$STACK_LABEL] using $COMPOSE_FILE ..."

echo "==> Pulling latest images from Docker Hub..."
docker compose -f "$COMPOSE_FILE" pull

echo "==> Restarting services..."
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans

echo "==> Running DB migrations..."
if [ "$TARGET" = "prod" ]; then
  docker exec exec_backend npx prisma migrate deploy
else
  docker exec exec_backend_revamped npx prisma migrate deploy
fi

echo "==> Done! All services are up."
docker compose -f "$COMPOSE_FILE" ps
