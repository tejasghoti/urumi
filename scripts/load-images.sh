#!/usr/bin/env bash
set -e

CLUSTER_NAME="${1:-mcp-platform}"

echo "==> Compiling TypeScript services on host..."
(cd services/woo-mcp && npm run build)
(cd services/notes-mcp && npm run build)
(cd services/util-mcp && npm run build)
(cd services/gateway && npm run build)
(cd services/dashboard && npm run build)

echo "==> Building container images..."
docker build -t woo-mcp:latest services/woo-mcp
docker build -t notes-mcp:latest services/notes-mcp
docker build -t util-mcp:latest services/util-mcp
docker build -t gateway:latest services/gateway
docker build -t dashboard:latest services/dashboard

echo "==> Loading images into Kind cluster '${CLUSTER_NAME}'..."
kind load docker-image \
  woo-mcp:latest \
  notes-mcp:latest \
  util-mcp:latest \
  gateway:latest \
  dashboard:latest \
  --name "${CLUSTER_NAME}"

echo "==> Images loaded successfully!"
