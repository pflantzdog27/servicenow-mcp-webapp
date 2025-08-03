// Shared WebSocket event types for ServiceNow MCP WebApp
import { ToolApprovalRequest, ToolApprovalResponse, ToolExecutionStatus } from '../../../shared/src/types/mcp';

export interface ToolCall {
  id?: string;
  name: string;
  arguments: any;
  result?: any;
  status: 'pending' | 'executing' | 'completed' | 'error';
  executionTime?: number;
  error?: string;
  startTime?: Date;
  endTime?: Date;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
  model?: string;
  isStreaming?: boolean;
  isThinking?: boolean;
  currentTool?: string;
}

// Client to Server Events
export interface ClientToServerEvents {
  // Chat message events
  'chat:message': (data: {
    message: string;
    model: string;
    sessionId?: string;
  }) => void;

  // Tool approval events
  'tool:approval_response': (data: ToolApprovalResponse) => void;

  // Tool retry events
  'chat:retry_tool': (data: {
    toolCall: {
      name: string;
      arguments: any;
    };
    messageId: string;
  }) => void;

  // Message retry events
  'chat:retry_message': (data: {
    messageId: string;
  }) => void;

  // Connection events
  'disconnect': () => void;
  'connect': () => void;
}

// Server to Client Events
export interface ServerToClientEvents {
  // Stream lifecycle events
  'chat:stream_start': (data: {
    messageId: string;
  }) => void;

  'chat:thinking': (data: {
    messageId: string;
  }) => void;

  'chat:stream_complete': (data: {
    messageId: string;
    finalMessage: ChatMessage;
  }) => void;

  // Tool approval events
  'tool:approval_required': (data: ToolApprovalRequest) => void;

  // Tool execution events
  'chat:tool_start': (data: {
    messageId: string;
    toolName: string;
    arguments: any;
  }) => void;

  'chat:tool_progress': (data: {
    messageId: string;
    toolName: string;
    progress: number; // 0-100
  }) => void;

  'chat:tool_complete': (data: {
    messageId: string;
    toolName: string;
    result: any;
    executionTime?: number;
  }) => void;

  'chat:tool_error': (data: {
    messageId: string;
    toolName: string;
    error: string;
  }) => void;

  'chat:tool_denied': (data: {
    messageId: string;
    toolName: string;
    reason?: string;
  }) => void;

  // Text streaming events
  'chat:text_stream': (data: {
    messageId: string;
    chunk: string;
  }) => void;

  // Error events
  'chat:error': (data: {
    message: string;
    error: string;
    messageId?: string;
  }) => void;

  // Legacy events (for backward compatibility)
  'chat:message': (message: ChatMessage) => void;
  'chat:stream': (data: {
    messageId: string;
    type: string;
    content: string;
  }) => void;
}

// Inter-server events (for scaling)
export interface InterServerEvents {
  'user:join': (data: {
    userId: string;
    socketId: string;
  }) => void;

  'user:leave': (data: {
    userId: string;
    socketId: string;
  }) => void;
}

// Socket data
export interface SocketData {
  userId: string;
  userEmail: string;
  userRole: string;
  sessionId?: string;
}

// Tool execution payload for queue
export interface ToolExecutionPayload {
  toolName: string;
  arguments: any;
  messageId: string;
  sessionId: string;
  userId: string;
  priority?: number;
}

// Message processing payload for queue
export interface MessageProcessingPayload {
  sessionId: string;
  userId: string;
  message: string;
  model: string;
  includeContext?: boolean;
  contextMessageCount?: number;
}

// Authentication payload
export interface AuthPayload {
  token: string;
}

// Connection status
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

// Stream phases
export type StreamPhase = 'thinking' | 'tool_execution' | 'responding' | 'complete';

// Tool execution status with more granular states
export type ToolExecutionStatus = 
  | 'queued'
  | 'pending' 
  | 'executing' 
  | 'completed' 
  | 'error' 
  | 'cancelled' 
  | 'timeout';

// Enhanced tool call interface
export interface EnhancedToolCall extends ToolCall {
  queueId?: string;
  retryCount?: number;
  maxRetries?: number;
  progress?: number;
  metadata?: Record<string, any>;
}

// Session information
export interface SessionInfo {
  id: string;
  userId: string;
  model: string;
  totalTokensUsed: number;
  contextLimit: number;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}

// Error types
export interface WebSocketError {
  code: string;
  message: string;
  details?: any;
  timestamp: Date;
}

// Progress update
export interface ProgressUpdate {
  messageId: string;
  toolName?: string;
  phase: StreamPhase;
  progress: number;
  status: string;
  timestamp: Date;
}