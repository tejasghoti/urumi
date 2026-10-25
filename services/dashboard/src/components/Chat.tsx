import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, User } from '../types';

interface ChatProps {
  currentUser: User;
}

export const Chat: React.FC<ChatProps> = ({ currentUser }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `Hello ${currentUser.name}! I am your Team MCP Assistant. I can help manage WooCommerce products, lookup orders, check company policies, and inspect server utilities. What would you like to do?`,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userText = input.trim();
    setInput('');
    setChatError('');

    const newMessages: ChatMessage[] = [
      ...messages,
      {
        id: String(Date.now()),
        role: 'user',
        content: userText,
      },
    ];

    setMessages(newMessages);
    setLoading(true);

    try {
      // Send conversation to /api/chat
      const apiPayload = newMessages
        .filter((m) => m.id !== 'welcome')
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiPayload }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to communicate with LLM');
      }

      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now() + 1),
          role: 'assistant',
          content: data.assistantMessage,
          toolTrace: data.toolTrace,
        },
      ]);
    } catch (err: any) {
      setChatError(err.message || 'Error occurred during assistant query');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Team AI Assistant</h2>
        <p style={styles.subtitle}>
          Direct tool calling via Team MCP Gateway as <strong>{currentUser.email}</strong> ({currentUser.role})
        </p>
      </div>

      {chatError && <div style={styles.errorBox}>{chatError}</div>}

      <div style={styles.messageBox}>
        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              ...styles.messageWrapper,
              alignItems: m.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div
              style={{
                ...styles.messageBubble,
                backgroundColor: m.role === 'user' ? '#2563eb' : '#ffffff',
                color: m.role === 'user' ? '#ffffff' : '#0f172a',
                border: m.role === 'user' ? 'none' : '1px solid #e2e8f0',
              }}
            >
              <div style={styles.messageRole}>
                {m.role === 'user' ? 'You' : 'Assistant'}
              </div>
              <div style={styles.messageContent}>{m.content}</div>

              {/* Tool Trace display */}
              {m.toolTrace && m.toolTrace.length > 0 && (
                <div style={styles.toolTraceBox}>
                  <div style={styles.toolTraceTitle}>
                    🛠️ Tools Invoked ({m.toolTrace.length}):
                  </div>
                  {m.toolTrace.map((trace, idx) => (
                    <div key={idx} style={styles.traceItem}>
                      <div style={styles.traceHeader}>
                        <span style={trace.ok ? styles.traceBadgeOk : styles.traceBadgeErr}>
                          {trace.ok ? '✓' : '✕'} {trace.server}__{trace.tool}
                        </span>
                        <span style={styles.traceDuration}>{trace.durationMs}ms</span>
                      </div>
                      <div style={styles.traceArgs}>
                        <code>{JSON.stringify(trace.args)}</code>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ ...styles.messageWrapper, alignItems: 'flex-start' }}>
            <div style={{ ...styles.messageBubble, backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}>
              <span style={styles.loadingDots}>Assistant is executing tools & thinking...</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div style={styles.composerWrapper}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question, create a product, or query orders... (Enter sends, Shift+Enter for newline)"
          rows={3}
          style={styles.textarea}
        />
        <div style={styles.composerFooter}>
          <span style={styles.shortcutHint}>Press <strong>Enter</strong> to send</span>
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            style={styles.sendButton}
          >
            {loading ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '24px',
    maxWidth: '960px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    height: 'calc(100vh - 80px)',
  },
  header: {
    marginBottom: '16px',
  },
  title: {
    fontSize: '20px',
    fontWeight: 600,
    color: '#0f172a',
  },
  subtitle: {
    fontSize: '13px',
    color: '#64748b',
  },
  messageBox: {
    flex: 1,
    overflowY: 'auto',
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    marginBottom: '16px',
  },
  messageWrapper: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
  },
  messageBubble: {
    maxWidth: '85%',
    padding: '14px 16px',
    borderRadius: '8px',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
  },
  messageRole: {
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    marginBottom: '4px',
    opacity: 0.8,
  },
  messageContent: {
    fontSize: '14px',
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
  },
  toolTraceBox: {
    marginTop: '12px',
    paddingTop: '10px',
    borderTop: '1px solid #e2e8f0',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  toolTraceTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#475569',
  },
  traceItem: {
    backgroundColor: '#f1f5f9',
    borderRadius: '6px',
    padding: '8px 10px',
    fontSize: '12px',
  },
  traceHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px',
  },
  traceBadgeOk: {
    color: '#16a34a',
    fontWeight: 600,
  },
  traceBadgeErr: {
    color: '#dc2626',
    fontWeight: 600,
  },
  traceDuration: {
    color: '#64748b',
    fontSize: '11px',
  },
  traceArgs: {
    fontSize: '11px',
    color: '#334155',
    overflowX: 'auto',
  },
  composerWrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    backgroundColor: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '12px',
  },
  textarea: {
    width: '100%',
    border: 'none',
    outline: 'none',
    resize: 'none',
    fontSize: '14px',
    fontFamily: 'inherit',
  },
  composerFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  shortcutHint: {
    fontSize: '12px',
    color: '#94a3b8',
  },
  sendButton: {
    backgroundColor: '#2563eb',
    color: '#fff',
    border: 'none',
    padding: '8px 18px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    color: '#dc2626',
    border: '1px solid #fecaca',
    borderRadius: '6px',
    padding: '10px',
    fontSize: '13px',
    marginBottom: '12px',
  },
  loadingDots: {
    fontSize: '13px',
    color: '#64748b',
    fontStyle: 'italic',
  },
};
