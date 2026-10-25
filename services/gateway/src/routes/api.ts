import { Router, Request, Response, NextFunction } from 'express';
import pg from 'pg';
import crypto from 'node:crypto';
import {
  encryptCredential,
  generateApiKey,
  hashApiKey,
  hashPassword,
  verifyPassword,
} from '../crypto.js';
import { validateServerUrl } from '../ssrf.js';
import { ToolDispatcher, UserContext } from '../toolDispatcher.js';
import { runChatLoop } from '../chat.js';

export interface SessionData {
  userId: number;
  email: string;
  role: 'admin' | 'member';
  name: string;
}

const activeSessions = new Map<string, SessionData>();

export function createApiRouter(
  pool: pg.Pool,
  dataKey: string,
  dispatcher: ToolDispatcher,
  cookieSecure: boolean
): Router {
  const router = Router();

  // Helper middleware for session authentication
  const requireUser = async (req: Request, res: Response, next: NextFunction) => {
    const sessionId = req.cookies?.session;
    if (!sessionId || !activeSessions.has(sessionId)) {
      res.status(401).json({ error: 'Unauthorized: authentication required' });
      return;
    }
    const session = activeSessions.get(sessionId)!;
    (req as any).user = {
      id: session.userId,
      email: session.email,
      role: session.role,
      name: session.name,
    };
    next();
  };

  const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as UserContext;
    if (user?.role !== 'admin') {
      res.status(403).json({ error: 'Forbidden: admin privilege required' });
      return;
    }
    next();
  };

  // POST /api/login
  router.post('/login', async (req: Request, res: Response) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      res.status(400).json({ error: 'Missing email or password' });
      return;
    }

    try {
      const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
      if (result.rows.length === 0) {
        res.status(401).json({ error: 'Invalid email or password' });
        return;
      }

      const user = result.rows[0];
      const valid = await verifyPassword(password, user.password_hash);
      if (!valid) {
        res.status(401).json({ error: 'Invalid email or password' });
        return;
      }

      const sessionId = crypto.randomBytes(32).toString('hex');
      activeSessions.set(sessionId, {
        userId: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
      });

      res.cookie('session', sessionId, {
        httpOnly: true,
        sameSite: 'lax',
        secure: cookieSecure,
        path: '/',
      });

      res.status(200).json({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Login error' });
    }
  });

  // POST /api/logout
  router.post('/logout', (req: Request, res: Response) => {
    const sessionId = req.cookies?.session;
    if (sessionId) {
      activeSessions.delete(sessionId);
    }
    res.clearCookie('session', { path: '/' });
    res.status(200).json({ ok: true });
  });

  // GET /api/me
  router.get('/me', requireUser, (req: Request, res: Response) => {
    const user = (req as any).user;
    res.status(200).json(user);
  });

  // GET /api/servers - user
  router.get('/servers', requireUser, async (req: Request, res: Response) => {
    const user = (req as any).user as UserContext;
    try {
      const srvRes = await pool.query(`
        SELECT s.id, s.slug, s.display_name, s.url, s.enabled, s.auth_type, s.auth_header_name,
               (s.credential_ciphertext IS NOT NULL AND s.credential_ciphertext != '') as "hasCredential",
               st.state, st.detail, st.checked_at
        FROM mcp_servers s
        LEFT JOIN server_status st ON s.id = st.server_id
        ORDER BY s.id ASC
      `);

      // Load tools advertised to this user
      const tools = await dispatcher.listTools(user);

      const serversWithTools = srvRes.rows.map((s) => ({
        ...s,
        tools: tools
          .filter((t) => t.serverSlug === s.slug)
          .map((t) => ({ name: t.name, originalName: t.originalName, description: t.description })),
      }));

      res.status(200).json(serversWithTools);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/servers - admin
  router.post('/servers', requireUser, requireAdmin, async (req: Request, res: Response) => {
    const { slug, displayName, url, authType = 'none', authHeaderName, credential } = req.body || {};

    // Validate slug regex: ^[a-z][a-z0-9-]{1,30}$
    if (!slug || !/^[a-z][a-z0-9-]{1,30}$/.test(slug)) {
      res.status(400).json({ error: 'Invalid slug. Must match ^[a-z][a-z0-9-]{1,30}$' });
      return;
    }
    if (!displayName || !url) {
      res.status(400).json({ error: 'Missing required fields: displayName, url' });
      return;
    }

    // SSRF Check
    const ssrf = await validateServerUrl(url);
    if (!ssrf.valid) {
      res.status(400).json({ error: `SSRF validation failed: ${ssrf.reason}` });
      return;
    }

    let encryptedSecret = null;
    if (credential && credential.trim() !== '') {
      encryptedSecret = encryptCredential(credential, dataKey);
    }

    try {
      const ins = await pool.query(
        `INSERT INTO mcp_servers (slug, display_name, url, auth_type, auth_header_name, credential_ciphertext)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, slug, display_name, url, enabled, auth_type, auth_header_name,
                   (credential_ciphertext IS NOT NULL) as "hasCredential"`,
        [slug, displayName, url, authType, authHeaderName || null, encryptedSecret]
      );

      await pool.query(
        `INSERT INTO server_status (server_id, state, detail) VALUES ($1, 'connected', 'Initialized')`,
        [ins.rows[0].id]
      );

      res.status(201).json(ins.rows[0]);
    } catch (err: any) {
      if (err.code === '23505') {
        res.status(409).json({ error: `Server with slug '${slug}' already exists` });
        return;
      }
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/servers/:slug - admin
  router.patch('/servers/:slug', requireUser, requireAdmin, async (req: Request, res: Response) => {
    const { slug } = req.params;
    const { displayName, url, enabled, authType, authHeaderName, credential } = req.body || {};

    try {
      const existing = await pool.query('SELECT * FROM mcp_servers WHERE slug = $1', [slug]);
      if (existing.rows.length === 0) {
        res.status(404).json({ error: 'Server not found' });
        return;
      }
      const srv = existing.rows[0];

      if (url && url !== srv.url) {
        const ssrf = await validateServerUrl(url);
        if (!ssrf.valid) {
          res.status(400).json({ error: `SSRF validation failed: ${ssrf.reason}` });
          return;
        }
      }

      let encryptedSecret = srv.credential_ciphertext;
      // An empty credential field on update means keep existing secret
      if (credential !== undefined && credential !== null && credential.trim() !== '') {
        encryptedSecret = encryptCredential(credential, dataKey);
      }

      const updated = await pool.query(
        `UPDATE mcp_servers
         SET display_name = COALESCE($1, display_name),
             url = COALESCE($2, url),
             enabled = COALESCE($3, enabled),
             auth_type = COALESCE($4, auth_type),
             auth_header_name = COALESCE($5, auth_header_name),
             credential_ciphertext = $6,
             updated_at = NOW()
         WHERE slug = $7
         RETURNING id, slug, display_name, url, enabled, auth_type, auth_header_name,
                   (credential_ciphertext IS NOT NULL AND credential_ciphertext != '') as "hasCredential"`,
        [
          displayName ?? null,
          url ?? null,
          enabled ?? null,
          authType ?? null,
          authHeaderName ?? null,
          encryptedSecret,
          slug,
        ]
      );

      // If disabled, update server_status immediately
      if (enabled === false) {
        await pool.query(
          `UPDATE server_status SET state = 'disabled', detail = 'Disabled by admin' WHERE server_id = $1`,
          [srv.id]
        );
      }

      res.status(200).json(updated.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/servers/:slug - admin
  router.delete('/servers/:slug', requireUser, requireAdmin, async (req: Request, res: Response) => {
    const { slug } = req.params;
    try {
      const del = await pool.query('DELETE FROM mcp_servers WHERE slug = $1 RETURNING id', [slug]);
      if (del.rows.length === 0) {
        res.status(404).json({ error: 'Server not found' });
        return;
      }
      res.status(200).json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/users - admin
  router.get('/users', requireUser, requireAdmin, async (_req: Request, res: Response) => {
    try {
      const uRes = await pool.query('SELECT id, email, name, role, created_at FROM users ORDER BY id ASC');
      res.status(200).json(uRes.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/users - admin invite
  router.post('/users', requireUser, requireAdmin, async (req: Request, res: Response) => {
    const { email, name, role = 'member', password } = req.body || {};
    if (!email || !name || !password) {
      res.status(400).json({ error: 'Missing required fields: email, name, password' });
      return;
    }
    if (role !== 'admin' && role !== 'member') {
      res.status(400).json({ error: 'Invalid role' });
      return;
    }

    try {
      const passHash = await hashPassword(password);
      const ins = await pool.query(
        'INSERT INTO users (email, name, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role, created_at',
        [email.toLowerCase().trim(), name, passHash, role]
      );
      res.status(201).json(ins.rows[0]);
    } catch (err: any) {
      if (err.code === '23505') {
        res.status(409).json({ error: 'User with this email already exists' });
        return;
      }
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/keys - current user mints their own key
  router.post('/keys', requireUser, async (req: Request, res: Response) => {
    const user = (req as any).user as UserContext;
    const { rawKey, prefix, hash } = generateApiKey();

    try {
      const ins = await pool.query(
        `INSERT INTO api_keys (user_id, prefix, key_hash)
         VALUES ($1, $2, $3)
         RETURNING id, prefix, created_at`,
        [user.id, prefix, hash]
      );

      res.status(201).json({
        id: ins.rows[0].id,
        prefix: ins.rows[0].prefix,
        apiKey: rawKey, // Shown once
        createdAt: ins.rows[0].created_at,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/users/:id/keys - admin or owning user
  router.post('/users/:id/keys', requireUser, async (req: Request, res: Response) => {
    const caller = (req as any).user as UserContext;
    const targetUserId = parseInt(String(req.params.id), 10);

    if (caller.role !== 'admin' && caller.id !== targetUserId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const { rawKey, prefix, hash } = generateApiKey();
    try {
      const ins = await pool.query(
        `INSERT INTO api_keys (user_id, prefix, key_hash)
         VALUES ($1, $2, $3)
         RETURNING id, prefix, created_at`,
        [targetUserId, prefix, hash]
      );

      res.status(201).json({
        id: ins.rows[0].id,
        prefix: ins.rows[0].prefix,
        apiKey: rawKey,
        createdAt: ins.rows[0].created_at,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/keys - list keys for current user (or admin)
  router.get('/keys', requireUser, async (req: Request, res: Response) => {
    const user = (req as any).user as UserContext;
    try {
      let query = `
        SELECT k.id, k.user_id, u.email as "userEmail", k.prefix, k.revoked_at, k.created_at, k.last_used_at
        FROM api_keys k
        JOIN users u ON k.user_id = u.id
      `;
      const params: any[] = [];
      if (user.role !== 'admin') {
        query += ' WHERE k.user_id = $1';
        params.push(user.id);
      }
      query += ' ORDER BY k.id DESC';

      const resKeys = await pool.query(query, params);
      res.status(200).json(resKeys.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/keys/:id - admin, or owning user sets revoked_at
  router.delete('/keys/:id', requireUser, async (req: Request, res: Response) => {
    const user = (req as any).user as UserContext;
    const keyId = parseInt(String(req.params.id), 10);

    try {
      const existing = await pool.query('SELECT * FROM api_keys WHERE id = $1', [keyId]);
      if (existing.rows.length === 0) {
        res.status(404).json({ error: 'API key not found' });
        return;
      }
      const keyRow = existing.rows[0];
      if (user.role !== 'admin' && keyRow.user_id !== user.id) {
        res.status(403).json({ error: 'Forbidden: cannot revoke another user key' });
        return;
      }

      await pool.query('UPDATE api_keys SET revoked_at = NOW() WHERE id = $1', [keyId]);
      res.status(200).json({ ok: true, revokedAt: new Date().toISOString() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/audit - admin
  router.get('/audit', requireUser, requireAdmin, async (req: Request, res: Response) => {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '50'), 10)));
    const offset = (page - 1) * limit;

    try {
      const countRes = await pool.query('SELECT count(*) FROM audit_log');
      const total = parseInt(countRes.rows[0].count, 10);

      const rows = await pool.query(
        `SELECT a.id, a.user_id, u.email as "userEmail", a.server_slug, a.tool_name,
                a.started_at, a.duration_ms, a.success, a.error
         FROM audit_log a
         LEFT JOIN users u ON a.user_id = u.id
         ORDER BY a.started_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      res.status(200).json({
        total,
        page,
        limit,
        items: rows.rows,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/chat - user
  router.post('/chat', requireUser, async (req: Request, res: Response) => {
    const user = (req as any).user as UserContext;
    const { messages } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'messages must be a non-empty array' });
      return;
    }

    try {
      const result = await runChatLoop(messages, user, dispatcher);
      res.status(200).json(result);
    } catch (err: any) {
      const status = err.status || 500;
      res.status(status).json({ error: err.message || 'Chat processing error' });
    }
  });

  return router;
}
