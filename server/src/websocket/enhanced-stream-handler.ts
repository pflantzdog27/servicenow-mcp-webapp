import { Socket } from 'socket.io';
import { MCPClientManager } from '../mcp/mcp-client';
import { parseAssistantMessage, extractToolInvocationsFromLLMResponse, ToolInvocation } from '../utils/message-parser';
import { AuthenticatedSocket } from '../middleware/socketAuth';
import { createLogger } from '../utils/logger';

const logger = createLogger();

export interface StreamChunk {
  type: 'text' | 'tool_use' | 'tool_result';
  content?: string;
  toolUse?: {
    id: string;
    name: string;
    input: any;
  };
  toolResult?: {
    id: string;
    content: any;
    isError: boolean;
  };
}

export class EnhancedStreamHandler {
  constructor(
    private mcpClientManager: MCPClientManager
  ) {}

  async handleStreamingResponse(
    socket: AuthenticatedSocket,
    llmStream: AsyncIterable<StreamChunk>,
    messageId: string
  ): Promise<void> {
    let fullMessage = '';
    let activeToolInvocations = new Map<string, ToolInvocation>();
    
    try {
      logger.info(`Starting enhanced stream for message: ${messageId}`);
      
      // Notify client that streaming has started
      socket.emit('chat:stream_start', { messageId });
      
      // Process each chunk from the LLM
      for await (const chunk of llmStream) {
        logger.info(`Processing chunk: ${chunk.type}`, { chunk });
        
        if (chunk.type === 'text') {
          // Handle text streaming
          fullMessage += chunk.content || '';
          
          socket.emit('chat:stream', {
            messageId,
            type: 'text',
            content: chunk.content
          });
          
        } else if (chunk.type === 'tool_use') {
          // Handle tool invocation
          const toolUse = chunk.toolUse!;
          const toolInvocation: ToolInvocation = {
            id: toolUse.id,
            name: toolUse.name,
            parameters: toolUse.input,
            position: fullMessage.length
          };
          
          activeToolInvocations.set(toolUse.id, toolInvocation);
          
          // Notify client about tool execution start
          socket.emit('chat:tool_start', {
            messageId,
            toolId: toolUse.id,
            toolName: toolUse.name,
            arguments: toolUse.input
          });
          
          // Execute the tool
          this.executeToolAsync(socket, messageId, toolInvocation);
          
        } else if (chunk.type === 'tool_result') {
          // Handle tool result (if provided by LLM)
          const toolResult = chunk.toolResult!;
          const toolInvocation = activeToolInvocations.get(toolResult.id);
          
          if (toolInvocation) {
            socket.emit('chat:tool_result', {
              messageId,
              toolId: toolResult.id,
              toolName: toolInvocation.name,
              result: toolResult.content,
              success: !toolResult.isError
            });
          }
        }
      }
      
      // Stream is complete
      logger.info(`Stream complete for message: ${messageId}`);
      
      // Convert active tool invocations to array
      const toolInvocations = Array.from(activeToolInvocations.values());
      
      // Create final message object
      const finalMessage = {
        id: messageId,
        role: 'assistant' as const,
        content: fullMessage,
        timestamp: new Date(),
        toolCalls: toolInvocations.map(inv => ({
          name: inv.name,
          arguments: inv.parameters,
          status: 'completed' as const
        })),
        model: 'claude-sonnet-4' // TODO: Get from context
      };
      
      socket.emit('chat:stream_complete', {
        messageId,
        message: finalMessage
      });
      
    } catch (error) {
      logger.error('Stream error:', error);
      socket.emit('chat:error', {
        messageId,
        error: error instanceof Error ? error.message : 'Unknown streaming error'
      });
    }
  }
  
  private async executeToolAsync(
    socket: AuthenticatedSocket,
    messageId: string,
    toolInvocation: ToolInvocation
  ): Promise<void> {
    try {
      logger.info(`Executing tool: ${toolInvocation.name}`, { parameters: toolInvocation.parameters });
      
      // Execute the tool through MCP
      const result = await this.mcpClientManager.executeTool({
        name: toolInvocation.name,
        arguments: toolInvocation.parameters
      });
      
      logger.info(`Tool execution completed: ${toolInvocation.name}`, { result });
      
      // Send success result to client
      socket.emit('chat:tool_result', {
        messageId,
        toolId: toolInvocation.id,
        toolName: toolInvocation.name,
        result,
        success: !result.isError
      });
      
      // Also stream the formatted result as text
      const resultText = this.formatToolResult(toolInvocation.name, result);
      if (resultText) {
        socket.emit('chat:stream', {
          messageId,
          type: 'tool_result',
          content: `\n\n${resultText}`
        });
      }
      
    } catch (error) {
      logger.error(`Tool execution failed: ${toolInvocation.name}`, error);
      
      // Send error result to client
      socket.emit('chat:tool_result', {
        messageId,
        toolId: toolInvocation.id,
        toolName: toolInvocation.name,
        result: { error: error instanceof Error ? error.message : 'Unknown error' },
        success: false
      });
    }
  }
  
  private formatToolResult(toolName: string, result: any): string {
    if (result.isError) {
      return `❌ ${toolName} failed: ${result.content?.[0]?.text || 'Unknown error'}`;
    }
    
    const content = result.content?.[0]?.text;
    if (!content) return '';
    
    // Try to extract sys_id for creating links
    const sysIdMatch = content.match(/sys_id['\":\\s]*([a-f0-9]{32})/i);
    if (sysIdMatch) {
      const sysId = sysIdMatch[1];
      const instanceUrl = process.env.SERVICENOW_INSTANCE_URL;
      if (instanceUrl) {
        return `✅ ${toolName} completed successfully. [View Record](${instanceUrl}/nav_to.do?uri=sys_id=${sysId})`;
      }
    }
    
    return `✅ ${toolName} completed successfully`;
  }
  
  // Handle legacy streaming format for backward compatibility
  async handleLegacyStream(
    socket: AuthenticatedSocket,
    textStream: AsyncIterable<string>,
    messageId: string,
    toolCalls?: any[]
  ): Promise<void> {
    let fullMessage = '';
    
    try {
      socket.emit('chat:stream_start', { messageId });
      
      // Stream text content
      for await (const chunk of textStream) {
        fullMessage += chunk;
        socket.emit('chat:stream', {
          messageId,
          type: 'text',
          content: chunk
        });
      }
      
      // Execute tool calls if provided
      if (toolCalls && toolCalls.length > 0) {
        for (const toolCall of toolCalls) {
          socket.emit('chat:tool_start', {
            messageId,
            toolName: toolCall.name,
            arguments: toolCall.arguments
          });
          
          try {
            const result = await this.mcpClientManager.executeTool(toolCall);
            
            socket.emit('chat:tool_result', {
              messageId,
              toolName: toolCall.name,
              result,
              success: !result.isError
            });
            
            // Add result to message content
            const resultText = this.formatToolResult(toolCall.name, result);
            if (resultText) {
              fullMessage += `\n\n${resultText}`;
              socket.emit('chat:stream', {
                messageId,
                type: 'tool_result',
                content: `\n\n${resultText}`
              });
            }
            
          } catch (error) {
            logger.error(`Tool execution failed: ${toolCall.name}`, error);
            socket.emit('chat:tool_error', {
              messageId,
              toolName: toolCall.name,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      }
      
      // Complete the stream
      const finalMessage = {
        id: messageId,
        role: 'assistant' as const,
        content: fullMessage,
        timestamp: new Date(),
        toolCalls: toolCalls || [],
        model: 'claude-sonnet-4'
      };
      
      socket.emit('chat:stream_complete', {
        messageId,
        message: finalMessage
      });
      
    } catch (error) {
      logger.error('Legacy stream error:', error);
      socket.emit('chat:error', {
        messageId,
        error: error instanceof Error ? error.message : 'Unknown streaming error'
      });
    }
  }
}