import { createPool, runMigrationsAndSeeds } from './db.js';
import { createGatewayApp } from './server.js';
import { Prober } from './prober.js';

const PORT = parseInt(process.env.PORT || '8080', 10);
const dataKey = process.env.GATEWAY_DATA_KEY || 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
const cookieSecure = process.env.COOKIE_SECURE === 'true';

async function main() {
  const pool = createPool();

  console.log('Connecting to Postgres and applying migrations/seeds...');
  let connected = false;
  for (let i = 0; i < 30; i++) {
    try {
      await runMigrationsAndSeeds(pool);
      connected = true;
      break;
    } catch (err: any) {
      console.log(`Waiting for database (${err.message})... retrying in 2s`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  if (!connected) {
    console.error('Failed to connect to Postgres after 30 attempts.');
    process.exit(1);
  }

  console.log('Database initialized successfully.');

  const { app } = createGatewayApp(pool, dataKey, cookieSecure);

  // Start background prober (runs every 15s)
  const prober = new Prober(pool, dataKey);
  prober.start(15000);

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Team MCP Gateway listening on port ${PORT}`);
  });

  const shutdown = () => {
    console.log('Shutting down gracefully...');
    prober.stop();
    server.close(() => {
      pool.end().then(() => {
        process.exit(0);
      });
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Fatal initialization error:', err);
  process.exit(1);
});
