import { WooClient, WooClientError } from './wooClient.js';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
}

export const TOOLS: ToolDefinition[] = [
  {
    name: 'list_products',
    description: 'List products from WooCommerce. Returns id, name, price, status, and permalink. Supports optional search filter and perPage limit (default 20).',
    inputSchema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Search query to filter products by title or content' },
        perPage: { type: 'number', description: 'Number of items to return (default 20)' },
      },
    },
  },
  {
    name: 'create_product',
    description: 'Create a published simple product in WooCommerce with stock available and catalog visibility. Returns id, name, price, and permalink.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Product title/name' },
        regularPrice: { type: ['string', 'number'], description: 'Product regular price in store currency' },
      },
      required: ['name', 'regularPrice'],
    },
  },
  {
    name: 'list_orders',
    description: "List orders from WooCommerce. To list orders created today, pass 'after' as today's ISO-8601 date at 00:00:00Z (e.g. 2026-10-24T00:00:00Z). Returns id, number, status, total, currency, date_created, and line item names.",
    inputSchema: {
      type: 'object',
      properties: {
        after: { type: 'string', description: "Limit response to resources published after a given ISO-8601 compliant date (e.g. '2026-10-24T00:00:00Z')" },
        status: {
          type: 'string',
          enum: ['pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded', 'failed'],
          description: 'Limit response to resources with a given status',
        },
        perPage: { type: 'number', description: 'Number of items to return (default 20)' },
      },
    },
  },
  {
    name: 'get_order',
    description: 'Get full details for a single order by ID, including order items, total, status, and billing name.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Unique order ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'update_order_status',
    description: 'Update the status of an existing WooCommerce order. Returns the order ID and the updated status.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Unique order ID' },
        status: {
          type: 'string',
          enum: ['pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded', 'failed'],
          description: 'New order status',
        },
      },
      required: ['id', 'status'],
    },
  },
];

export async function executeTool(client: WooClient, name: string, args: any): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  try {
    switch (name) {
      case 'list_products': {
        const products = await client.listProducts(args);
        return {
          content: [{ type: 'text', text: JSON.stringify(products, null, 2) }],
        };
      }
      case 'create_product': {
        if (!args || !args.name || args.regularPrice === undefined) {
          return {
            isError: true,
            content: [{ type: 'text', text: 'Missing required arguments: name, regularPrice' }],
          };
        }
        const created = await client.createProduct(args);
        return {
          content: [{ type: 'text', text: JSON.stringify(created, null, 2) }],
        };
      }
      case 'list_orders': {
        const orders = await client.listOrders(args);
        return {
          content: [{ type: 'text', text: JSON.stringify(orders, null, 2) }],
        };
      }
      case 'get_order': {
        if (!args || typeof args.id !== 'number') {
          return {
            isError: true,
            content: [{ type: 'text', text: 'Missing or invalid required argument: id (number)' }],
          };
        }
        const order = await client.getOrder(args.id);
        return {
          content: [{ type: 'text', text: JSON.stringify(order, null, 2) }],
        };
      }
      case 'update_order_status': {
        if (!args || typeof args.id !== 'number' || !args.status) {
          return {
            isError: true,
            content: [{ type: 'text', text: 'Missing required arguments: id, status' }],
          };
        }
        const updated = await client.updateOrderStatus(args.id, args.status);
        return {
          content: [{ type: 'text', text: JSON.stringify(updated, null, 2) }],
        };
      }
      default:
        return {
          isError: true,
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        };
    }
  } catch (err: any) {
    if (err instanceof WooClientError) {
      return {
        isError: true,
        content: [{ type: 'text', text: `WooCommerce Error ${err.status}: ${err.body}` }],
      };
    }
    return {
      isError: true,
      content: [{ type: 'text', text: `Execution Error: ${err.message || String(err)}` }],
    };
  }
}
