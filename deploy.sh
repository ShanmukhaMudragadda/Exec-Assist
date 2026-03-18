#!/bin/bash
# Run this script ON THE SERVER to pull latest images and restart services.
set -e

echo "==> Pulling latest images from Docker Hub..."
docker compose -f docker-compose.prod.yml pull

echo "==> Restarting services..."
docker compose -f docker-compose.prod.yml up -d --remove-orphans

echo "==> Done! All services are up."
docker compose -f docker-compose.prod.yml ps
