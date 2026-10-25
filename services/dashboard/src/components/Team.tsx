import React, { useState, useEffect } from 'react';
import { User, ApiKeyItem } from '../types';

interface TeamProps {
  currentUser: User;
}

export const Team: React.FC<TeamProps> = ({ currentUser }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Mint modal / copy box
  const [mintedKey, setMintedKey] = useState<string | null>(null);

  // Invite form modal
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteError, setInviteError] = useState('');

  const isAdmin = currentUser.role === 'admin';

  const fetchData = async () => {
    try {
      setLoading(true);
      if (isAdmin) {
        const uRes = await fetch('/api/users');
        if (uRes.ok) setUsers(await uRes.json());
      } else {
        setUsers([currentUser]);
      }

      const kRes = await fetch('/api/keys');
      if (kRes.ok) setKeys(await kRes.json());
    } catch (err: any) {
      setError(err.message || 'Error loading team data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleMintKey = async (targetUserId?: number) => {
    try {
      const url = targetUserId && isAdmin ? `/api/users/${targetUserId}/keys` : '/api/keys';
      const res = await fetch(url, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to mint key');
      setMintedKey(data.apiKey);
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRevokeKey = async (keyId: number) => {
    if (!confirm('Are you sure you want to revoke this API key? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/keys/${keyId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to revoke key');
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError('');
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail,
          name: inviteName,
          role: inviteRole,
          password: invitePassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to invite user');

      setShowInviteModal(false);
      setInviteEmail('');
      setInviteName('');
      setInvitePassword('');
      fetchData();
    } catch (err: any) {
      setInviteError(err.message);
    }
  };

  const inspectorSnippet = (key: string) => JSON.stringify(
    {
      mcpServers: {
        team: {
          url: 'http://mcp.local/mcp',
          headers: { Authorization: `Bearer ${key}` },
        },
      },
    },
    null,
    2
  );

  return (
    <div style={styles.container}>
      <div style={styles.headerRow}>
        <div>
          <h2 style={styles.sectionTitle}>Team & API Keys</h2>
          <p style={styles.sectionSubtitle}>
            Manage team members and scoped MCP Gateway credentials
          </p>
        </div>
        <div style={styles.actions}>
          <button onClick={() => handleMintKey()} style={styles.primaryButton}>
            + Mint API Key
          </button>
          {isAdmin && (
            <button onClick={() => setShowInviteModal(true)} style={styles.secondaryButton}>
              + Invite Member
            </button>
          )}
        </div>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      {/* Minted key popup display */}
      {mintedKey && (
        <div style={styles.mintedBox}>
          <div style={styles.mintedHeader}>
            <span style={styles.mintedTitle}>⚠️ Save Your New API Key</span>
            <button onClick={() => setMintedKey(null)} style={styles.closeButton}>
              ✕
            </button>
          </div>
          <p style={styles.mintedDesc}>
            This key is shown only once and cannot be recovered. Store it securely:
          </p>
          <div style={styles.keyDisplay}>
            <code>{mintedKey}</code>
          </div>
          <div style={styles.snippetTitle}>MCP Inspector & Cursor Configuration Snippet:</div>
          <pre style={styles.snippetBlock}>
            {inspectorSnippet(mintedKey)}
          </pre>
        </div>
      )}

      {/* API Keys Table */}
      <div style={styles.tableCard}>
        <h3 style={styles.cardSectionTitle}>Active & Revoked API Keys</h3>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Key Prefix</th>
              {isAdmin && <th style={styles.th}>User</th>}
              <th style={styles.th}>Created</th>
              <th style={styles.th}>Last Used</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {keys.length === 0 ? (
              <tr>
                <td colSpan={6} style={styles.emptyTd}>
                  No API keys minted yet.
                </td>
              </tr>
            ) : (
              keys.map((k) => (
                <tr key={k.id} style={styles.tr}>
                  <td style={styles.td}>
                    <code>{k.prefix}••••••••</code>
                  </td>
                  {isAdmin && <td style={styles.td}>{k.userEmail}</td>}
                  <td style={styles.td}>{new Date(k.created_at).toLocaleDateString()}</td>
                  <td style={styles.td}>
                    {k.last_used_at ? new Date(k.last_used_at).toLocaleTimeString() : 'Never'}
                  </td>
                  <td style={styles.td}>
                    {k.revoked_at ? (
                      <span style={styles.revokedBadge}>Revoked</span>
                    ) : (
                      <span style={styles.activeBadge}>Active</span>
                    )}
                  </td>
                  <td style={styles.td}>
                    {!k.revoked_at && (
                      <button onClick={() => handleRevokeKey(k.id)} style={styles.revokeButton}>
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Users list for Admin */}
      {isAdmin && (
        <div style={{ ...styles.tableCard, marginTop: '24px' }}>
          <h3 style={styles.cardSectionTitle}>Team Members</h3>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Name</th>
                <th style={styles.th}>Email</th>
                <th style={styles.th}>Role</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={styles.tr}>
                  <td style={styles.td}>{u.name}</td>
                  <td style={styles.td}>{u.email}</td>
                  <td style={styles.td}>
                    <span style={u.role === 'admin' ? styles.adminBadge : styles.memberBadge}>
                      {u.role.toUpperCase()}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <button onClick={() => handleMintKey(u.id)} style={styles.secondaryButton}>
                      Mint Key
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h3 style={styles.modalTitle}>Invite Team Member</h3>
            {inviteError && <div style={styles.errorBox}>{inviteError}</div>}
            <form onSubmit={handleInviteUser} style={styles.modalForm}>
              <div style={styles.field}>
                <label style={styles.label}>Full Name</label>
                <input
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  required
                  style={styles.input}
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Email Address</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                  style={styles.input}
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as any)}
                  style={styles.input}
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Temporary Password</label>
                <input
                  type="password"
                  value={invitePassword}
                  onChange={(e) => setInvitePassword(e.target.value)}
                  required
                  style={styles.input}
                />
              </div>

              <div style={styles.modalButtons}>
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  style={styles.secondaryButton}
                >
                  Cancel
                </button>
                <button type="submit" style={styles.primaryButton}>
                  Send Invite
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
  actions: {
    display: 'flex',
    gap: '10px',
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
  revokeButton: {
    backgroundColor: '#fef2f2',
    color: '#dc2626',
    border: '1px solid #fecaca',
    padding: '4px 10px',
    borderRadius: '4px',
    fontSize: '11px',
    cursor: 'pointer',
  },
  mintedBox: {
    backgroundColor: '#fffbeb',
    border: '1px solid #fde68a',
    borderRadius: '8px',
    padding: '18px',
    marginBottom: '24px',
  },
  mintedHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mintedTitle: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#b45309',
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '16px',
    cursor: 'pointer',
    color: '#b45309',
  },
  mintedDesc: {
    fontSize: '13px',
    color: '#92400e',
    margin: '8px 0',
  },
  keyDisplay: {
    backgroundColor: '#ffffff',
    border: '1px dashed #f59e0b',
    padding: '10px 14px',
    borderRadius: '6px',
    fontSize: '13px',
    color: '#0f172a',
    wordBreak: 'break-all',
  },
  snippetTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#78350f',
    marginTop: '12px',
    marginBottom: '4px',
  },
  snippetBlock: {
    backgroundColor: '#1e293b',
    color: '#f8fafc',
    padding: '12px',
    borderRadius: '6px',
    fontSize: '12px',
    overflowX: 'auto',
  },
  tableCard: {
    backgroundColor: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  cardSectionTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#1e293b',
    marginBottom: '14px',
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
    padding: '12px',
    color: '#334155',
  },
  emptyTd: {
    padding: '24px',
    textAlign: 'center',
    color: '#94a3b8',
  },
  activeBadge: {
    backgroundColor: '#dcfce7',
    color: '#16a34a',
    padding: '2px 8px',
    borderRadius: '10px',
    fontSize: '11px',
    fontWeight: 600,
  },
  revokedBadge: {
    backgroundColor: '#fee2e2',
    color: '#dc2626',
    padding: '2px 8px',
    borderRadius: '10px',
    fontSize: '11px',
    fontWeight: 600,
  },
  adminBadge: {
    backgroundColor: '#eff6ff',
    color: '#2563eb',
    padding: '2px 8px',
    borderRadius: '10px',
    fontSize: '11px',
    fontWeight: 600,
  },
  memberBadge: {
    backgroundColor: '#f1f5f9',
    color: '#64748b',
    padding: '2px 8px',
    borderRadius: '10px',
    fontSize: '11px',
    fontWeight: 600,
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
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: '8px',
    width: '100%',
    maxWidth: '420px',
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
};
