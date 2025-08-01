import { MCPToolCall, MCPToolResult, MCPClientManager } from './mcp-client';
import { WebToolsManager, WebToolCall, WebToolResult } from '../services/web-tools';
import { createLogger } from '../utils/logger';

const logger = createLogger();

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
  type: 'mcp' | 'web';
}

export interface ToolResult {
  toolCallId: string;
  result: any;
  isError: boolean;
  content?: {
    type: 'text' | 'json';
    text?: string;
    json?: any;
  }[];
  executionTime?: number;
  toolType: 'mcp' | 'web';
}

export class EnhancedToolExecutor {
  private mcpClient: MCPClientManager;
  private webToolsManager: WebToolsManager;
  private requestQueue: any[] = [];
  private isProcessing = false;

  constructor(mcpClient: MCPClientManager) {
    this.mcpClient = mcpClient;
    this.webToolsManager = new WebToolsManager();
  }

  async executeTool(toolCall: ToolCall): Promise<ToolResult> {
    const startTime = Date.now();
    
    try {
      logger.info(`Executing ${toolCall.type} tool: ${toolCall.name}`, { 
        toolCallId: toolCall.id,
        type: toolCall.type
      });

      let result: ToolResult;

      if (toolCall.type === 'web') {
        const webToolCall: WebToolCall = {
          id: toolCall.id,
          name: toolCall.name as 'web_search' | 'web_fetch',
          arguments: toolCall.arguments
        };
        
        const webResult = await this.webToolsManager.executeTool(webToolCall);
        result = {
          ...webResult,
          toolType: 'web',
          executionTime: Date.now() - startTime
        };
      } else {
        const mcpToolCall: MCPToolCall = {
          name: toolCall.name,
          arguments: toolCall.arguments
        };
        
        const mcpResult = await this.mcpClient.executeTool(mcpToolCall);
        result = {
          toolCallId: toolCall.id,
          result: mcpResult.result,
          isError: mcpResult.isError,
          content: mcpResult.content,
          toolType: 'mcp',
          executionTime: Date.now() - startTime
        };
      }

      logger.info(`Tool executed successfully: ${toolCall.name} (${result.executionTime}ms)`, {
        toolCallId: toolCall.id,
        type: toolCall.type
      });

      return result;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error(`Tool execution failed: ${toolCall.name} (${executionTime}ms)`, {
        toolCallId: toolCall.id,
        type: toolCall.type,
        error: errorMessage
      });

      return {
        toolCallId: toolCall.id,
        result: { error: errorMessage },
        isError: true,
        content: [{
          type: 'text',
          text: `Error executing ${toolCall.name}: ${errorMessage}`
        }],
        executionTime,
        toolType: toolCall.type
      };
    }
  }

  // Get all available tools (MCP + Web)
  getAllAvailableTools() {
    const mcpTools = this.mcpClient.getAvailableTools();
    const webTools = this.webToolsManager.getWebTools();
    
    return [
      ...mcpTools.map(tool => ({ ...tool, type: 'mcp' })),
      ...webTools.map(tool => ({ ...tool, type: 'web' }))
    ];
  }

  // Determine tool type based on tool name
  getToolType(toolName: string): 'mcp' | 'web' {
    const webToolNames = ['web_search', 'web_fetch'];
    return webToolNames.includes(toolName) ? 'web' : 'mcp';
  }

  // Execute multiple tools in parallel where possible
  async executeToolsParallel(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    const results = await Promise.allSettled(
      toolCalls.map(toolCall => this.executeTool(toolCall))
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          toolCallId: toolCalls[index].id,
          result: { error: result.reason?.message || 'Unknown error' },
          isError: true,
          content: [{
            type: 'text',
            text: `Error executing ${toolCalls[index].name}: ${result.reason?.message || 'Unknown error'}`
          }],
          toolType: toolCalls[index].type
        };
      }
    });
  }

  // Intelligent tool selection based on query
  suggestToolsForQuery(query: string): string[] {
    const suggestions: string[] = [];
    const queryLower = query.toLowerCase();
    
    // Web search suggestions
    if (this.shouldUseWebSearch(queryLower)) {
      suggestions.push('web_search');
    }
    
    // ServiceNow MCP tool suggestions
    if (queryLower.includes('create') || queryLower.includes('build')) {
      if (queryLower.includes('catalog')) suggestions.push('create-catalog-item');
      if (queryLower.includes('business rule')) suggestions.push('create-business-rule');
      if (queryLower.includes('client script')) suggestions.push('create-client-script');
      if (queryLower.includes('flow')) suggestions.push('create-flow');
    }
    
    if (queryLower.includes('query') || queryLower.includes('find') || queryLower.includes('search')) {
      suggestions.push('query-records');
    }
    
    if (queryLower.includes('test') || queryLower.includes('connection')) {
      suggestions.push('test-connection');
    }

    return suggestions;
  }

  private shouldUseWebSearch(query: string): boolean {
    const webSearchIndicators = [
      'how to', 'best practice', 'documentation', 'example', 'tutorial',
      'error', 'issue', 'problem', 'solution', 'fix', 'troubleshoot',
      'latest', 'new', 'update', 'release', 'version', 'community',
      'forum', 'discussion', 'guide', 'reference'
    ];

    return webSearchIndicators.some(indicator => query.includes(indicator));
  }
}