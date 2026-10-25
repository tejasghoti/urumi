# WooCommerce Hosting with a Team MCP Gateway on Kubernetes

An interview-defensible platform that provides unified, secure Model Context Protocol (MCP) access to a team-shared WooCommerce store running inside a Kubernetes cluster.

---

## What This System Is

A team shares one WooCommerce store through a single authenticated MCP gateway endpoint. The architecture consists of four distinct layers running inside Kubernetes:

1. **Store Layer (`store` namespace)**: WordPress 6, WooCommerce 9.3+, and MariaDB 11. End-users can browse the catalog at `http://store.local`, add products to their cart, and checkout with Cash on Delivery (COD). Orders are persistent across pod restarts and visible in WP Admin.
2. **WooCommerce MCP Server (`woo-mcp` in `platform` namespace)**: A custom TypeScript MCP server communicating over Streamable HTTP (`/mcp`) on ClusterIP:8080. Exposes products and orders as standardized MCP tools by communicating with WooCommerce REST API v3 using HTTP Basic Auth. Strictly internal; no Ingress.
3. **Team MCP Gateway (`gateway` in `platform` namespace)**: The central control point. Acts as an MCP client to registered upstreams (`woo-mcp`, `notes-mcp`, `util-mcp`) and as an authenticated MCP server to external clients. Backed by Postgres 16. Enforces SHA-256 hashed API key authentication, namespacing (`{slug}__{toolName}`), AES-256-GCM credential encryption, SSRF protection, per-upstream timeouts, and full audit logging.
4. **Dashboard & Chat (`dashboard` in `platform` namespace)**: React + Vite control panel served by Nginx. Admins manage servers and team members. All team members can mint scoped MCP keys and use an integrated AI chat interface with full tool execution traces.

Nothing except the gateway communicates with upstream MCP servers. The chat and external clients have zero backdoor access to WooCommerce.

---

## Standout: Role-Based Tool Permissions (Phase 7)

The gateway implements strict, defense-in-depth role-based access control:
- **Members**: Granted safe read-only and operational inspection tools: `woo__list_products`, `woo__list_orders`, `woo__get_order`, and all `notes` and `util` tools.
- **Admins**: Granted full tool execution, including privileged mutations: `woo__create_product` and `woo__update_order_status`.
- **Enforcement**: Forbidden tools are automatically stripped from `tools/list` responses for that user. If an unauthorized user attempts to call a forbidden tool, `tools/call` blocks execution, returns an explicit permission error, and records a failed security audit entry. The AI chat panel and dashboard dynamically adapt to these permissions.

---

## Prerequisites

- **Docker Desktop** (or Colima / Docker Engine)
- **Kind** (Kubernetes in Docker)
- **kubectl**
- **Helm 3**
- **Node.js 22+**

---

## Exact Local Setup Commands

### 1. Configure `/etc/hosts`
Add the following line to `/etc/hosts`:
```
127.0.0.1  store.local dash.local mcp.local
```

### 2. Create Kind Cluster
```bash
kind create cluster --name mcp-platform --config deploy/kind-config.yaml
```

### 3. Install NGINX Ingress Controller
Install the official Kind-specific NGINX ingress manifest:
```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=90s
```

### 4. Configure Local Secrets
Copy the example template (never commit real secrets):
```bash
cp deploy/secrets.local.yaml.example deploy/secrets.local.yaml
```
*(The template includes development defaults for testing. Replace them as needed).*

### 5. Build and Load Images into Kind
```bash
./scripts/load-images.sh mcp-platform
```

### 6. Deploy the Platform via Helm
```bash
helm upgrade --install mcp-platform helm/mcp-platform \
  -f helm/mcp-platform/values-local.yaml \
  -f deploy/secrets.local.yaml
```

### 7. Automated One-Command Alternative
To run all of the above automatically in one step:
```bash
./scripts/dev-up.sh
```

---

## Seeded Logins & Credentials

Credentials are seeded on first boot from `deploy/secrets.local.yaml`:
- **Admin**: `admin@example.com` | Password: from `SEED_ADMIN_PASSWORD` (default: `admin_password_change_me`)
- **Member**: `member@example.com` | Password: from `SEED_MEMBER_PASSWORD` (default: `member_password_change_me`)
- **WooCommerce Admin**: `admin` | Password: from `WORDPRESS_ADMIN_PASSWORD` (default: `wp_admin_password_change_me`)

---

## Connecting External Clients (Cursor / MCP Inspector)

External clients never receive WooCommerce credentials; they authenticate using only their personal Gateway API key.

1. Log into the Dashboard at `http://dash.local` as `member@example.com`.
2. Under **Team & Keys**, click **"+ Mint API Key"**.
3. Copy the generated key (`umk_...`).
4. In Cursor (`settings.json`) or MCP Inspector:
```json
{
  "mcpServers": {
    "team": {
      "url": "http://mcp.local/mcp",
      "headers": {
        "Authorization": "Bearer umk_YOUR_MINTED_KEY"
      }
    }
  }
}
```

---

## Placing a Cash on Delivery (COD) Order

1. Open `http://store.local` in your browser.
2. Select **"Demo Shirt"** ($19.00), click **"Add to Cart"**, and go to checkout.
3. Fill in your billing name and address, choose **Cash on Delivery**, and click **"Place Order"**.
4. Order details are immediately accessible in WP Admin (`http://store.local/wp-admin`) and retrievable via the AI Chat or MCP Inspector.

---

## Using the AI Chat

1. Log into `http://dash.local` and click **AI Chat**.
2. **Create a Product** (Admin):
   > *"Create a product named Agent Hat for 42 dollars."*
   The assistant executes `woo__create_product` and the product immediately appears on `http://store.local`.
3. **Query Orders**:
   > *"What orders came in today?"*
   The assistant calls `woo__list_orders` with `after` set to `00:00:00Z` and lists today's store purchases.
4. **Multi-Server Inquiry**:
   > *"What is our shipping policy, and what time is it?"*
   The assistant queries `notes__get_note` and `util__current_time` concurrently.

---

## Upgrades and Rollbacks

Deploy updates using Helm:
```bash
helm upgrade mcp-platform helm/mcp-platform \
  -f helm/mcp-platform/values-local.yaml \
  -f deploy/secrets.local.yaml
```

Roll back to a previous revision:
```bash
helm rollback mcp-platform 1
```

### Rollback Safety:
- **Safe to Roll Back**: Stateless services (`woo-mcp`, `notes-mcp`, `util-mcp`, `gateway`, `dashboard`). Rollback updates container images and configurations seamlessly.
- **Unsafe to Roll Back**: Never roll back a release if an intervening database migration dropped columns or altered existing data formats. In this project, database migrations only add tables (`IF NOT EXISTS`), preserving rollback safety across application versions.

---

## Documentation Directory

- [`docs/system-design.md`](docs/system-design.md): Deep architectural defense, timeout policies, fan-out mechanics, and VPS path.
- [`docs/threat-model.md`](docs/threat-model.md): Confused deputy analysis, credential isolation, SSRF defenses, and prompt injection bounds.
- [`docs/DEMO.md`](docs/DEMO.md): Click-by-click script of the complete definition of done.
- [`docs/WALKTHROUGH.md`](docs/WALKTHROUGH.md): File-by-file code and manifest defense.
- [`scripts/e2e-store.md`](scripts/e2e-store.md): Store API curl reference and persistence testing.
