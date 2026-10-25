export interface User {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'member';
}

export interface McpServer {
  id: number;
  slug: string;
  display_name: string;
  url: string;
  enabled: boolean;
  auth_type: 'none' | 'bearer' | 'header';
  auth_header_name?: string | null;
  hasCredential: boolean;
  state?: 'connected' | 'unreachable' | 'disabled';
  detail?: string;
  checked_at?: string;
  tools: Array<{ name: string; originalName: string; description: string }>;
}

export interface ApiKeyItem {
  id: number;
  user_id: number;
  userEmail: string;
  prefix: string;
  revoked_at: string | null;
  created_at: string;
  last_used_at: string | null;
}

export interface AuditItem {
  id: number;
  user_id: number;
  userEmail: string;
  server_slug: string;
  tool_name: string;
  started_at: string;
  duration_ms: number;
  success: boolean;
  error: string | null;
}

export interface ToolTraceItem {
  server: string;
  tool: string;
  args: any;
  ok: boolean;
  text: string;
  durationMs: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolTrace?: ToolTraceItem[];
}
