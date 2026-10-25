import React, { useState, useEffect } from 'react';
import { McpServer, User } from '../types';

interface ServersProps {
  currentUser: User;
}

export const Servers: React.FC<ServersProps> = ({ currentUser }) => {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal form states
  const [showModal, setShowModal] = useState(false);
  const [editingServer, setEditingServer] = useState<McpServer | null>(null);
  const [formSlug, setFormSlug] = useState('');
  const [formName, setFormName] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formAuthType, setFormAuthType] = useState<'none' | 'bearer' | 'header'>('none');
  const [formHeaderName, setFormHeaderName] = useState('');
  const [formCredential, setFormCredential] = useState('');
  const [formError, setFormError] = useState('');

  const fetchServers = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/servers');
      if (!res.ok) throw new Error('Failed to fetch servers');
      const data = await res.json();
      setServers(data);
    } catch (err: any) {
      setError(err.message || 'Error fetching servers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServers();
    const interval = setInterval(fetchServers, 10000);
    return () => clearInterval(interval);
  }, []);

  const openAddModal = () => {
    setEditingServer(null);
    setFormSlug('');
    setFormName('');
    setFormUrl('');
    setFormAuthType('none');
    setFormHeaderName('');
    setFormCredential('');
    setFormError('');
    setShowModal(true);
  };

  const openEditModal = (s: McpServer) => {
    setEditingServer(s);
    setFormSlug(s.slug);
    setFormName(s.display_name);
    setFormUrl(s.url);
    setFormAuthType(s.auth_type);
    setFormHeaderName(s.auth_header_name || '');
    setFormCredential(''); // Write-only
    setFormError('');
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    try {
      if (editingServer) {
        // PATCH
        const res = await fetch(`/api/servers/${editingServer.slug}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            displayName: formName,
            url: formUrl,
            authType: formAuthType,
            authHeaderName: formAuthType === 'header' ? formHeaderName : null,
            credential: formCredential,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Update failed');
      } else {
        // POST
        const res = await fetch('/api/servers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug: formSlug,
            displayName: formName,
            url: formUrl,
            authType: formAuthType,
            authHeaderName: formAuthType === 'header' ? formHeaderName : null,
            credential: formCredential,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Creation failed');
      }

      setShowModal(false);
      fetchServers();
    } catch (err: any) {
      setFormError(err.message || 'Save error');
    }
  };

  const toggleEnabled = async (s: McpServer) => {
    try {
      const res = await fetch(`/api/servers/${s.slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !s.enabled }),
      });
      if (!res.ok) throw new Error('Toggle failed');
      fetchServers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async (slug: string) => {
    if (!confirm(`Are you sure you want to delete server '${slug}'?`)) return;
    try {
      const res = await fetch(`/api/servers/${slug}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      fetchServers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const isAdmin = currentUser.role === 'admin';

  return (
    <div style={styles.container}>
      <div style={styles.headerRow}>
        <div>
          <h2 style={styles.sectionTitle}>Upstream MCP Servers</h2>
          <p style={styles.sectionSubtitle}>
            Registered tool providers managed by Team MCP Gateway
          </p>
        </div>
        {isAdmin && (
          <button onClick={openAddModal} style={styles.primaryButton}>
            + Add Server
          </button>
        )}
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      {loading && servers.length === 0 ? (
        <div style={styles.loading}>Loading server registry...</div>
      ) : (
        <div style={styles.grid}>
          {servers.map((srv) => {
            const isUnreachable = srv.state === 'unreachable';
            const isDisabled = !srv.enabled || srv.state === 'disabled';
            const isConnected = srv.enabled && srv.state === 'connected';

            return (
              <div key={srv.slug} style={styles.card}>
                <div style={styles.cardHeader}>
                  <div>
                    <h3 style={styles.cardTitle}>{srv.display_name}</h3>
                    <code style={styles.slugCode}>{srv.slug}</code>
                  </div>
                  <div>
                    {isDisabled && <span style={styles.disabledBadge}>Disabled</span>}
                    {isConnected && <span style={styles.connectedBadge}>Connected</span>}
                    {isUnreachable && <span style={styles.unreachableBadge}>Unreachable</span>}
                  </div>
                </div>

                <div style={styles.cardBody}>
                  <div style={styles.infoRow}>
                    <span style={styles.infoLabel}>Endpoint:</span>
                    <span style={styles.infoValue} title={srv.url}>
                      {srv.url}
                    </span>
                  </div>

                  <div style={styles.infoRow}>
                    <span style={styles.infoLabel}>Authentication:</span>
                    <span style={styles.infoValue}>
                      {srv.auth_type === 'none'
                        ? 'None'
                        : `${srv.auth_type.toUpperCase()} (${srv.hasCredential ? 'Configured' : 'No Secret'})`}
                    </span>
                  </div>

                  {isUnreachable && srv.detail && (
                    <div style={styles.probeDetail}>
                      <strong>Prober Error:</strong> {srv.detail}
                    </div>
                  )}

                  <div style={styles.toolsSection}>
                    <div style={styles.toolsTitle}>
                      Available Tools ({srv.tools?.length || 0}):
                    </div>
                    <div style={styles.toolList}>
                      {srv.tools && srv.tools.length > 0 ? (
                        srv.tools.map((t) => (
                          <div key={t.name} style={styles.toolItem} title={t.description}>
                            <code>{t.name}</code>
                          </div>
                        ))
                      ) : (
                        <span style={styles.noTools}>
                          {isDisabled ? 'Server is disabled.' : 'No tools listed.'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {isAdmin && (
                  <div style={styles.cardFooter}>
                    <button
                      onClick={() => toggleEnabled(srv)}
                      style={srv.enabled ? styles.warnButton : styles.secondaryButton}
                    >
                      {srv.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button onClick={() => openEditModal(srv)} style={styles.secondaryButton}>
                      Edit
                    </button>
                    <button onClick={() => handleDelete(srv.slug)} style={styles.dangerButton}>
                      Delete
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h3 style={styles.modalTitle}>
              {editingServer ? `Edit Upstream: ${editingServer.slug}` : 'Register New Upstream Server'}
            </h3>

            {formError && <div style={styles.errorBox}>{formError}</div>}

            <form onSubmit={handleSave} style={styles.modalForm}>
              {!editingServer && (
                <div style={styles.field}>
                  <label style={styles.label}>Slug (Unique identifier)</label>
                  <input
                    type="text"
                    value={formSlug}
                    onChange={(e) => setFormSlug(e.target.value.toLowerCase())}
                    placeholder="e.g. inventory"
                    required
                    pattern="^[a-z][a-z0-9-]{1,30}$"
                    style={styles.input}
                  />
                  <small style={styles.smallHint}>^[a-z][a-z0-9-]{'{1,30}'}$</small>
                </div>
              )}

              <div style={styles.field}>
                <label style={styles.label}>Display Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Inventory Service"
                  required
                  style={styles.input}
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>MCP URL</label>
                <input
                  type="url"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="http://svc.platform.svc.cluster.local:8080/mcp"
                  required
                  style={styles.input}
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Auth Type</label>
                <select
                  value={formAuthType}
                  onChange={(e) => setFormAuthType(e.target.value as any)}
                  style={styles.input}
                >
                  <option value="none">None</option>
                  <option value="bearer">Bearer Token</option>
                  <option value="header">Custom Header</option>
                </select>
              </div>

              {formAuthType === 'header' && (
                <div style={styles.field}>
                  <label style={styles.label}>Header Name</label>
                  <input
                    type="text"
                    value={formHeaderName}
                    onChange={(e) => setFormHeaderName(e.target.value)}
                    placeholder="X-API-Key"
                    required
                    style={styles.input}
                  />
                </div>
              )}

              {formAuthType !== 'none' && (
                <div style={styles.field}>
                  <label style={styles.label}>
                    Credential Secret {editingServer ? '(Leave blank to retain existing)' : ''}
                  </label>
                  <input
                    type="password"
                    value={formCredential}
                    onChange={(e) => setFormCredential(e.target.value)}
                    placeholder="••••••••"
                    style={styles.input}
                  />
                </div>
              )}

              <div style={styles.modalButtons}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={styles.secondaryButton}
                >
                  Cancel
                </button>
                <button type="submit" style={styles.primaryButton}>
                  Save Server
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
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
    marginBottom: '24px',
    flexWrap: 'wrap',
    gap: '12px',
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
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
    gap: '20px',
  },
  card: {
    backgroundColor: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '18px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '12px',
  },
  cardTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#1e293b',
  },
  slugCode: {
    fontSize: '12px',
    color: '#2563eb',
    backgroundColor: '#eff6ff',
    padding: '2px 6px',
    borderRadius: '4px',
  },
  connectedBadge: {
    backgroundColor: '#dcfce7',
    color: '#16a34a',
    fontSize: '11px',
    fontWeight: 600,
    padding: '3px 8px',
    borderRadius: '12px',
  },
  disabledBadge: {
    backgroundColor: '#f1f5f9',
    color: '#64748b',
    fontSize: '11px',
    fontWeight: 600,
    padding: '3px 8px',
    borderRadius: '12px',
  },
  unreachableBadge: {
    backgroundColor: '#fee2e2',
    color: '#dc2626',
    fontSize: '11px',
    fontWeight: 600,
    padding: '3px 8px',
    borderRadius: '12px',
  },
  cardBody: {
    fontSize: '13px',
    color: '#334155',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  infoRow: {
    display: 'flex',
    gap: '8px',
    overflow: 'hidden',
  },
  infoLabel: {
    fontWeight: 500,
    color: '#64748b',
    minWidth: '85px',
  },
  infoValue: {
    color: '#0f172a',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  probeDetail: {
    backgroundColor: '#fff1f2',
    color: '#be123c',
    padding: '8px',
    borderRadius: '4px',
    fontSize: '12px',
    border: '1px solid #fecdd3',
  },
  toolsSection: {
    marginTop: '10px',
    borderTop: '1px solid #f1f5f9',
    paddingTop: '10px',
  },
  toolsTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#475569',
    marginBottom: '6px',
  },
  toolList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  toolItem: {
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
    padding: '3px 8px',
    borderRadius: '4px',
    fontSize: '11px',
  },
  noTools: {
    fontSize: '12px',
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  cardFooter: {
    display: 'flex',
    gap: '8px',
    marginTop: '16px',
    borderTop: '1px solid #f1f5f9',
    paddingTop: '12px',
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    color: '#fff',
    border: 'none',
    padding: '8px 14px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  secondaryButton: {
    backgroundColor: '#f1f5f9',
    color: '#334155',
    border: '1px solid #cbd5e1',
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '12px',
    cursor: 'pointer',
  },
  warnButton: {
    backgroundColor: '#fffbeb',
    color: '#b45309',
    border: '1px solid #fde68a',
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '12px',
    cursor: 'pointer',
  },
  dangerButton: {
    backgroundColor: '#fef2f2',
    color: '#dc2626',
    border: '1px solid #fecaca',
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '12px',
    cursor: 'pointer',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '16px',
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: '8px',
    width: '100%',
    maxWidth: '480px',
    padding: '24px',
    boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
  },
  modalTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#0f172a',
    marginBottom: '16px',
  },
  modalForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  label: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#334155',
  },
  input: {
    padding: '8px 10px',
    fontSize: '13px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    outline: 'none',
  },
  smallHint: {
    fontSize: '11px',
    color: '#64748b',
  },
  modalButtons: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    marginTop: '16px',
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    color: '#dc2626',
    border: '1px solid #fecaca',
    borderRadius: '6px',
    padding: '10px',
    fontSize: '13px',
    marginBottom: '16px',
  },
  loading: {
    padding: '30px',
    textAlign: 'center',
    color: '#64748b',
    fontSize: '14px',
  },
};
