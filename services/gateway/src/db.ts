import pg from 'pg';
import { hashPassword } from './crypto.js';

const { Pool } = pg;

export interface DbConfig {
  connectionString?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
}

export function createPool(config?: DbConfig): pg.Pool {
  if (config?.connectionString) {
    return new Pool({ connectionString: config.connectionString });
  }
  return new Pool({
    host: process.env.POSTGRES_HOST || 'gateway-db.platform.svc.cluster.local',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    user: process.env.POSTGRES_USER || 'gateway',
    password: process.env.POSTGRES_PASSWORD || 'gateway_db_password_change_me',
    database: process.env.POSTGRES_DB || 'gateway',
    connectionTimeoutMillis: 5000,
  });
}

export async function runMigrationsAndSeeds(pool: pg.Pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Schema
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS api_keys (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        prefix TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_used_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS mcp_servers (
        id SERIAL PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        url TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        auth_type TEXT NOT NULL DEFAULT 'none' CHECK (auth_type IN ('none', 'bearer', 'header')),
        auth_header_name TEXT,
        credential_ciphertext TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS server_status (
        server_id INTEGER PRIMARY KEY REFERENCES mcp_servers(id) ON DELETE CASCADE,
        state TEXT NOT NULL CHECK (state IN ('connected', 'unreachable', 'disabled')),
        detail TEXT,
        checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        server_slug TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        duration_ms INTEGER NOT NULL,
        success BOOLEAN NOT NULL,
        error TEXT
      );
    `);

    // Seed users
    const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'admin_password_change_me';
    const memberPassword = process.env.SEED_MEMBER_PASSWORD || 'member_password_change_me';

    const adminCheck = await client.query('SELECT id FROM users WHERE email = $1', ['admin@example.com']);
    if (adminCheck.rows.length === 0) {
      const adminHash = await hashPassword(adminPassword);
      await client.query(
        'INSERT INTO users (email, name, password_hash, role) VALUES ($1, $2, $3, $4)',
        ['admin@example.com', 'Admin User', adminHash, 'admin']
      );
    }

    const memberCheck = await client.query('SELECT id FROM users WHERE email = $1', ['member@example.com']);
    if (memberCheck.rows.length === 0) {
      const memberHash = await hashPassword(memberPassword);
      await client.query(
        'INSERT INTO users (email, name, password_hash, role) VALUES ($1, $2, $3, $4)',
        ['member@example.com', 'Member User', memberHash, 'member']
      );
    }

    // Seed initial upstream servers if absent
    const defaultServers = [
      {
        slug: 'woo',
        displayName: 'WooCommerce Store',
        url: 'http://woo-mcp.platform.svc.cluster.local:8080/mcp',
      },
      {
        slug: 'notes',
        displayName: 'Company Notes',
        url: 'http://notes-mcp.platform.svc.cluster.local:8080/mcp',
      },
      {
        slug: 'util',
        displayName: 'Utilities',
        url: 'http://util-mcp.platform.svc.cluster.local:8080/mcp',
      },
    ];

    for (const s of defaultServers) {
      const sCheck = await client.query('SELECT id FROM mcp_servers WHERE slug = $1', [s.slug]);
      if (sCheck.rows.length === 0) {
        const ins = await client.query(
          'INSERT INTO mcp_servers (slug, display_name, url, enabled, auth_type) VALUES ($1, $2, $3, true, $4) RETURNING id',
          [s.slug, s.displayName, s.url, 'none']
        );
        const serverId = ins.rows[0].id;
        await client.query(
          'INSERT INTO server_status (server_id, state, detail) VALUES ($1, $2, $3) ON CONFLICT (server_id) DO NOTHING',
          [serverId, 'connected', 'Initialized']
        );
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
