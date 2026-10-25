import express, { Request, Response } from 'express';

export interface Note {
  id: number;
  title: string;
  body: string;
}

export const TOOLS = [
  {
    name: 'list_notes',
    description: 'List all company notes and policies. Returns an array of notes with id and title.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'add_note',
    description: 'Add a new company note or policy. Returns the created note.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title of the note' },
        body: { type: 'string', description: 'Body text of the note' },
      },
      required: ['title', 'body'],
    },
  },
  {
    name: 'get_note',
    description: 'Retrieve the full details and body of a note by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Unique note ID' },
      },
      required: ['id'],
    },
  },
];

export function createNotesStore() {
  const notes: Note[] = [
    { id: 1, title: 'Shipping policy', body: 'COD only, ships in 2 days' },
    { id: 2, title: 'Returns', body: '30 days' },
  ];
  let nextId = 3;

  return {
    listNotes: () => notes.map((n) => ({ id: n.id, title: n.title })),
    addNote: (title: string, body: string) => {
      const note: Note = { id: nextId++, title, body };
      notes.push(note);
      return note;
    },
    getNote: (id: number) => notes.find((n) => n.id === id) || null,
  };
}

export function createNotesApp(store = createNotesStore()) {
  const app = express();
  app.use(express.json());

  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', service: 'notes-mcp' });
  });

  app.get('/mcp', (_req: Request, res: Response) => {
    res.status(200).json({
      name: 'notes-mcp',
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
          serverInfo: { name: 'notes-mcp', version: '1.0.0' },
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
        case 'list_notes': {
          const list = store.listNotes();
          res.status(200).json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: JSON.stringify(list, null, 2) }],
            },
          });
          return;
        }
        case 'add_note': {
          if (!args.title || !args.body) {
            res.status(200).json({
              jsonrpc: '2.0',
              id,
              result: {
                isError: true,
                content: [{ type: 'text', text: 'Missing required arguments: title, body' }],
              },
            });
            return;
          }
          const created = store.addNote(args.title, args.body);
          res.status(200).json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: JSON.stringify(created, null, 2) }],
            },
          });
          return;
        }
        case 'get_note': {
          if (typeof args.id !== 'number') {
            res.status(200).json({
              jsonrpc: '2.0',
              id,
              result: {
                isError: true,
                content: [{ type: 'text', text: 'Missing or invalid argument: id (number)' }],
              },
            });
            return;
          }
          const note = store.getNote(args.id);
          if (!note) {
            res.status(200).json({
              jsonrpc: '2.0',
              id,
              result: {
                isError: true,
                content: [{ type: 'text', text: `Note not found for ID ${args.id}` }],
              },
            });
            return;
          }
          res.status(200).json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: JSON.stringify(note, null, 2) }],
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
