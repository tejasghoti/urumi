import React, { useState, useEffect } from 'react';
import { User } from './types';
import { Login } from './components/Login';
import { Servers } from './components/Servers';
import { Team } from './components/Team';
import { Audit } from './components/Audit';
import { Chat } from './components/Chat';

type Tab = 'servers' | 'team' | 'audit' | 'chat';

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('servers');
  const [loading, setLoading] = useState(true);

  // Check existing session
  useEffect(() => {
    fetch('/api/me')
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error('Not logged in');
      })
      .then((data) => {
        setCurrentUser(data);
      })
      .catch(() => {
        setCurrentUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handleLogout = async () => {
    await fetch('/api/logout', { method: 'POST' });
    setCurrentUser(null);
  };

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div>Loading Control Panel...</div>
      </div>
    );
  }

  if (!currentUser) {
    return <Login onLoginSuccess={(u) => setCurrentUser(u)} />;
  }

  const isAdmin = currentUser.role === 'admin';

  return (
    <div style={styles.appRoot}>
      {/* Top Navbar */}
      <nav style={styles.nav}>
        <div style={styles.navInner}>
          <div style={styles.navLeft}>
            <div style={styles.logo}>Team MCP Gateway</div>
            <div style={styles.tabList}>
              <button
                onClick={() => setActiveTab('servers')}
                style={activeTab === 'servers' ? styles.tabActive : styles.tab}
              >
                Servers
              </button>
              <button
                onClick={() => setActiveTab('team')}
                style={activeTab === 'team' ? styles.tabActive : styles.tab}
              >
                Team & Keys
              </button>
              {isAdmin && (
                <button
                  onClick={() => setActiveTab('audit')}
                  style={activeTab === 'audit' ? styles.tabActive : styles.tab}
                >
                  Audit Log
                </button>
              )}
              <button
                onClick={() => setActiveTab('chat')}
                style={activeTab === 'chat' ? styles.tabActive : styles.tab}
              >
                AI Chat
              </button>
            </div>
          </div>

          <div style={styles.navRight}>
            <span style={styles.userBadge}>
              {currentUser.email} ({currentUser.role})
            </span>
            <button onClick={handleLogout} style={styles.logoutButton}>
              Sign Out
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main style={styles.main}>
        {activeTab === 'servers' && <Servers currentUser={currentUser} />}
        {activeTab === 'team' && <Team currentUser={currentUser} />}
        {activeTab === 'audit' && <Audit currentUser={currentUser} />}
        {activeTab === 'chat' && <Chat currentUser={currentUser} />}
      </main>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  appRoot: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#f8fafc',
  },
  loadingContainer: {
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#64748b',
  },
  nav: {
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #e2e8f0',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  navInner: {
    maxWidth: '1280px',
    margin: '0 auto',
    padding: '0 24px',
    height: '60px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  navLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '32px',
  },
  logo: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#0f172a',
    letterSpacing: '-0.3px',
  },
  tabList: {
    display: 'flex',
    gap: '6px',
  },
  tab: {
    backgroundColor: 'transparent',
    border: 'none',
    padding: '8px 14px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 500,
    color: '#64748b',
    cursor: 'pointer',
  },
  tabActive: {
    backgroundColor: '#eff6ff',
    border: 'none',
    padding: '8px 14px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 600,
    color: '#2563eb',
    cursor: 'pointer',
  },
  navRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  userBadge: {
    fontSize: '12px',
    color: '#475569',
    backgroundColor: '#f1f5f9',
    padding: '4px 10px',
    borderRadius: '12px',
  },
  logoutButton: {
    backgroundColor: 'transparent',
    border: '1px solid #e2e8f0',
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '12px',
    color: '#64748b',
    cursor: 'pointer',
  },
  main: {
    flex: 1,
  },
};
