import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateApiKey,
  hashApiKey,
  encryptCredential,
  decryptCredential,
  hashPassword,
  verifyPassword,
} from '../src/crypto.js';
import { splitToolName, isToolAllowedForRole } from '../src/toolDispatcher.js';
import { validateServerUrl } from '../src/ssrf.js';

describe('Gateway Pure Units', () => {
  test('API key generation produces umk_ prefix and matching sha256 hash', () => {
    const { rawKey, prefix, hash } = generateApiKey();
    assert.ok(rawKey.startsWith('umk_'));
    assert.equal(prefix, rawKey.slice(0, 8));
    assert.equal(hashApiKey(rawKey), hash);
    assert.notEqual(rawKey, hash);
  });

  test('AES-256-GCM encrypts and decrypts credentials with 32-byte key', () => {
    const dataKey = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');
    const secret = 'cs_secret_12345_token';
    const encrypted = encryptCredential(secret, dataKey);
    assert.notEqual(encrypted, secret);
    assert.match(encrypted, /^([a-f0-9]+):([a-f0-9]+):([a-f0-9]+)$/);

    const decrypted = decryptCredential(encrypted, dataKey);
    assert.equal(decrypted, secret);
  });

  test('Password hashing and verification with scrypt', async () => {
    const hash = await hashPassword('mySecurePassword123');
    assert.ok(await verifyPassword('mySecurePassword123', hash));
    assert.equal(await verifyPassword('wrongPassword', hash), false);
  });

  test('splitToolName splits on the first __', () => {
    const res1 = splitToolName('woo__list_orders');
    assert.deepEqual(res1, { slug: 'woo', toolName: 'list_orders' });

    const res2 = splitToolName('notes__get_note');
    assert.deepEqual(res2, { slug: 'notes', toolName: 'get_note' });

    const res3 = splitToolName('invalidSingleWord');
    assert.equal(res3, null);

    const res4 = splitToolName('woo__sub__tool');
    assert.deepEqual(res4, { slug: 'woo', toolName: 'sub__tool' });
  });

  test('Phase 7 Tool Permissions: Member cannot call create_product or update_order_status', () => {
    // Admin can call all tools
    assert.equal(isToolAllowedForRole('admin', 'woo', 'create_product'), true);
    assert.equal(isToolAllowedForRole('admin', 'woo', 'update_order_status'), true);
    assert.equal(isToolAllowedForRole('admin', 'woo', 'list_orders'), true);
    assert.equal(isToolAllowedForRole('admin', 'notes', 'add_note'), true);

    // Member allowed tools
    assert.equal(isToolAllowedForRole('member', 'woo', 'list_products'), true);
    assert.equal(isToolAllowedForRole('member', 'woo', 'list_orders'), true);
    assert.equal(isToolAllowedForRole('member', 'woo', 'get_order'), true);
    assert.equal(isToolAllowedForRole('member', 'notes', 'list_notes'), true);
    assert.equal(isToolAllowedForRole('member', 'util', 'current_time'), true);

    // Member FORBIDDEN tools
    assert.equal(isToolAllowedForRole('member', 'woo', 'create_product'), false);
    assert.equal(isToolAllowedForRole('member', 'woo', 'update_order_status'), false);
  });

  test('SSRF Classifier blocks localhost, private IPs, userinfo, and non-http', async () => {
    // Non-http
    const resFtp = await validateServerUrl('ftp://example.com');
    assert.equal(resFtp.valid, false);

    // Userinfo
    const resUser = await validateServerUrl('http://user:pass@example.com');
    assert.equal(resUser.valid, false);

    // Localhost / 127.0.0.1
    const resLocal = await validateServerUrl('http://localhost:8080');
    assert.equal(resLocal.valid, false);

    const resIpLocal = await validateServerUrl('http://127.0.0.1:8080');
    assert.equal(resIpLocal.valid, false);

    // Cloud metadata
    const resMeta = await validateServerUrl('http://169.254.169.254/latest/meta-data');
    assert.equal(resMeta.valid, false);

    // Cluster local is permitted
    const resCluster = await validateServerUrl('http://woo-mcp.platform.svc.cluster.local:8080/mcp');
    assert.equal(resCluster.valid, true);
  });
});
