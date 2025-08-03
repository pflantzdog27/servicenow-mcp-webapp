export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
}

export interface MCPToolCall {
  id: string;
  name: string;
  arguments: any;
}

export interface MCPToolResult {
  content: Array<{
    type: string;
    text?: string;
    image?: any;
  }>;
  isError?: boolean;
}

export interface MCPCapabilities {
  tools?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  prompts?: {
    listChanged?: boolean;
  };
  logging?: {
    level?: 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical' | 'alert' | 'emergency';
  };
  sampling?: {};
}

export interface MCPServerInfo {
  name: string;
  version: string;
  protocolVersion?: string;
}

export interface MCPInitializationResult {
  protocolVersion: string;
  capabilities: MCPCapabilities;
  serverInfo: MCPServerInfo;
  instructions?: string;
}

export interface ToolApprovalRequest {
  id: string;
  messageId: string;
  toolName: string;
  toolDescription?: string;
  toolArguments: any;
  timestamp: Date;
}

export interface ToolApprovalResponse {
  id: string;
  approved: boolean;
  alwaysAllow?: boolean;
}

export interface ToolExecutionStatus {
  id: string;
  toolName: string;
  status: 'pending' | 'approved' | 'denied' | 'executing' | 'completed' | 'error';
  arguments: any;
  result?: MCPToolResult;
  error?: string;
  startTime?: Date;
  endTime?: Date;
  executionTime?: number;
}

export interface ConversationContext {
  messages: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    toolCalls?: ToolExecutionStatus[];
    model?: string;
  }>;
  toolExecutions: ToolExecutionStatus[];
  approvedTools: Set<string>;
  sessionStartTime: Date;
}