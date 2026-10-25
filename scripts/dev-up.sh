#!/usr/bin/env bash
set -e

CLUSTER_NAME="mcp-platform"

echo "=========================================================="
echo " Starting WooCommerce & Team MCP Gateway Development Stack"
echo "=========================================================="

# 1. Check prerequisites
for cmd in docker kind kubectl helm; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "Error: Required command '$cmd' is not installed."
    exit 1
  fi
done

# 2. Kind cluster
if ! kind get clusters 2>/dev/null | grep -q "^${CLUSTER_NAME}$"; then
  echo "==> Creating Kind cluster '${CLUSTER_NAME}'..."
  kind create cluster --name "${CLUSTER_NAME}" --config deploy/kind-config.yaml
else
  echo "==> Kind cluster '${CLUSTER_NAME}' already exists."
fi

# 3. Ingress controller
if ! kubectl get namespace ingress-nginx &>/dev/null; then
  echo "==> Installing ingress-nginx provider manifest..."
  kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
fi

echo "==> Waiting for ingress-nginx controller..."
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=90s

# 4. Secrets template check
if [ ! -f deploy/secrets.local.yaml ]; then
  echo "==> deploy/secrets.local.yaml not found. Copying from example template..."
  cp deploy/secrets.local.yaml.example deploy/secrets.local.yaml
fi

# 5. Build and load images
echo "==> Building and loading service images..."
./scripts/load-images.sh "${CLUSTER_NAME}"

# 6. Helm deployment
echo "==> Deploying Helm release 'mcp-platform'..."
helm upgrade --install mcp-platform helm/mcp-platform \
  -f helm/mcp-platform/values-local.yaml \
  -f deploy/secrets.local.yaml

echo "==> Waiting for workloads to become ready..."
kubectl rollout status deployment/mariadb -n store --timeout=120s
kubectl rollout status deployment/wordpress -n store --timeout=120s
kubectl rollout status deployment/postgres -n platform --timeout=120s
kubectl rollout status deployment/woo-mcp -n platform --timeout=120s
kubectl rollout status deployment/notes-mcp -n platform --timeout=120s
kubectl rollout status deployment/util-mcp -n platform --timeout=120s
kubectl rollout status deployment/gateway -n platform --timeout=120s
kubectl rollout status deployment/dashboard -n platform --timeout=120s

echo "=========================================================="
echo " System is READY!"
echo " Ensure the following lines are in /etc/hosts:"
echo " 127.0.0.1  store.local dash.local mcp.local"
echo " "
echo " Store:     http://store.local"
echo " Dashboard: http://dash.local"
echo " MCP:       http://mcp.local/mcp"
echo "=========================================================="
