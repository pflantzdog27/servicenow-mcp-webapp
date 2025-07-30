import { Socket } from 'socket.io';
import { MCPClientManager } from '../mcp/mcp-client';
import { LLMService, LLMMessage } from '../llm/llm-interface';
import { OpenAIService } from '../llm/openai-service';
import { AnthropicService } from '../llm/anthropic-service';
import { createLogger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger();

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolCalls?: any[];
  model?: string;
}

export interface ChatSession {
  messages: ChatMessage[];
  model: string;
  llmService: LLMService;
}

export class ChatHandler {
  private sessions: Map<string, ChatSession> = new Map();
  private mcpClientManager: MCPClientManager;

  constructor(mcpClientManager: MCPClientManager) {
    this.mcpClientManager = mcpClientManager;
  }

  setModel(socketId: string, model: string): void {
    let session = this.sessions.get(socketId);
    if (!session) {
      session = this.createSession(model);
      this.sessions.set(socketId, session);
    } else {
      session.model = model;
      session.llmService = this.createLLMService(model);
      session.llmService.setAvailableTools(this.mcpClientManager.getAvailableTools());
    }
  }

  async handleMessage(socket: Socket, data: { message: string; model?: string }): Promise<void> {
    const socketId = socket.id;
    logger.info(`Handling message from ${socketId}:`, { message: data.message, model: data.model });
    
    // Get or create session
    let session = this.sessions.get(socketId);
    if (!session) {
      const model = data.model || 'claude-sonnet-4-20250514';
      logger.info(`Creating new session with model: ${model}`);
      session = this.createSession(model);
      this.sessions.set(socketId, session);
    }

    // Add user message
    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: data.message,
      timestamp: new Date()
    };
    session.messages.push(userMessage);

    // No need to emit user message back - frontend already has it

    try {
      // Generate AI response with streaming
      const assistantMessage: ChatMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        toolCalls: [],
        model: session.model
      };

      // Start streaming response
      logger.info(`Starting stream for message: ${assistantMessage.id}`);
      socket.emit('chat:stream_start', { messageId: assistantMessage.id });

      const llmMessages: LLMMessage[] = session.messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      const response = await session.llmService.generateResponse(
        llmMessages,
        (chunk) => {
          logger.info(`Streaming chunk: ${chunk.type} - ${chunk.content?.substring(0, 50)}...`);
          if (chunk.type === 'text') {
            assistantMessage.content += chunk.content;
            socket.emit('chat:stream', {
              messageId: assistantMessage.id,
              type: 'text',
              content: chunk.content
            });
          }
        }
      );

      assistantMessage.content = response.message;

      // Execute tool calls if any
      if (response.toolCalls && response.toolCalls.length > 0) {
        assistantMessage.toolCalls = [];

        for (const toolCall of response.toolCalls) {
          try {
            // Emit tool execution start
            socket.emit('chat:tool_start', {
              messageId: assistantMessage.id,
              toolName: toolCall.name,
              arguments: toolCall.arguments
            });

            // Execute the tool
            const toolResult = await this.mcpClientManager.executeTool(toolCall);
            
            // Add to tool calls array
            assistantMessage.toolCalls.push({
              name: toolCall.name,
              arguments: toolCall.arguments,
              result: toolResult
            });

            // Emit tool result
            socket.emit('chat:tool_result', {
              messageId: assistantMessage.id,
              toolName: toolCall.name,
              result: toolResult,
              success: !toolResult.isError
            });

            // Format tool result for display
            const resultText = this.formatToolResult(toolCall.name, toolResult);
            if (resultText) {
              assistantMessage.content += `\n\n${resultText}`;
              socket.emit('chat:stream', {
                messageId: assistantMessage.id,
                type: 'tool_result',
                content: resultText
              });
            }

          } catch (error) {
            logger.error(`Tool execution failed: ${toolCall.name}`, error);
            socket.emit('chat:tool_error', {
              messageId: assistantMessage.id,
              toolName: toolCall.name,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      }

      // Finalize message
      session.messages.push(assistantMessage);
      logger.info(`Finalizing message: ${assistantMessage.id} with content length: ${assistantMessage.content.length}`);
      socket.emit('chat:stream_complete', {
        messageId: assistantMessage.id,
        message: assistantMessage
      });
      logger.info(`Stream complete event sent for message: ${assistantMessage.id}`);

      // Emit activity log
      if (assistantMessage.toolCalls && assistantMessage.toolCalls.length > 0) {
        socket.emit('activity:log', {
          timestamp: assistantMessage.timestamp,
          operations: assistantMessage.toolCalls.map(tc => ({
            tool: tc.name,
            arguments: tc.arguments,
            success: !tc.result.isError
          }))
        });
      }

    } catch (error) {
      logger.error('Error generating response:', error);
      socket.emit('chat:error', {
        message: 'Failed to generate response',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private createSession(model: string): ChatSession {
    const llmService = this.createLLMService(model);
    llmService.setAvailableTools(this.mcpClientManager.getAvailableTools());
    
    return {
      messages: [],
      model,
      llmService
    };
  }

  private createLLMService(model: string): LLMService {
    if (model.startsWith('gpt-') || model.startsWith('o4-')) {
      return new OpenAIService(model);
    } else if (model.startsWith('claude-')) {
      return new AnthropicService(model);
    } else {
      // Default to Claude 4 Sonnet
      return new AnthropicService('claude-sonnet-4-20250514');
    }
  }

  private formatToolResult(toolName: string, result: any): string {
    if (result.isError) {
      return `❌ ${toolName} failed: ${result.content?.[0]?.text || 'Unknown error'}`;
    }

    const content = result.content?.[0]?.text;
    if (!content) return '';

    // Try to extract sys_id for creating links
    const sysIdMatch = content.match(/sys_id['":\s]*([a-f0-9]{32})/i);
    if (sysIdMatch) {
      const sysId = sysIdMatch[1];
      const instanceUrl = process.env.SERVICENOW_INSTANCE_URL;
      if (instanceUrl) {
        return `✅ ${toolName} completed successfully. [View Record](${instanceUrl}/nav_to.do?uri=sys_id=${sysId})`;
      }
    }

    return `✅ ${toolName} completed successfully`;
  }

  cleanup(socketId: string): void {
    this.sessions.delete(socketId);
  }
}