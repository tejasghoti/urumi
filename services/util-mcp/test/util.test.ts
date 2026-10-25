import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS } from '../src/server.js';

describe('util-mcp', () => {
  test('TOOLS list contains exact required names', () => {
    const names = TOOLS.map((t) => t.name).sort();
    assert.deepEqual(names, ['current_time', 'echo']);
  });
});
