#!/bin/bash
# Run this script ON THE SERVER to pull latest images and restart services.
set -e

echo "==> Pulling latest images from Docker Hub..."
podman-compose -f docker-compose.prod.yml pull

echo "==> Restarting services..."
podman-compose -f docker-compose.prod.yml up -d --remove-orphans

echo "==> Done! All services are up."
podman-compose -f docker-compose.prod.yml ps
