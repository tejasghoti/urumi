import express, { Request, Response } from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  PingRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { WooClient } from './wooClient.js';
import { TOOLS, executeTool } from './tools.js';

export function createWooMcpApp(client: WooClient) {
  const app = express();
  app.use(express.json());

  // Probes
  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', service: 'woo-mcp' });
  });

  // Official MCP SDK Server instance
  const mcpServer = new Server(
    { name: 'woo-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS as any };
  });

  mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    const result = await executeTool(client, request.params.name, request.params.arguments);
    return result as any;
  });

  mcpServer.setRequestHandler(PingRequestSchema, async () => {
    return {};
  });

  // MCP Streamable HTTP endpoint
  app.get('/mcp', (_req: Request, res: Response) => {
    res.status(200).json({
      name: 'woo-mcp',
      version: '1.0.0',
      transport: 'streamable-http',
      endpoint: '/mcp',
    });
  });

  app.delete('/mcp', (_req: Request, res: Response) => {
    res.status(204).end();
  });

  app.post('/mcp', async (req: Request, res: Response) => {
    const body = req.body;
    if (!body || typeof body !== 'object') {
      res.status(400).json({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error: invalid JSON' },
      });
      return;
    }

    const { id, method, params } = body;

    // Handle notifications (no id)
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
            serverInfo: { name: 'woo-mcp', version: '1.0.0' },
          },
        });
        return;
      }

      if (method === 'ping') {
        res.status(200).json({ jsonrpc: '2.0', id, result: {} });
        return;
      }

      if (method === 'tools/list') {
        res.status(200).json({
          jsonrpc: '2.0',
          id,
          result: { tools: TOOLS },
        });
        return;
      }

      if (method === 'tools/call') {
        const toolName = params?.name;
        const toolArgs = params?.arguments || {};
        const result = await executeTool(client, toolName, toolArgs);
        res.status(200).json({
          jsonrpc: '2.0',
          id,
          result,
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
        error: { code: -32603, message: err.message || 'Internal error' },
      });
    }
  });

  return app;
}
