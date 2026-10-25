import { Router, Request, Response } from 'express';
import pg from 'pg';
import { hashApiKey } from '../crypto.js';
import { ToolDispatcher, UserContext } from '../toolDispatcher.js';

export function createMcpRouter(pool: pg.Pool, dispatcher: ToolDispatcher): Router {
  const router = Router();

  // Auth helper for Bearer umk_...
  async function authenticateMcpRequest(req: Request): Promise<UserContext | null> {
    const auth = req.headers['authorization'];
    if (!auth || !auth.startsWith('Bearer ')) {
      return null;
    }

    const token = auth.slice(7).trim();
    if (!token.startsWith('umk_')) {
      return null;
    }

    const hash = hashApiKey(token);
    const keyRes = await pool.query(
      `SELECT k.id as key_id, k.revoked_at, u.id as user_id, u.email, u.role
       FROM api_keys k
       JOIN users u ON k.user_id = u.id
       WHERE k.key_hash = $1`,
      [hash]
    );

    if (keyRes.rows.length === 0) {
      return null;
    }

    const key = keyRes.rows[0];
    if (key.revoked_at !== null) {
      return null; // Key is revoked
    }

    // Update last_used_at asynchronously
    pool.query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [key.key_id]).catch(() => {});

    return {
      id: key.user_id,
      email: key.email,
      role: key.role,
    };
  }

  router.get('/mcp', async (req: Request, res: Response) => {
    const user = await authenticateMcpRequest(req);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized: valid Bearer API key required' });
      return;
    }

    res.status(200).json({
      name: 'team-mcp-gateway',
      version: '1.0.0',
      transport: 'streamable-http',
      endpoint: '/mcp',
      user: { email: user.email, role: user.role },
    });
  });

  router.delete('/mcp', async (req: Request, res: Response) => {
    res.status(204).end();
  });

  router.post('/mcp', async (req: Request, res: Response) => {
    const user = await authenticateMcpRequest(req);
    if (!user) {
      res.status(401).json({
        jsonrpc: '2.0',
        id: req.body?.id ?? null,
        error: { code: -32000, message: 'Unauthorized: missing, unknown, or revoked API key' },
      });
      return;
    }

    const { id, method, params } = req.body || {};

    if (id === undefined || id === null) {
      if (method === 'notifications/initialized') {
        res.status(200).end();
        return;
      }
      res.status(204).end();
      return;
    }

    try {
      if (method === 'initialize') {
        res.status(200).json({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'team-mcp-gateway', version: '1.0.0' },
          },
        });
        return;
      }

      if (method === 'ping') {
        res.status(200).json({ jsonrpc: '2.0', id, result: {} });
        return;
      }

      if (method === 'tools/list') {
        const tools = await dispatcher.listTools(user);
        res.status(200).json({
          jsonrpc: '2.0',
          id,
          result: {
            tools: tools.map((t) => ({
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema,
            })),
          },
        });
        return;
      }

      if (method === 'tools/call') {
        const toolName = params?.name;
        const toolArgs = params?.arguments || {};
        const dispatchRes = await dispatcher.callTool(user, toolName, toolArgs);

        if (dispatchRes.isError) {
          res.status(200).json({
            jsonrpc: '2.0',
            id,
            result: {
              isError: true,
              content: [{ type: 'text', text: dispatchRes.error || 'Tool execution error' }],
            },
          });
          return;
        }

        res.status(200).json({
          jsonrpc: '2.0',
          id,
          result: dispatchRes.result,
        });
        return;
      }

      res.status(200).json({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      });
    } catch (err: any) {
      res.status(200).json({
        jsonrpc: '2.0',
        id,
        error: { code: -32603, message: err.message || 'Internal server error' },
      });
    }
  });

  return router;
}
