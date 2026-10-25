import express, { Request, Response } from 'express';

export const TOOLS = [
  {
    name: 'current_time',
    description: 'Get the current server time formatted as an ISO timestamp along with time zone information.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'echo',
    description: 'Echo back the input text directly.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The text message to echo back' },
      },
      required: ['text'],
    },
  },
];

export function createUtilApp() {
  const app = express();
  app.use(express.json());

  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', service: 'util-mcp' });
  });

  app.get('/mcp', (_req: Request, res: Response) => {
    res.status(200).json({
      name: 'util-mcp',
      version: '1.0.0',
      transport: 'streamable-http',
      endpoint: '/mcp',
    });
  });

  app.delete('/mcp', (_req: Request, res: Response) => {
    res.status(204).end();
  });

  app.post('/mcp', (req: Request, res: Response) => {
    const { id, method, params } = req.body || {};

    if (id === undefined || id === null) {
      if (method === 'notifications/initialized') {
        res.status(200).end();
        return;
      }
      res.status(204).end();
      return;
    }

    if (method === 'initialize') {
      res.status(200).json({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'util-mcp', version: '1.0.0' },
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
      const args = params?.arguments || {};

      switch (toolName) {
        case 'current_time': {
          const now = new Date();
          const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
          res.status(200).json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      iso: now.toISOString(),
                      timezone,
                      unix: now.getTime(),
                    },
                    null,
                    2
                  ),
                },
              ],
            },
          });
          return;
        }
        case 'echo': {
          const text = args.text ?? '';
          res.status(200).json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: String(text) }],
            },
          });
          return;
        }
        default:
          res.status(200).json({
            jsonrpc: '2.0',
            id,
            result: {
              isError: true,
              content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
            },
          });
          return;
      }
    }

    res.status(200).json({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    });
  });

  return app;
}
