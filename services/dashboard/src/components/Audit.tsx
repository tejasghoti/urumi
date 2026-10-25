import React, { useState, useEffect } from 'react';
import { AuditItem, User } from '../types';

interface AuditProps {
  currentUser: User;
}

export const Audit: React.FC<AuditProps> = ({ currentUser }) => {
  const [logs, setLogs] = useState<AuditItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const limit = 25;

  const fetchAudit = async (p = page) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/audit?page=${p}&limit=${limit}`);
      if (!res.ok) throw new Error('Failed to fetch audit log');
      const data = await res.json();
      setLogs(data.items);
      setTotal(data.total);
      setPage(data.page);
    } catch (err: any) {
      setError(err.message || 'Error fetching audit logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAudit(1);
  }, []);

  if (currentUser.role !== 'admin') {
    return (
      <div style={styles.container}>
        <div style={styles.errorBox}>
          Access Denied: The Audit Log is restricted to team administrators.
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div style={styles.container}>
      <div style={styles.headerRow}>
        <div>
          <h2 style={styles.sectionTitle}>Gateway Tool Audit Log</h2>
          <p style={styles.sectionSubtitle}>
            Recorded tool calls executed across all upstreams by authenticated users
          </p>
        </div>
        <button onClick={() => fetchAudit(page)} style={styles.refreshButton}>
          ↻ Refresh
        </button>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      <div style={styles.card}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Timestamp</th>
              <th style={styles.th}>User Email</th>
              <th style={styles.th}>Server</th>
              <th style={styles.th}>Tool Name</th>
              <th style={styles.th}>Duration</th>
              <th style={styles.th}>Result</th>
              <th style={styles.th}>Details / Error</th>
            </tr>
          </thead>
          <tbody>
            {loading && logs.length === 0 ? (
              <tr>
                <td colSpan={7} style={styles.emptyTd}>
                  Loading audit logs...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={7} style={styles.emptyTd}>
                  No tool calls logged yet.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} style={styles.tr}>
                  <td style={styles.td}>{new Date(log.started_at).toLocaleString()}</td>
                  <td style={styles.td}>
                    <strong>{log.userEmail || `User #${log.user_id}`}</strong>
                  </td>
                  <td style={styles.td}>
                    <code>{log.server_slug}</code>
                  </td>
                  <td style={styles.td}>
                    <code>{log.tool_name}</code>
                  </td>
                  <td style={styles.td}>{log.duration_ms}ms</td>
                  <td style={styles.td}>
                    {log.success ? (
                      <span style={styles.successBadge}>Success</span>
                    ) : (
                      <span style={styles.failureBadge}>Failed</span>
                    )}
                  </td>
                  <td style={styles.td}>
                    {log.error ? (
                      <span style={styles.errorText} title={log.error}>
                        {log.error.length > 50 ? `${log.error.slice(0, 50)}...` : log.error}
                      </span>
                    ) : (
                      <span style={styles.okText}>OK</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div style={styles.pagination}>
          <span style={styles.pageInfo}>
            Page {page} of {totalPages} ({total} total calls)
          </span>
          <div style={styles.pageButtons}>
            <button
              onClick={() => fetchAudit(page - 1)}
              disabled={page <= 1}
              style={styles.pageButton}
            >
              Previous
            </button>
            <button
              onClick={() => fetchAudit(page + 1)}
              disabled={page >= totalPages}
              style={styles.pageButton}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '24px',
    maxWidth: '1280px',
    margin: '0 auto',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  sectionTitle: {
    fontSize: '20px',
    fontWeight: 600,
    color: '#0f172a',
  },
  sectionSubtitle: {
    fontSize: '13px',
    color: '#64748b',
  },
  refreshButton: {
    backgroundColor: '#f1f5f9',
    color: '#334155',
    border: '1px solid #cbd5e1',
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '13px',
    cursor: 'pointer',
  },
  card: {
    backgroundColor: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '16px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
    textAlign: 'left',
  },
  th: {
    padding: '10px 12px',
    borderBottom: '1px solid #e2e8f0',
    color: '#64748b',
    fontWeight: 600,
    fontSize: '12px',
    textTransform: 'uppercase',
  },
  tr: {
    borderBottom: '1px solid #f1f5f9',
  },
  td: {
    padding: '10px 12px',
    color: '#334155',
  },
  emptyTd: {
    padding: '30px',
    textAlign: 'center',
    color: '#94a3b8',
  },
  successBadge: {
    backgroundColor: '#dcfce7',
    color: '#16a34a',
    padding: '2px 8px',
    borderRadius: '10px',
    fontSize: '11px',
    fontWeight: 600,
  },
  failureBadge: {
    backgroundColor: '#fee2e2',
    color: '#dc2626',
    padding: '2px 8px',
    borderRadius: '10px',
    fontSize: '11px',
    fontWeight: 600,
  },
  errorText: {
    color: '#dc2626',
    fontSize: '12px',
    fontFamily: 'monospace',
  },
  okText: {
    color: '#16a34a',
    fontSize: '12px',
  },
  pagination: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '16px',
    paddingTop: '12px',
    borderTop: '1px solid #f1f5f9',
  },
  pageInfo: {
    fontSize: '13px',
    color: '#64748b',
  },
  pageButtons: {
    display: 'flex',
    gap: '8px',
  },
  pageButton: {
    backgroundColor: '#f1f5f9',
    color: '#334155',
    border: '1px solid #cbd5e1',
    padding: '5px 12px',
    borderRadius: '4px',
    fontSize: '12px',
    cursor: 'pointer',
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    color: '#dc2626',
    border: '1px solid #fecaca',
    borderRadius: '6px',
    padding: '12px',
    fontSize: '13px',
    marginBottom: '16px',
  },
};
