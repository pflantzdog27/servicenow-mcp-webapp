import { createLogger } from '../utils/logger';
import { MCPProtocolManager, MCPTool, MCPInitializationResult } from './protocols/mcp-protocol';
import { MCPParameterTransformer } from './mcp-parameter-transformer';

const logger = createLogger();

// Re-export from protocol manager
export { MCPTool } from './protocols/mcp-protocol';

export interface MCPToolCall {
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

export class MCPClientManager {
  private protocolManager: MCPProtocolManager;
  private requestQueue: Array<() => Promise<void>> = [];
  private isProcessingQueue = false;
  private initializationResult: MCPInitializationResult | null = null;

  constructor() {
    this.protocolManager = new MCPProtocolManager();
  }

  async initialize(): Promise<void> {
    try {
      const mcpPath = process.env.SERVICENOW_MCP_PATH;
      if (!mcpPath) {
        throw new Error('SERVICENOW_MCP_PATH environment variable is required');
      }

      logger.info('Initializing MCP client with protocol negotiation');
      this.initializationResult = await this.protocolManager.initialize(mcpPath);
      
      logger.info('MCP client initialized successfully', {
        serverInfo: this.initializationResult.serverInfo,
        toolCount: this.protocolManager.getAvailableTools().length,
        capabilities: this.initializationResult.capabilities
      });
      
      // Start processing queued requests
      this.processQueue();
      
    } catch (error) {
      logger.error('Failed to initialize MCP client:', error);
      throw error;
    }
  }

  async refreshTools(): Promise<void> {
    try {
      await this.protocolManager.refreshTools();
      const tools = this.protocolManager.getAvailableTools();
      logger.info(`Refreshed ${tools.length} ServiceNow MCP tools: ${tools.map(t => t.name).join(', ')}`);
    } catch (error) {
      logger.error('Failed to refresh tools:', error);
    }
  }

  getAvailableTools(): MCPTool[] {
    console.log('📦 [MCP-MANAGER] getAvailableTools called');
    const tools = this.protocolManager.getAvailableTools();
    console.log('📦 [MCP-MANAGER] Retrieved tools from protocol manager:', tools.length);
    console.log('📦 [MCP-MANAGER] First tool:', tools[0]);
    return tools;
  }

  getInitializationResult(): MCPInitializationResult | null {
    return this.initializationResult;
  }

  getCapabilities() {
    return this.protocolManager.getCapabilities();
  }

  getServerInfo() {
    return this.protocolManager.getServerInfo();
  }

  async executeTool(toolCall: MCPToolCall, messageId?: string, userMessage?: string): Promise<MCPToolResult> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push(async () => {
        try {
          const result = await this.executeToolInternal(toolCall, userMessage);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      
      if (!this.isProcessingQueue) {
        this.processQueue();
      }
    });
  }

  private async executeToolInternal(toolCall: MCPToolCall, userMessage?: string): Promise<MCPToolResult> {
    if (!this.protocolManager.isConnected()) {
      throw new Error('MCP client not connected');
    }

    try {
      // Transform parameters to match MCP server expectations
      const transformedArguments = MCPParameterTransformer.transformParameters(
        toolCall.name,
        toolCall.arguments,
        userMessage
      );

      logger.info(`[MCP-CLIENT] Executing tool with parameter transformation:`, {
        toolName: toolCall.name,
        originalArguments: toolCall.arguments,
        transformedArguments
      });
      
      const response = await this.protocolManager.callTool(toolCall.name, transformedArguments);

      logger.info(`MCP tool ${toolCall.name} completed successfully`);
      
      return {
        content: Array.isArray(response.content) ? response.content : [{ type: 'text', text: String(response.content || '') }],
        isError: !!response.isError
      };
    } catch (error) {
      logger.error(`MCP tool ${toolCall.name} failed:`, error);
      throw error;
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0) {
      const request = this.requestQueue.shift();
      if (request) {
        try {
          await request();
        } catch (error) {
          logger.error('Error processing queued request:', error);
        }
      }
    }

    this.isProcessingQueue = false;
  }

  async disconnect(): Promise<void> {
    try {
      await this.protocolManager.disconnect();
      this.initializationResult = null;
      logger.info('Disconnected from ServiceNow MCP server');
    } catch (error) {
      logger.error('Error disconnecting from MCP server:', error);
    }
  }

  isClientConnected(): boolean {
    return this.protocolManager.isConnected();
  }
}