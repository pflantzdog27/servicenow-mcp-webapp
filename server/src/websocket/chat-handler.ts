import { Socket } from 'socket.io';
import { PrismaClient, ToolExecutionStatus } from '@prisma/client';
import { MCPClientManager } from '../mcp/mcp-client';
import { LLMService, LLMMessage } from '../llm/llm-interface';
import { OpenAIService } from '../llm/openai-service';
import { AnthropicService } from '../llm/anthropic-service';
import { ActivityService } from '../services/activity';
import { ChatService } from '../services/chat';
import { AuthenticatedSocket } from '../middleware/socketAuth';
import { ContextAwareMessageHandler } from '../handlers/context-aware-handler';
import { createLogger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger();
const prisma = new PrismaClient();

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
  dbSessionId?: string;
}

export class ChatHandler {
  private sessions: Map<string, ChatSession> = new Map();
  private mcpClientManager: MCPClientManager;
  private activityService: ActivityService;
  private chatService: ChatService;
  private contextAwareHandler: ContextAwareMessageHandler;

  constructor(mcpClientManager: MCPClientManager) {
    this.mcpClientManager = mcpClientManager;
    this.activityService = new ActivityService();
    this.chatService = new ChatService();
    this.contextAwareHandler = new ContextAwareMessageHandler(
      mcpClientManager,
      process.env.SERVICENOW_INSTANCE_URL || ''
    );
  }

  async setModel(socketId: string, model: string, userId: string): Promise<void> {
    let session = this.sessions.get(socketId);
    if (!session) {
      session = await this.createSession(model, userId);
      this.sessions.set(socketId, session);
    } else {
      session.model = model;
      session.llmService = this.createLLMService(model);
      session.llmService.setAvailableTools(this.mcpClientManager.getAvailableTools());
    }
  }

  async handleMessage(socket: AuthenticatedSocket, data: { message: string; model?: string }): Promise<void> {
    // Use legacy handler for now while debugging the hanging issue
    return this.handleMessageLegacy(socket, data);
  }

  // Legacy method for backward compatibility
  async handleMessageLegacy(socket: AuthenticatedSocket, data: { message: string; model?: string }): Promise<void> {
    const socketId = socket.id;
    const userId = socket.user!.userId;
    logger.info(`Legacy handler processing message from ${socketId}:`, { message: data.message, model: data.model });
    
    try {
      // Get or create session
      let session = this.sessions.get(socketId);
      if (!session) {
        const model = data.model || 'claude-sonnet-4-20250514';
        logger.info(`Creating new session with model: ${model}`);
        session = await this.createSession(model, userId);
        this.sessions.set(socketId, session);
      }

      // Create user message in database
      const userDbMessage = await prisma.message.create({
        data: {
          role: 'USER',
          content: data.message,
          sessionId: session.dbSessionId!,
          model: session.model
        }
      });

      // Add user message to in-memory session
      const userMessage: ChatMessage = {
        id: userDbMessage.id,
        role: 'user',
        content: data.message,
        timestamp: userDbMessage.createdAt
      };
      session.messages.push(userMessage);

      // Auto-generate session title from first message if needed
      if (session.messages.length === 1) {
        await this.chatService.updateSessionTitle(session.dbSessionId!, userId, '');
      }

      // No need to emit user message back - frontend already has it

      // Generate AI response with streaming
      const assistantDbMessage = await prisma.message.create({
        data: {
          role: 'ASSISTANT',
          content: '',
          sessionId: session.dbSessionId!,
          model: session.model
        }
      });

      const assistantMessage: ChatMessage = {
        id: assistantDbMessage.id,
        role: 'assistant',
        content: '',
        timestamp: assistantDbMessage.createdAt,
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
          let toolExecution;
          try {
            // Create tool execution record
            toolExecution = await prisma.toolExecution.create({
              data: {
                messageId: assistantMessage.id,
                toolName: toolCall.name,
                arguments: JSON.stringify(toolCall.arguments),
                status: ToolExecutionStatus.EXECUTING
              }
            });

            // Emit tool execution start
            socket.emit('chat:tool_start', {
              messageId: assistantMessage.id,
              toolName: toolCall.name,
              arguments: toolCall.arguments
            });

            // Execute the tool
            const toolResult = await this.mcpClientManager.executeTool(toolCall);
            
            // Update tool execution with result
            await prisma.toolExecution.update({
              where: { id: toolExecution.id },
              data: {
                result: JSON.stringify(toolResult),
                status: toolResult.isError ? ToolExecutionStatus.FAILED : ToolExecutionStatus.COMPLETED
              }
            });
            
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
            
            // Update tool execution with error if it was created
            if (toolExecution) {
              await prisma.toolExecution.update({
                where: { id: toolExecution.id },
                data: {
                  status: ToolExecutionStatus.FAILED,
                  error: error instanceof Error ? error.message : 'Unknown error'
                }
              });
            }
            
            socket.emit('chat:tool_error', {
              messageId: assistantMessage.id,
              toolName: toolCall.name,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      }

      // Update assistant message content in database
      await prisma.message.update({
        where: { id: assistantMessage.id },
        data: {
          content: assistantMessage.content
        }
      });

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

  private async createSession(model: string, userId: string): Promise<ChatSession> {
    const llmService = this.createLLMService(model);
    llmService.setAvailableTools(this.mcpClientManager.getAvailableTools());
    
    // Create database session
    const dbSession = await prisma.chatSession.create({
      data: {
        userId,
        model,
        contextLimit: this.getContextLimit(model),
        title: 'New Chat'
      }
    });
    
    return {
      messages: [],
      model,
      llmService,
      dbSessionId: dbSession.id
    };
  }

  private getContextLimit(model: string): number {
    if (model.startsWith('gpt-4o')) return 128000;
    if (model.startsWith('gpt-4')) return 8000;
    if (model.startsWith('gpt-3.5')) return 4000;
    if (model.startsWith('o1-')) return 128000;
    if (model.startsWith('claude-')) return 200000;
    return 4000; // default
  }

  private createLLMService(model: string): LLMService {
    // Only support Anthropic models now
    if (model.startsWith('claude-')) {
      return new AnthropicService(model);
    } else {
      // Default to Claude Sonnet 4
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
    const session = this.sessions.get(socketId);
    if (session && session.dbSessionId) {
      // Extract user ID from session if available
      // This is a simplified approach - in a real implementation, you'd want to track userId properly
      this.contextAwareHandler.cleanup(socketId);
    }
    this.sessions.delete(socketId);
  }
}