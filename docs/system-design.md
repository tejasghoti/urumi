# System Design: WooCommerce Hosting with a Team MCP Gateway on Kubernetes

## 1. Overview & Architecture

The system provides an enterprise-grade Model Context Protocol (MCP) gateway architecture that securely connects teams, AI assistants, and external IDE clients (Cursor, MCP Inspector, Claude Code) to internal business systems running inside a Kubernetes cluster.

### Four Layers
1. **Store Layer (`store` namespace)**:
   - **WordPress 6 + WooCommerce 9.3+ + MariaDB 11**.
   - Serves the storefront at `http://store.local` and accepts Cash on Delivery (COD) checkouts.
   - Initialized by a declarative Kubernetes Job (`store-bootstrap`) using `wordpress:cli`.
2. **WooCommerce MCP Server (`woo-mcp` in `platform` namespace)**:
   - Custom TypeScript MCP server communicating over Streamable HTTP (`/mcp`) on ClusterIP:8080.
   - Bridges MCP tool calls directly to the WooCommerce REST API v3 using HTTP Basic Authentication (`ck_*` and `cs_*`).
   - ClusterIP only; strictly internal and unreachable from outside the cluster.
3. **Team MCP Gateway (`gateway` in `platform` namespace)**:
   - Postgres 16 persistence for users, API keys, upstream server registrations, prober status, and audit logs.
   - Dual-role: acts as an MCP client to registered upstreams (`woo-mcp`, `notes-mcp`, `util-mcp`) and as an authenticated MCP server to the world.
   - Handles Bearer API key authentication (`umk_...`), namespacing (`{slug}__{toolName}`), fan-out list/call with per-upstream timeouts, credential encryption (AES-256-GCM), SSRF protection, and comprehensive audit logging.
4. **Dashboard & Chat (`dashboard` in `platform` namespace)**:
   - React + Vite SPA served via Nginx.
   - Communicates with `/api` endpoints on the same origin (routed by Ingress).
   - Features Server management, Team & API Key minting/revocation, full Audit logging table, and an interactive AI Chat panel with real-time tool execution traces.

```
[ External User / MCP Inspector / Cursor ]
                   │
                   ▼ (HTTP / Ingress: mcp.local / dash.local)
         ┌───────────────────┐
         │   Ingress NGINX   │
         └─────────┬─────────┘
                   │
       ┌───────────┴───────────┐
       ▼                       ▼
┌──────────────┐     ┌──────────────────┐
│  Dashboard   │     │ Team MCP Gateway │
│ (React/Nginx)│     │    (Node 22 TS)  │
└──────────────┘     └─────────┬────────┘
                               │
            ┌──────────────────┼──────────────────┐
            ▼                  ▼                  ▼
     ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
     │   woo-mcp    │   │  notes-mcp   │   │   util-mcp   │
     │ (ClusterIP)  │   │ (ClusterIP)  │   │ (ClusterIP)  │
     └──────┬───────┘   └──────────────┘   └──────────────┘
            │ (REST API v3)
            ▼
     ┌──────────────┐
     │  WordPress   │
     │+ WooCommerce │
     └──────┬───────┘
            ▼
     ┌──────────────┐
     │   MariaDB    │
     └──────────────┘
```

---

## 2. Design Decisions & Trade-offs

### Why WooCommerce REST API Instead of WP-CLI or Direct MySQL?
1. **Process and Pod Isolation**: The `woo-mcp` service runs in a separate pod, namespace, and lifecycle. Running WP-CLI would require mounting the shared `/var/www/html` filesystem into `woo-mcp` pods (creating PVC lock contention) or executing commands over SSH/exec.
2. **Database Credential Boundary**: Interacting directly via MySQL would require the MCP server to hold MariaDB root/app credentials and bypass WooCommerce business logic (taxes, coupons, stock adjustments, order status transitions, action hooks).
3. **Contract Stability**: The WooCommerce REST API v3 is the documented, versioned public API of WooCommerce with standardized pagination, validation, and error reporting.

### Tool Namespacing (`{slug}__{toolName}`)
To prevent naming collisions when multiple upstreams expose common tool names (e.g., both a WooCommerce server and an ERP exposing `list_orders`), the gateway namespaces all tools:
- The separator is double underscore (`__`).
- Slug format is enforced: `^[a-z][a-z0-9-]{1,30}$`.
- When forwarding calls to upstream, the gateway splits on the first `__`, resolves the target server by `slug`, and forwards the original `toolName` (`list_orders`).
- Descriptions are prefixed with `[slug] ` for clear model context.

### Upstream Fan-out, Timeouts, and Dead Server Handling
- **`tools/list`**: The gateway issues `tools/list` to all enabled servers concurrently using `Promise.allSettled()` with a strict **3-second timeout**. If an upstream is slow, hangs, or crashes:
  - That server's tools are safely omitted from the aggregated response.
  - Its state in `server_status` is updated to `unreachable` with the error message.
  - The overall `tools/list` call still succeeds and returns tools from all healthy upstreams.
- **`tools/call`**: Dispatches with a strict **10-second timeout**. If an upstream times out, a JSON-RPC error is returned to the client and recorded in `audit_log` as a failure.
- **Background Prober**: An independent loop runs every 15 seconds (with 3-second timeout), skipping servers that have a probe currently in flight. This ensures the dashboard reflects outages even without active traffic.

### Why Gateway Replicas Stay at 1
The 2024/2025 MCP Streamable HTTP / SSE protocol specifies stateful session handshakes (`initialize`, `Mcp-Session-Id`, notifications). Maintaining sessions in-memory requires either:
1. A single gateway replica (simple, deterministic, zero distributed lock overhead).
2. Or complex session affinity (sticky sessions in Ingress) or external session storage (Redis).
For this team platform, pinning `replicas: 1` eliminates race conditions and session drops.

---

## 3. Production Deployment Path (k3s on VPS)

Local development uses Kind with `values-local.yaml`. Moving to a production single-node or multi-node k3s VPS requires **zero template changes**; only `values-prod.yaml` is applied:
- **DNS / Hostnames**: Public FQDNs (`store.example.com`, `dash.example.com`, `mcp.example.com`) replace `.local`.
- **Ingress Controller**: k3s built-in Traefik or ingress-nginx with automated cert-manager TLS.
- **Storage Class**: k3s default `local-path` replaces Kind's `standard`.
- **Cookie Security**: `cookieSecure: true` enforces the `Secure` flag on HTTPS.
- **Container Registry**: Images pushed to a registry (GHCR / Docker Hub) with semantic version tags.

---

## 4. Out of Scope / Future Work

The following features were intentionally excluded from the initial core scope to prioritize security, interview defensibility, and reliability:
- Multi-store multi-tenant provisioning (automatic namespace creation, Helm-per-store operators).
- OAuth2/OIDC integration as an alternative to API keys.
- Dynamic arbitrary container deployment for external MCP servers.
- Multi-replica gateway with distributed Redis session state and rate limiting.
