import express from 'express';
import cookieParser from 'cookie-parser';
import pg from 'pg';
import { ToolDispatcher } from './toolDispatcher.js';
import { createApiRouter } from './routes/api.js';
import { createMcpRouter } from './routes/mcp.js';

export function createGatewayApp(pool: pg.Pool, dataKey: string, cookieSecure = false) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  // Probes
  app.get('/healthz', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'gateway' });
  });

  const dispatcher = new ToolDispatcher(pool, dataKey);

  // Mount MCP router at /mcp
  app.use(createMcpRouter(pool, dispatcher));

  // Mount REST router at /api
  app.use('/api', createApiRouter(pool, dataKey, dispatcher, cookieSecure));

  return { app, dispatcher };
}
