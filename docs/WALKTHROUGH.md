# Codebase Walkthrough & Defense Guide

This document is a technical, file-by-file walkthrough written in clear, precise language so that an engineering student can confidently defend every Kubernetes object, cryptographic operation, and MCP protocol path in the project during an interview or defense.

---

## 1. Store Half (`helm/mcp-platform/templates/store/`)

### `store-secrets.yaml`
- Defines two Kubernetes Secrets in the `store` namespace: `store-db` (MariaDB root and wp user passwords) and `store-wp` (WordPress admin credentials and WooCommerce REST API consumer key/secret).
- In development, values are seeded from `deploy/secrets.local.yaml` (gitignored). No plaintext credentials exist in chart templates or committed Git history.

### `mariadb.yaml`
- Deploys `mariadb:11` as a single-replica Deployment backed by a PersistentVolumeClaim (`mariadb-pvc`).
- Mounts persistent storage at `/var/lib/mysql`.
- Probes: Readiness and Liveness probes run `mariadb-admin ping -h localhost -uroot -p"$MARIADB_ROOT_PASSWORD"`.
- Enforces container security context running as non-root user `999` (mysql).

### `wordpress.yaml`
- Deploys `wordpress:6-apache` with PVC mounted at `/var/www/html`.
- Environment variables configure connection parameters pointing to `mariadb.store.svc.cluster.local:3306`.
- Includes reverse-proxy headers handling via `WORDPRESS_CONFIG_EXTRA` to allow Ingress SSL termination and internal REST API calls.

### `store-bootstrap-job.yaml`
- Runs as a Kubernetes Job using `wordpress:cli` under Helm hooks `post-install,post-upgrade`.
- Executes sequentially:
  1. Polls MariaDB port 3306 until accepting connections.
  2. Waits for the Apache container to copy initial WordPress files into `/var/www/html`.
  3. Patches `wp-config.php` so in-cluster HTTP Basic Auth is accepted by WooCommerce REST API (which normally requires HTTPS).
  4. Runs `wp core is-installed` or executes `wp core install` if the database is fresh.
  5. Installs and activates WooCommerce (`woocommerce 9.3.3`).
  6. Enables Cash on Delivery (COD) in `woocommerce_cod_settings` table.
  7. Sets pretty permalinks (`/%postname%/`) so the REST API routes `/wp-json/wc/v3/*` function properly.
  8. Computes `hash_hmac('sha256', $consumer_key, 'wc-api')` and inserts the API key into `wp_woocommerce_api_keys` with truncated key and read_write permissions, skipping if `mcp-gateway` already exists.
  9. Creates the published product "Demo Shirt" ($19.00) if not already present.

### `store-networkpolicies.yaml`
- Enforces `default-deny` ingress on the `store` namespace.
- `mariadb-ingress`: Accepts TCP port 3306 connections **only** from pods labeled `app=wordpress` or `app=store-bootstrap`.
- `wordpress-ingress`: Accepts TCP port 80 connections **only** from `ingress-nginx`, from pods labeled `app=woo-mcp` in the `platform` namespace, or `app=store-bootstrap`.

---

## 2. WooCommerce MCP Server (`services/woo-mcp/`)

### `src/wooClient.ts`
- Pure Node 22 TypeScript client interacting with the WooCommerce REST API v3 (`/wp-json/wc/v3`).
- Constructs standard HTTP Basic Authorization header: `Basic base64(consumer_key:consumer_secret)`.
- Uses `fetch` with `AbortController` enforcing an 8-second timeout per request.
- Preserves upstream WooCommerce HTTP status codes and error bodies inside `WooClientError`.

### `src/tools.ts`
- Defines the 5 exact tools: `list_products`, `create_product`, `list_orders`, `get_order`, and `update_order_status`.
- Explains to LLM models how to filter today's orders by formatting the ISO-8601 timestamp at `00:00:00Z`.
- Catches errors and formats them into standard MCP tool results with `isError: true` and the original status and message.

### `src/server.ts` & `src/index.ts`
- Implements MCP Streamable HTTP on port 8080.
- Serves `/healthz` for Kubernetes readiness/liveness probes.
- Serves POST `/mcp` handling JSON-RPC (`initialize`, `notifications/initialized`, `ping`, `tools/list`, `tools/call`).

---

## 3. Team MCP Gateway (`services/gateway/`)

### `src/crypto.ts`
- **Key Hashing**: When an API key is minted, it is assigned a random `umk_` + 64-character hex secret. The raw key is returned once to the caller. The gateway computes `crypto.createHash('sha256').update(rawKey).digest('hex')` and stores only the hash and the 8-character prefix (`umk_xxxx`).
- **Credential Encryption**: Upstream secrets are encrypted using AES-256-GCM with a 32-byte master key (`GATEWAY_DATA_KEY`). Output format is `iv:tag:ciphertext`.
- **Password Hashing**: User passwords for dashboard login are hashed using Node's native `crypto.scrypt` with a random 16-byte salt and constant-time comparison.

### `src/ssrf.ts`
- Validates URLs before an admin can register or update an upstream server.
- Rejects non-HTTP(S), URLs containing credentials, localhost, 0.0.0.0, link-local (169.254.*), and AWS/GCP metadata endpoints.
- Resolves hostnames through DNS and verifies that returned IPs are not private unless the hostname explicitly ends with `.svc.cluster.local`.

### `src/toolDispatcher.ts`
- **Namespacing**: Prepend `{slug}__` to each tool name and `[{slug}] ` to each description.
- **Fan-out `tools/list`**: Fetches `tools/list` from all enabled upstreams in parallel using `Promise.allSettled()` with a 3-second timeout. If a server times out, its tools are omitted, its status is marked unreachable, and the remaining healthy tools are returned.
- **`tools/call`**: Splits `{slug}__{toolName}` on the first `__`. Injects the decrypted upstream credentials into the request header. Caller Bearer tokens are **never** forwarded upstream. Enforces a 10-second timeout.
- **Role Enforcement (Phase 7)**: Checks caller role. If a member attempts to call `woo__create_product` or `woo__update_order_status`, the call is blocked, an error is returned, and a failed audit entry is recorded.
- **Audit Logging**: Inserts an entry into `audit_log` with user ID, server slug, tool name, execution duration in milliseconds, success boolean, and error text.

### `src/prober.ts`
- Runs in the background every 15 seconds.
- Pings each enabled server with a 3-second timeout.
- Prevents overlapping queries using an `inFlight` Set.
- Updates `server_status` so the dashboard displays real-time health even without active user traffic.

### `src/chat.ts`
- Implements an OpenAI-compatible function calling loop (maximum 5 rounds).
- Provides a strict system prompt warning the model that tool descriptions are untrusted data.
- Executes tool calls through the internal `ToolDispatcher` as the authenticated user, ensuring all chat tool calls appear in the audit log attributed to that user.

---

## 4. Platform Kubernetes Layer (`helm/mcp-platform/templates/platform/`)

### `postgres.yaml`
- Deploys Postgres 16 with PVC on ClusterIP port 5432.
- `networkpolicies.yaml` ensures Postgres accepts connections **only** from pods labeled `app=gateway`.

### `woo-mcp.yaml`, `notes-mcp.yaml`, `util-mcp.yaml`
- ClusterIP only on port 8080.
- No Ingress manifests exist for any of these services.
- NetworkPolicies restrict port 8080 ingress **only** to pods labeled `app=gateway`.

### `platform-ingress.yaml`
- Routes `http://mcp.local/mcp` to the gateway service port 8080.
- Routes `http://dash.local/api` to the gateway service port 8080.
- Routes `http://dash.local/` to the dashboard Nginx service port 80.
