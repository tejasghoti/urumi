import { WooClient } from './wooClient.js';
import { createWooMcpApp } from './server.js';

const PORT = parseInt(process.env.PORT || '8080', 10);
const baseUrl = process.env.WC_BASE_URL || 'http://wordpress.store.svc.cluster.local';
const consumerKey = process.env.WC_CONSUMER_KEY || '';
const consumerSecret = process.env.WC_CONSUMER_SECRET || '';

const client = new WooClient({
  baseUrl,
  consumerKey,
  consumerSecret,
  timeoutMs: 8000,
});

const app = createWooMcpApp(client);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`woo-mcp listening on port ${PORT}`);
});
