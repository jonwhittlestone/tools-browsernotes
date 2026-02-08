#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
REMOTE_HOST="doylestonex"
REMOTE_DIR="~/browsernotes"
TRAEFIK_CONFIG_DIR="~/traefik/config/dynamic"

echo "=== Browser Notes Deployment to $REMOTE_HOST ==="
echo "Project root: $PROJECT_ROOT"
echo ""

# Pre-flight checks
if [ ! -f "$SCRIPT_DIR/.env" ]; then
    echo "ERROR: $SCRIPT_DIR/.env not found. Copy .env.example and fill in values."
    exit 1
fi

# Test SSH
echo "Testing SSH connection..."
ssh "$REMOTE_HOST" "echo 'SSH OK'" || { echo "ERROR: Cannot connect to $REMOTE_HOST"; exit 1; }

# Create remote directories
echo "Setting up remote directories..."
ssh "$REMOTE_HOST" "mkdir -p $REMOTE_DIR/data $REMOTE_DIR/deploy/podman-pi"

# Prune old images to save disk space
echo "Pruning old images on Pi..."
ssh "$REMOTE_HOST" "podman image prune -f" || true

# Sync project files
echo "Syncing project files..."
rsync -avz --delete \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='.venv' \
    --exclude='__pycache__' \
    --exclude='.pytest_cache' \
    --exclude='dist' \
    --exclude='data' \
    --exclude='deploy/podman-pi/.env' \
    --exclude='deploy/podman-pi/data' \
    "$PROJECT_ROOT/" "$REMOTE_HOST:$REMOTE_DIR/"

# Deploy config files
echo "Deploying config files..."
scp "$SCRIPT_DIR/.env" "$REMOTE_HOST:$REMOTE_DIR/deploy/podman-pi/.env"
scp "$SCRIPT_DIR/browsernotes-traefik.yml" "$REMOTE_HOST:$TRAEFIK_CONFIG_DIR/browsernotes.yml"

# Build on Pi (native ARM64)
echo "Building container on Pi..."
ssh "$REMOTE_HOST" "cd $REMOTE_DIR && podman build -f Containerfile -t browsernotes-api:latest ."

# Stop existing container
echo "Stopping existing container..."
ssh "$REMOTE_HOST" "cd $REMOTE_DIR/deploy/podman-pi && podman-compose down" || true

# Start new container
echo "Starting new container..."
ssh "$REMOTE_HOST" "cd $REMOTE_DIR/deploy/podman-pi && podman-compose up -d"

# Wait for health check
echo "Waiting for health check..."
sleep 3

# Verify
echo "Checking internal health..."
ssh "$REMOTE_HOST" "curl -sf http://localhost:3004/health" && echo " OK" || echo " FAILED"

echo ""
echo "Checking public health..."
curl -sf "https://howapped.zapto.org/browsernotes/health" && echo " OK" || echo " FAILED (Traefik may need a moment)"

# Log deployment
DEPLOY_TIME=$(date -Iseconds)
GIT_COMMIT=$(git -C "$PROJECT_ROOT" rev-parse --short HEAD)
GIT_BRANCH=$(git -C "$PROJECT_ROOT" branch --show-current)
ssh "$REMOTE_HOST" "echo '$DEPLOY_TIME $GIT_BRANCH $GIT_COMMIT' >> $REMOTE_DIR/data/deploys.log"

echo ""
echo "=== Deployment complete ==="
echo "Branch: $GIT_BRANCH"
echo "Commit: $GIT_COMMIT"
echo "URL: https://howapped.zapto.org/browsernotes"
