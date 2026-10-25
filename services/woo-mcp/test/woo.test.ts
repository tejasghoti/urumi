import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { executeTool, TOOLS } from '../src/tools.js';
import { WooClient } from '../src/wooClient.js';

describe('woo-mcp tools & client', () => {
  test('TOOLS list contains exact required names', () => {
    const names = TOOLS.map((t) => t.name).sort();
    assert.deepEqual(names, [
      'create_product',
      'get_order',
      'list_orders',
      'list_products',
      'update_order_status',
    ]);
  });

  test('list_orders description explains how to query today orders', () => {
    const listOrders = TOOLS.find((t) => t.name === 'list_orders');
    assert.ok(listOrders);
    assert.match(listOrders.description, /00:00:00Z/);
  });

  test('executeTool handles create_product missing arguments', async () => {
    const mockClient = {} as unknown as WooClient;
    const res = await executeTool(mockClient, 'create_product', {});
    assert.equal(res.isError, true);
    assert.match(res.content[0].text, /Missing required arguments/);
  });

  test('executeTool delegates to WooClient on create_product', async () => {
    const mockClient = {
      createProduct: async (params: any) => ({
        id: 99,
        name: params.name,
        price: String(params.regularPrice),
        permalink: 'http://store.local/product/test',
      }),
    } as unknown as WooClient;

    const res = await executeTool(mockClient, 'create_product', {
      name: 'Test Hat',
      regularPrice: 25,
    });

    assert.equal(res.isError, undefined);
    const parsed = JSON.parse(res.content[0].text);
    assert.equal(parsed.id, 99);
    assert.equal(parsed.name, 'Test Hat');
    assert.equal(parsed.price, '25');
  });

  test('executeTool handles unknown tool', async () => {
    const mockClient = {} as unknown as WooClient;
    const res = await executeTool(mockClient, 'unknown_tool', {});
    assert.equal(res.isError, true);
    assert.match(res.content[0].text, /Unknown tool/);
  });
});
