import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createLogger } from '../utils/logger';

const logger = createLogger();

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: any;
}

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
  private client: Client | null = null;
  private availableTools: MCPTool[] = [];
  private isConnected = false;
  private requestQueue: Array<() => Promise<void>> = [];
  private isProcessingQueue = false;

  async initialize(): Promise<void> {
    try {
      this.client = new Client({
        name: "servicenow-web-app",
        version: "1.0.0",
      });

      const mcpPath = process.env.SERVICENOW_MCP_PATH;
      if (!mcpPath) {
        throw new Error('SERVICENOW_MCP_PATH environment variable is required');
      }

      const transport = new StdioClientTransport({
        command: mcpPath,
      });

      await this.client.connect(transport);
      this.isConnected = true;
      logger.info('Connected to ServiceNow MCP server');

      // Fetch available tools
      await this.fetchAvailableTools();
      
      // Start processing queued requests
      this.processQueue();
      
    } catch (error) {
      logger.error('Failed to initialize MCP client:', error);
      throw error;
    }
  }

  private async fetchAvailableTools(): Promise<void> {
    if (!this.client) throw new Error('MCP client not initialized');

    try {
      const response = await this.client.request(
        { method: "tools/list", params: {} },
        ListToolsRequestSchema
      );

      this.availableTools = response.tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      }));

      logger.info(`Loaded ${this.availableTools.length} ServiceNow MCP tools`);
    } catch (error) {
      logger.error('Failed to fetch available tools:', error);
      // Continue without tools - the app can still work for basic chat
      this.availableTools = [];
      logger.warn('Continuing without MCP tools - basic chat functionality will work');
    }
  }

  getAvailableTools(): MCPTool[] {
    return this.availableTools;
  }

  async executeTool(toolCall: MCPToolCall): Promise<MCPToolResult> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push(async () => {
        try {
          const result = await this.executeToolInternal(toolCall);
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

  private async executeToolInternal(toolCall: MCPToolCall): Promise<MCPToolResult> {
    if (!this.client || !this.isConnected) {
      throw new Error('MCP client not connected');
    }

    try {
      logger.info(`Executing MCP tool: ${toolCall.name}`, { arguments: toolCall.arguments });
      
      const response = await this.client.request(
        {
          method: "tools/call",
          params: {
            name: toolCall.name,
            arguments: toolCall.arguments
          }
        },
        CallToolRequestSchema
      );

      logger.info(`MCP tool ${toolCall.name} completed successfully`);
      
      return {
        content: response.content,
        isError: response.isError || false
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
    if (this.client && this.isConnected) {
      try {
        await this.client.close();
        this.isConnected = false;
        logger.info('Disconnected from ServiceNow MCP server');
      } catch (error) {
        logger.error('Error disconnecting from MCP server:', error);
      }
    }
  }

  isClientConnected(): boolean {
    return this.isConnected;
  }
}