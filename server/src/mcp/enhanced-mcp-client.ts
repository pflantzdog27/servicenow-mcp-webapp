import { getMCPConnectionPool, PooledConnection } from './mcp-connection-pool';
import { createLogger } from '../utils/logger';
import { PrismaClient } from '@prisma/client';

const logger = createLogger();
const prisma = new PrismaClient();

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

export class EnhancedMCPClient {
  private pool = getMCPConnectionPool();
  private availableTools: MCPTool[] = [];
  private toolsLoaded = false;

  async initialize(): Promise<void> {
    try {
      await this.pool.initialize();
      await this.fetchAvailableTools();
      logger.info('Enhanced MCP client initialized');
    } catch (error) {
      logger.error('Failed to initialize enhanced MCP client:', error);
      throw error;
    }
  }

  private async fetchAvailableTools(): Promise<void> {
    let connection: PooledConnection | null = null;
    
    try {
      connection = await this.pool.acquire();
      
      logger.info('[MCP-CLIENT] Fetching available tools from MCP server');
      
      const response = await connection.client.listTools();

      this.availableTools = response.tools.map(tool => ({
        name: `servicenow-mcp:${tool.name}`, // Add the prefix expected by the LLM
        description: tool.description,
        inputSchema: tool.inputSchema
      }));

      this.toolsLoaded = true;
      
      logger.info(`[MCP-CLIENT] Loaded ${this.availableTools.length} ServiceNow MCP tools:`, 
        this.availableTools.map(t => t.name)
      );
    } catch (error) {
      logger.error('[MCP-CLIENT] Failed to fetch available tools:', error);
      this.availableTools = [];
    } finally {
      if (connection) {
        await this.pool.release(connection.id);
      }
    }
  }

  getAvailableTools(): MCPTool[] {
    return this.availableTools;
  }

  async executeTool(toolCall: MCPToolCall, messageId?: string): Promise<MCPToolResult> {
    let connection: PooledConnection | null = null;
    const startTime = Date.now();
    
    // Create tool execution record if messageId provided
    let toolExecutionId: string | null = null;
    if (messageId) {
      const toolExecution = await prisma.toolExecution.create({
        data: {
          messageId,
          toolName: toolCall.name,
          arguments: toolCall.arguments,
          status: 'EXECUTING'
        }
      });
      toolExecutionId = toolExecution.id;
    }

    try {
      connection = await this.pool.acquire();
      
      logger.info(`[MCP-CLIENT] Executing tool: ${toolCall.name}`, { 
        arguments: toolCall.arguments,
        connectionId: connection.id,
        messageId
      });
      
      // Handle tool name translation - remove the servicenow-mcp: prefix for the actual MCP call
      const actualToolName = toolCall.name.replace('servicenow-mcp:', '');
      
      logger.debug(`[MCP-CLIENT] Sending to MCP server:`, {
        method: 'callTool',
        originalToolName: toolCall.name,
        actualToolName: actualToolName,
        params: { name: actualToolName, arguments: toolCall.arguments }
      });
      
      // Log the exact parameters being sent
      logger.info(`[MCP-CLIENT] Calling tool with exact parameters:`, {
        originalToolName: toolCall.name,
        actualToolName: actualToolName,
        argumentKeys: Object.keys(toolCall.arguments),
        argumentValues: toolCall.arguments
      });
      
      const response = await connection.client.callTool({
        name: actualToolName,
        arguments: toolCall.arguments
      });

      const executionTime = Date.now() - startTime;
      
      logger.info(`[MCP-CLIENT] Tool response received: ${toolCall.name}`, {
        executionTime: `${executionTime}ms`,
        responseContent: response.content,
        isError: response.isError
      });
      
      const result: MCPToolResult = {
        content: Array.isArray(response.content) 
          ? response.content 
          : [{ type: 'text', text: String(response.content || '') }],
        isError: !!response.isError
      };

      // Update tool execution record
      if (toolExecutionId) {
        await prisma.toolExecution.update({
          where: { id: toolExecutionId },
          data: {
            result: result as any,
            status: result.isError ? 'FAILED' : 'COMPLETED',
            executionTime,
            error: result.isError ? result.content[0]?.text : null
          }
        });
      }

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      // Extract detailed error information
      const errorDetails = {
        message: String(error),
        toolName: toolCall.name,
        arguments: toolCall.arguments,
        executionTime
      };
      
      // Check for specific MCP error patterns
      if (String(error).includes('Could not extract catalog item name')) {
        logger.error(`[MCP-CLIENT] Catalog item parameter format error:`, {
          ...errorDetails,
          suggestion: 'Check that command parameter includes "called" and quoted item name'
        });
      } else if (String(error).includes('Required parameter')) {
        logger.error(`[MCP-CLIENT] Missing required parameter:`, errorDetails);
      } else {
        logger.error(`[MCP-CLIENT] Tool execution failed:`, errorDetails);
      }
      
      // Update tool execution record with error
      if (toolExecutionId) {
        await prisma.toolExecution.update({
          where: { id: toolExecutionId },
          data: {
            status: 'FAILED',
            executionTime,
            error: JSON.stringify(errorDetails)
          }
        });
      }

      throw error;
    } finally {
      if (connection) {
        await this.pool.release(connection.id);
      }
    }
  }

  async executeToolBatch(toolCalls: MCPToolCall[], messageId?: string): Promise<MCPToolResult[]> {
    // Execute tools in parallel using multiple connections from the pool
    const results = await Promise.allSettled(
      toolCalls.map(toolCall => this.executeTool(toolCall, messageId))
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        logger.error(`Failed to execute tool ${toolCalls[index].name}:`, result.reason);
        return {
          content: [{
            type: 'text',
            text: `Error executing tool: ${result.reason}`
          }],
          isError: true
        };
      }
    });
  }

  async disconnect(): Promise<void> {
    await this.pool.shutdown();
    logger.info('Enhanced MCP client disconnected');
  }

  getPoolStats() {
    return this.pool.getPoolStats();
  }

  isReady(): boolean {
    return this.toolsLoaded && this.pool.getPoolStats().total > 0;
  }
}

// Singleton instance
let clientInstance: EnhancedMCPClient | null = null;

export function getEnhancedMCPClient(): EnhancedMCPClient {
  if (!clientInstance) {
    clientInstance = new EnhancedMCPClient();
  }
  return clientInstance;
}