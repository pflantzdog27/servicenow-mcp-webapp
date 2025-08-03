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

      // Debug: Log full tool definitions
      console.log('🔧 [MCP-CLIENT] Full tool definitions from server:', JSON.stringify(response.tools, null, 2));
      
      // Check schemas for each tool
      response.tools.forEach(tool => {
        console.log(`🔧 [MCP-CLIENT] Tool ${tool.name} schema:`, JSON.stringify(tool.inputSchema, null, 2));
      });

      this.availableTools = response.tools.map(tool => ({
        name: `servicenow-mcp:${tool.name}`, // Add the prefix expected by the LLM
        description: tool.description,
        inputSchema: tool.inputSchema
      }));

      // Enhance tool schemas if they're missing or incomplete
      this.availableTools = this.enhanceToolSchemas(this.availableTools);

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

  private enhanceToolSchemas(tools: MCPTool[]): MCPTool[] {
    return tools.map(tool => {
      console.log(`🔧 [MCP-CLIENT] Enhancing schema for: ${tool.name}`);
      
      // If tool already has a proper schema, keep it
      if (tool.inputSchema && tool.inputSchema.properties && Object.keys(tool.inputSchema.properties).length > 0) {
        console.log(`🔧 [MCP-CLIENT] Tool ${tool.name} already has schema, keeping it`);
        return tool;
      }

      // Add schemas for ServiceNow tools that are missing them
      const enhancedTool = { ...tool };

      switch (tool.name) {
        case 'servicenow-mcp:query-records':
          enhancedTool.inputSchema = {
            type: 'object',
            properties: {
              table: { 
                type: 'string', 
                description: 'ServiceNow table name (e.g., incident, change_request, catalog_item)',
                examples: ['incident', 'change_request', 'sc_cat_item', 'sys_user']
              },
              sysparm_query: { 
                type: 'string', 
                description: 'Query filter (e.g., active=true, state=1)',
                examples: ['active=true', 'state=1', 'priority=1']
              },
              sysparm_limit: { 
                type: 'integer', 
                description: 'Maximum number of records to return',
                default: 10,
                minimum: 1,
                maximum: 100
              },
              sysparm_fields: {
                type: 'string',
                description: 'Comma-separated list of fields to return',
                examples: ['number,short_description,state', 'sys_id,name,active']
              }
            },
            required: ['table']
          };
          break;

        case 'servicenow-mcp:create-incident':
          enhancedTool.inputSchema = {
            type: 'object',
            properties: {
              short_description: { 
                type: 'string', 
                description: 'Brief description of the incident',
                maxLength: 160
              },
              description: { 
                type: 'string', 
                description: 'Detailed description of the incident'
              },
              priority: { 
                type: 'string', 
                description: 'Priority level (1-Critical, 2-High, 3-Moderate, 4-Low, 5-Planning)',
                enum: ['1', '2', '3', '4', '5'],
                default: '3'
              },
              urgency: { 
                type: 'string', 
                description: 'Urgency level (1-High, 2-Medium, 3-Low)',
                enum: ['1', '2', '3'],
                default: '3'
              },
              impact: { 
                type: 'string', 
                description: 'Impact level (1-High, 2-Medium, 3-Low)',
                enum: ['1', '2', '3'],
                default: '3'
              },
              category: { 
                type: 'string', 
                description: 'Incident category',
                examples: ['hardware', 'software', 'network', 'inquiry']
              },
              subcategory: { 
                type: 'string', 
                description: 'Incident subcategory',
                examples: ['email', 'server', 'database', 'application']
              }
            },
            required: ['short_description']
          };
          break;

        case 'servicenow-mcp:create-catalog-item':
          enhancedTool.inputSchema = {
            type: 'object',
            properties: {
              command: { 
                type: 'string', 
                description: 'Natural language command describing the catalog item to create',
                examples: [
                  'Create a catalog item called "Office Supplies" in Hardware',
                  'Create a catalog item for "Software License Request"'
                ]
              }
            },
            required: ['command']
          };
          break;

        case 'servicenow-mcp:test-connection':
          enhancedTool.inputSchema = {
            type: 'object',
            properties: {},
            description: 'Test the connection to ServiceNow instance'
          };
          break;

        case 'servicenow-mcp:create-variable':
          enhancedTool.inputSchema = {
            type: 'object',
            properties: {
              command: { 
                type: 'string', 
                description: 'Natural language command describing the variable to create',
                examples: [
                  'Create a variable called "Department" of type choice with options',
                  'Create a text variable for "Additional Comments"'
                ]
              }
            },
            required: ['command']
          };
          break;

        case 'servicenow-mcp:create-ui-policy':
          enhancedTool.inputSchema = {
            type: 'object',
            properties: {
              command: { 
                type: 'string', 
                description: 'Natural language command describing the UI policy to create',
                examples: [
                  'Create a UI policy that makes Priority mandatory when Impact is High',
                  'Create a UI policy to hide Category when Type is Request'
                ]
              }
            },
            required: ['command']
          };
          break;

        case 'servicenow-mcp:create-business-rule':
          enhancedTool.inputSchema = {
            type: 'object',
            properties: {
              command: { 
                type: 'string', 
                description: 'Natural language command describing the business rule to create',
                examples: [
                  'Create a business rule that sets assignment group when category changes',
                  'Create a business rule to validate required fields on incident creation'
                ]
              }
            },
            required: ['command']
          };
          break;

        case 'servicenow-mcp:create-script-include':
          enhancedTool.inputSchema = {
            type: 'object',
            properties: {
              command: { 
                type: 'string', 
                description: 'Natural language command describing the script include to create',
                examples: [
                  'Create a script include for email notification utilities',
                  'Create a script include for common LDAP functions'
                ]
              }
            },
            required: ['command']
          };
          break;

        case 'servicenow-mcp:update-record':
          enhancedTool.inputSchema = {
            type: 'object',
            properties: {
              table: { 
                type: 'string', 
                description: 'ServiceNow table name',
                examples: ['incident', 'change_request', 'sc_cat_item']
              },
              sys_id: { 
                type: 'string', 
                description: 'Unique identifier of the record to update'
              },
              fields: {
                type: 'object',
                description: 'Object containing field names and their new values',
                examples: [
                  { state: '6', resolution_notes: 'Resolved by restarting service' },
                  { priority: '2', assignment_group: 'IT Support' }
                ]
              }
            },
            required: ['table', 'sys_id', 'fields']
          };
          break;

        default:
          // For other tools, provide a basic schema if none exists
          if (!enhancedTool.inputSchema) {
            enhancedTool.inputSchema = {
              type: 'object',
              properties: {
                command: {
                  type: 'string',
                  description: `Command or parameters for ${tool.name}`
                }
              }
            };
          }
          break;
      }

      console.log(`🔧 [MCP-CLIENT] Enhanced ${tool.name} with schema:`, JSON.stringify(enhancedTool.inputSchema, null, 2));
      return enhancedTool;
    });
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