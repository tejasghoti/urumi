import pg from 'pg';
import { buildUpstreamHeaders, forwardJsonRpc, McpServerRow } from './toolDispatcher.js';

export class Prober {
  private inFlight = new Set<number>();
  private intervalTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly pool: pg.Pool,
    private readonly dataKey: string
  ) {}

  start(intervalMs = 15000) {
    this.intervalTimer = setInterval(() => this.runProbeRound(), intervalMs);
    // Run first round shortly after boot
    setTimeout(() => this.runProbeRound(), 1000);
  }

  stop() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  async runProbeRound() {
    try {
      const res = await this.pool.query<McpServerRow>('SELECT * FROM mcp_servers');
      for (const server of res.rows) {
        if (!server.enabled) {
          // Disabled is derived from enabled=false and is not overwritten by prober
          await this.pool.query(
            `INSERT INTO server_status (server_id, state, detail, checked_at)
             VALUES ($1, 'disabled', 'Server is administratively disabled', NOW())
             ON CONFLICT (server_id) DO UPDATE SET state = 'disabled', detail = 'Server is administratively disabled', checked_at = NOW()`,
            [server.id]
          );
          continue;
        }

        // Skip if probe already in flight
        if (this.inFlight.has(server.id)) {
          continue;
        }

        this.inFlight.add(server.id);
        this.probeServer(server).finally(() => {
          this.inFlight.delete(server.id);
        });
      }
    } catch (e) {
      console.error('Prober error during round:', e);
    }
  }

  private async probeServer(server: McpServerRow) {
    const headers = buildUpstreamHeaders(server, this.dataKey);
    try {
      // 3s timeout
      await forwardJsonRpc(server.url, 'ping', {}, headers, 3000);
      await this.pool.query(
        `INSERT INTO server_status (server_id, state, detail, checked_at)
         VALUES ($1, 'connected', 'Ping successful', NOW())
         ON CONFLICT (server_id) DO UPDATE SET state = 'connected', detail = 'Ping successful', checked_at = NOW()`,
        [server.id]
      );
    } catch (err: any) {
      const errMsg = err.message || String(err);
      await this.pool.query(
        `INSERT INTO server_status (server_id, state, detail, checked_at)
         VALUES ($1, 'unreachable', $2, NOW())
         ON CONFLICT (server_id) DO UPDATE SET state = 'unreachable', detail = $2, checked_at = NOW()`,
        [server.id, errMsg]
      );
    }
  }
}
