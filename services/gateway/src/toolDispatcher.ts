import pg from 'pg';
import { decryptCredential } from './crypto.js';

export interface UserContext {
  id: number;
  email: string;
  role: 'admin' | 'member';
}

export interface McpServerRow {
  id: number;
  slug: string;
  display_name: string;
  url: string;
  enabled: boolean;
  auth_type: 'none' | 'bearer' | 'header';
  auth_header_name?: string | null;
  credential_ciphertext?: string | null;
  state?: string;
  detail?: string;
}

export interface AggregatedTool {
  name: string;
  description: string;
  inputSchema: any;
  serverSlug: string;
  originalName: string;
}

export function splitToolName(fullName: string): { slug: string; toolName: string } | null {
  const idx = fullName.indexOf('__');
  if (idx <= 0) return null;
  const slug = fullName.slice(0, idx);
  const toolName = fullName.slice(idx + 2);
  if (!slug || !toolName) return null;
  return { slug, toolName };
}

export function isToolAllowedForRole(role: 'admin' | 'member', slug: string, toolName: string): boolean {
  if (role === 'admin') return true;
  // Phase 7: Members cannot call create_product or update_order_status
  if (slug === 'woo' && (toolName === 'create_product' || toolName === 'update_order_status')) {
    return false;
  }
  return true;
}

export async function forwardJsonRpc(
  url: string,
  method: string,
  params: any,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...headers,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Math.floor(Math.random() * 100000),
        method,
        params,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Upstream returned HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }

    const json: any = await res.json();
    if (json.error) {
      throw new Error(json.error.message || JSON.stringify(json.error));
    }
    return json.result;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function buildUpstreamHeaders(server: McpServerRow, dataKey: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (server.auth_type === 'bearer' && server.credential_ciphertext) {
    const token = decryptCredential(server.credential_ciphertext, dataKey);
    headers['Authorization'] = `Bearer ${token}`;
  } else if (server.auth_type === 'header' && server.auth_header_name && server.credential_ciphertext) {
    const secret = decryptCredential(server.credential_ciphertext, dataKey);
    headers[server.auth_header_name] = secret;
  }
  return headers;
}

export class ToolDispatcher {
  constructor(
    private readonly pool: pg.Pool,
    private readonly dataKey: string
  ) {}

  async listTools(user: UserContext): Promise<AggregatedTool[]> {
    // 1. Fetch enabled servers
    const serversRes = await this.pool.query<McpServerRow>(
      `SELECT s.*, st.state, st.detail
       FROM mcp_servers s
       LEFT JOIN server_status st ON s.id = st.server_id
       WHERE s.enabled = true`
    );

    const servers = serversRes.rows;
    const aggregated: AggregatedTool[] = [];

    // 2. Fetch tools/list with 3s timeout in parallel
    const promises = servers.map(async (srv) => {
      const headers = buildUpstreamHeaders(srv, this.dataKey);
      try {
        const result = await forwardJsonRpc(srv.url, 'tools/list', {}, headers, 3000);
        const tools = result?.tools || [];

        // Update status to connected if previously unreachable
        if (srv.state !== 'connected') {
          await this.pool.query(
            `INSERT INTO server_status (server_id, state, detail, checked_at)
             VALUES ($1, 'connected', 'OK', NOW())
             ON CONFLICT (server_id) DO UPDATE SET state = 'connected', detail = 'OK', checked_at = NOW()`,
            [srv.id]
          );
        }

        for (const t of tools) {
          if (!isToolAllowedForRole(user.role, srv.slug, t.name)) {
            continue; // Phase 7 role-based filtering
          }
          aggregated.push({
            name: `${srv.slug}__${t.name}`,
            description: `[${srv.slug}] ${t.description || ''}`,
            inputSchema: t.inputSchema || { type: 'object' },
            serverSlug: srv.slug,
            originalName: t.name,
          });
        }
      } catch (err: any) {
        // Record status unreachable
        const errMsg = err.message || String(err);
        await this.pool.query(
          `INSERT INTO server_status (server_id, state, detail, checked_at)
           VALUES ($1, 'unreachable', $2, NOW())
           ON CONFLICT (server_id) DO UPDATE SET state = 'unreachable', detail = $2, checked_at = NOW()`,
          [srv.id, errMsg]
        );
      }
    });

    await Promise.allSettled(promises);
    return aggregated;
  }

  async callTool(
    user: UserContext,
    namespacedName: string,
    args: any
  ): Promise<{ result?: any; isError?: boolean; error?: string; durationMs: number }> {
    const startTime = Date.now();
    const split = splitToolName(namespacedName);

    if (!split) {
      const durationMs = Date.now() - startTime;
      const error = `Invalid namespaced tool name: '${namespacedName}'. Expected format {slug}__{toolName}`;
      await this.audit(user.id, 'unknown', namespacedName, durationMs, false, error);
      return { isError: true, error, durationMs };
    }

    const { slug, toolName } = split;

    // Check permissions
    if (!isToolAllowedForRole(user.role, slug, toolName)) {
      const durationMs = Date.now() - startTime;
      const error = `Permission denied: role '${user.role}' cannot execute tool '${namespacedName}'`;
      await this.audit(user.id, slug, toolName, durationMs, false, error);
      return { isError: true, error, durationMs };
    }

    // Lookup server
    const srvRes = await this.pool.query<McpServerRow>(
      `SELECT s.*, st.state, st.detail
       FROM mcp_servers s
       LEFT JOIN server_status st ON s.id = st.server_id
       WHERE s.slug = $1`,
      [slug]
    );

    if (srvRes.rows.length === 0) {
      const durationMs = Date.now() - startTime;
      const error = `Unknown upstream server: '${slug}'`;
      await this.audit(user.id, slug, toolName, durationMs, false, error);
      return { isError: true, error, durationMs };
    }

    const srv = srvRes.rows[0];

    if (!srv.enabled) {
      const durationMs = Date.now() - startTime;
      const error = `Upstream server '${slug}' is currently disabled`;
      await this.audit(user.id, slug, toolName, durationMs, false, error);
      return { isError: true, error, durationMs };
    }

    // Forward to upstream with 10s timeout
    const headers = buildUpstreamHeaders(srv, this.dataKey);
    try {
      const result = await forwardJsonRpc(
        srv.url,
        'tools/call',
        { name: toolName, arguments: args },
        headers,
        10000
      );

      const durationMs = Date.now() - startTime;
      const isToolError = Boolean(result?.isError);
      const errorMsg = isToolError ? (result?.content?.[0]?.text || 'Tool returned error') : null;

      await this.audit(user.id, slug, toolName, durationMs, !isToolError, errorMsg);
      return { result, isError: isToolError, durationMs };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const error = err.message || String(err);
      await this.audit(user.id, slug, toolName, durationMs, false, error);
      return { isError: true, error, durationMs };
    }
  }

  private async audit(
    userId: number,
    serverSlug: string,
    toolName: string,
    durationMs: number,
    success: boolean,
    error: string | null
  ) {
    try {
      await this.pool.query(
        `INSERT INTO audit_log (user_id, server_slug, tool_name, started_at, duration_ms, success, error)
         VALUES ($1, $2, $3, NOW(), $4, $5, $6)`,
        [userId, serverSlug, toolName, durationMs, success, error]
      );
    } catch (e) {
      console.error('Failed to write audit log:', e);
    }
  }
}
