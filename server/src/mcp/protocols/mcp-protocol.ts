import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createLogger } from '../../utils/logger';

const logger = createLogger();

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

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
}

export interface MCPInitializationResult {
  protocolVersion: string;
  capabilities: MCPCapabilities;
  serverInfo: MCPServerInfo;
  instructions?: string;
}

export class MCPProtocolManager {
  private client: Client | null = null;
  private isInitialized = false;
  private capabilities: MCPCapabilities = {};
  private serverInfo: MCPServerInfo = { name: '', version: '' };
  private availableTools: MCPTool[] = [];
  private connectionPromise: Promise<void> | null = null;

  async initialize(mcpPath: string): Promise<MCPInitializationResult> {
    if (this.connectionPromise) {
      await this.connectionPromise;
      return this.getInitializationResult();
    }

    this.connectionPromise = this.performInitialization(mcpPath);
    await this.connectionPromise;
    return this.getInitializationResult();
  }

  private async performInitialization(mcpPath: string): Promise<void> {
    try {
      logger.info('Starting MCP protocol initialization');

      // Create client with capabilities
      this.client = new Client({
        name: "servicenow-web-app",
        version: "1.0.0",
      });

      // Create transport
      const transport = new StdioClientTransport({
        command: mcpPath,
      });

      // Connect to MCP server
      logger.info('Connecting to MCP server at:', mcpPath);
      await this.client.connect(transport);

      // Perform capability negotiation
      await this.negotiateCapabilities();

      // Discover available tools
      await this.discoverTools();

      this.isInitialized = true;
      logger.info('MCP protocol initialization completed successfully', {
        serverInfo: this.serverInfo,
        toolCount: this.availableTools.length,
        capabilities: this.capabilities
      });

    } catch (error) {
      logger.error('MCP protocol initialization failed:', error);
      this.isInitialized = false;
      throw error;
    }
  }

  private async negotiateCapabilities(): Promise<void> {
    if (!this.client) {
      throw new Error('MCP client not initialized');
    }

    try {
      logger.info('Negotiating MCP capabilities');

      // Get server capabilities and info through the SDK's initialize method
      const initResult = await this.client.initialize();
      
      this.serverInfo = initResult.serverInfo;
      this.capabilities = initResult.capabilities || {};

      logger.info('Capability negotiation completed', {
        serverInfo: this.serverInfo,
        capabilities: this.capabilities
      });

    } catch (error) {
      logger.error('Capability negotiation failed:', error);
      // Continue with basic capabilities
      this.capabilities = {};
      this.serverInfo = { name: 'unknown', version: '0.0.0' };
    }
  }

  private async discoverTools(): Promise<void> {
    if (!this.client) {
      throw new Error('MCP client not initialized');
    }

    try {
      logger.info('Discovering available MCP tools');

      const response = await this.client.listTools();
      
      this.availableTools = response.tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      }));

      logger.info(`Discovered ${this.availableTools.length} MCP tools:`, 
        this.availableTools.map(t => t.name));

    } catch (error) {
      logger.error('Tool discovery failed:', error);
      this.availableTools = [];
      // Don't throw - continue without tools
    }
  }

  private getInitializationResult(): MCPInitializationResult {
    return {
      protocolVersion: this.serverInfo.protocolVersion || '2024-11-05',
      capabilities: this.capabilities,
      serverInfo: this.serverInfo,
      instructions: this.serverInfo.name ? 
        `Connected to ${this.serverInfo.name} v${this.serverInfo.version}` : 
        undefined
    };
  }

  getAvailableTools(): MCPTool[] {
    return [...this.availableTools];
  }

  getCapabilities(): MCPCapabilities {
    return { ...this.capabilities };
  }

  getServerInfo(): MCPServerInfo {
    return { ...this.serverInfo };
  }

  async callTool(name: string, arguments_: any): Promise<any> {
    if (!this.client || !this.isInitialized) {
      throw new Error('MCP client not properly initialized');
    }

    logger.info(`Calling MCP tool: ${name}`, { arguments: arguments_ });

    try {
      const response = await this.client.callTool({
        name,
        arguments: arguments_
      });

      logger.info(`MCP tool ${name} completed successfully`);
      return response;

    } catch (error) {
      logger.error(`MCP tool ${name} failed:`, error);
      throw error;
    }
  }

  async refreshTools(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('MCP client not initialized');
    }

    await this.discoverTools();
  }

  isConnected(): boolean {
    return this.isInitialized && this.client !== null;
  }

  async disconnect(): Promise<void> {
    if (this.client && this.isInitialized) {
      try {
        await this.client.close();
        logger.info('Disconnected from MCP server');
      } catch (error) {
        logger.error('Error disconnecting from MCP server:', error);
      }
    }

    this.client = null;
    this.isInitialized = false;
    this.connectionPromise = null;
    this.availableTools = [];
    this.capabilities = {};
    this.serverInfo = { name: '', version: '' };
  }
}