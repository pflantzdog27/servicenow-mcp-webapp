import { Socket, Server } from 'socket.io';
import { PrismaClient, ToolExecutionStatus } from '@prisma/client';
import { getEnhancedMCPClient } from '../mcp/enhanced-mcp-client';
import { queueToolExecution } from '../queues/tool-execution-queue';
import { LLMService, LLMMessage } from '../llm/llm-interface';
import { AnthropicService } from '../llm/anthropic-service';
import { ActivityService } from '../services/activity';
import { ChatService } from '../services/chat';
import { AuthenticatedSocket } from '../middleware/socketAuth';
import { createLogger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  ToolCall,
  ChatMessage,
  StreamPhase,
  ToolExecutionPayload
} from '../types/websocket-types';

const logger = createLogger();
const prisma = new PrismaClient();

interface SocketWithUser extends Socket {
  userId: string;
  userEmail: string;
  userRole: string;
}

export class EnhancedChatHandlerIntegrated {
  private io: Server;
  private activityService: ActivityService;
  private chatService: ChatService;

  constructor(io: Server) {
    this.io = io;
    this.activityService = new ActivityService();
    this.chatService = new ChatService();
  }

  setupHandlers(socket: SocketWithUser) {
    const userId = socket.userId;
    
    // Handle new chat messages with enhanced streaming
    console.log('[HANDLER-CHECK] enhanced-chat-handler-integrated.ts is handling this message');
    socket.on('chat:message', async (data: {
      message: string;
      model: string;
      sessionId?: string;
    }) => {
      await this.handleEnhancedMessage(socket, data);
    });

    // Handle tool retry requests
    socket.on('chat:retry_tool', async (data: {
      toolCall: { name: string; arguments: any };
      messageId: string;
    }) => {
      await this.handleToolRetry(socket, data);
    });

    // Handle message retry requests
    socket.on('chat:retry_message', async (data: { messageId: string }) => {
      await this.handleMessageRetry(socket, data);
    });

    logger.info(`Enhanced chat handlers set up for user ${userId}`);
  }

  private async handleEnhancedMessage(
    socket: SocketWithUser,
    data: { message: string; model: string; sessionId?: string }
  ): Promise<void> {
    let messageId: string | null = null;
    let assistantMessageId: string | null = null;
    
    try {
      const userId = socket.userId;
      logger.info(`Processing enhanced chat message from user ${userId}`, {
        model: data.model,
        sessionId: data.sessionId
      });

      // Generate unique message ID for this conversation
      messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Phase 1: Start streaming
      socket.emit('chat:stream_start', { messageId });
      await this.delay(200); // Small delay for UX

      // Phase 2: Thinking phase
      socket.emit('chat:thinking', { messageId });
      await this.delay(500); // Simulate thinking time

      // Get or create chat session
      let sessionId = data.sessionId;
      if (!sessionId) {
        const session = await prisma.chatSession.create({
          data: {
            userId,
            model: data.model,
            contextLimit: this.getContextLimit(data.model),
            title: this.generateSessionTitle(data.message),
          },
        });
        sessionId = session.id;
      }

      // Create user message in database
      const userMessage = await prisma.message.create({
        data: {
          sessionId,
          role: 'USER',
          content: data.message,
          model: data.model,
        },
      });

      // Create assistant message placeholder
      const assistantMessage = await prisma.message.create({
        data: {
          sessionId,
          role: 'ASSISTANT',
          content: '',
          model: data.model,
        },
      });
      assistantMessageId = assistantMessage.id;

      // Get MCP client and available tools
      const mcpClient = getEnhancedMCPClient();
      const availableTools = mcpClient.getAvailableTools();

      // Phase 3: Determine if tools are needed
      const toolsToUse = await this.selectToolsForMessage(data.message, availableTools);
      
      // Phase 4: Execute tools if needed
      if (toolsToUse.length > 0) {
        await this.executeToolsSequentially(socket, messageId, assistantMessageId, toolsToUse);
      }

      // Phase 5: Generate and stream text response
      await this.streamTextResponse(
        socket,
        messageId,
        assistantMessageId,
        data.message,
        data.model,
        sessionId,
        toolsToUse
      );

      // Phase 6: Complete streaming
      const finalMessage = await prisma.message.findUnique({
        where: { id: assistantMessageId },
        include: {
          toolExecutions: true,
        },
      });

      const finalChatMessage: ChatMessage = {
        id: finalMessage!.id,
        role: 'assistant',
        content: finalMessage!.content,
        timestamp: finalMessage!.createdAt,
        model: finalMessage!.model || data.model,
        toolCalls: finalMessage!.toolExecutions.map(te => ({
          id: te.id,
          name: te.toolName,
          arguments: te.arguments as any,
          result: te.result as any,
          status: this.mapPrismaStatusToToolStatus(te.status),
          executionTime: te.executionTime || undefined,
          error: te.error || undefined,
        })),
      };

      socket.emit('chat:stream_complete', {
        messageId,
        finalMessage: finalChatMessage,
      });

    } catch (error) {
      logger.error('Error in enhanced message handling:', error);
      
      socket.emit('chat:error', {
        message: 'Failed to process your message',
        error: String(error),
        messageId,
      });
    }
  }

  private async executeToolsSequentially(
    socket: SocketWithUser,
    messageId: string,
    assistantMessageId: string,
    toolsToUse: Array<{ name: string; arguments: any }>
  ): Promise<void> {
    for (const tool of toolsToUse) {
      try {
        // Emit tool start
        socket.emit('chat:tool_start', {
          messageId,
          toolName: tool.name,
          arguments: tool.arguments,
        });

        // Create tool execution record
        const toolExecution = await prisma.toolExecution.create({
          data: {
            messageId: assistantMessageId,
            toolName: tool.name,
            arguments: tool.arguments as any,
            status: ToolExecutionStatus.EXECUTING,
          },
        });

        // Emit progress updates
        socket.emit('chat:tool_progress', {
          messageId,
          toolName: tool.name,
          progress: 25,
        });

        const startTime = Date.now();

        // Execute tool using enhanced MCP client
        const mcpClient = getEnhancedMCPClient();
        const toolResult = await mcpClient.executeTool({
          name: tool.name,
          arguments: tool.arguments,
        }, assistantMessageId);

        const executionTime = Date.now() - startTime;

        // Update progress
        socket.emit('chat:tool_progress', {
          messageId,
          toolName: tool.name,
          progress: 90,
        });

        // Update tool execution record
        await prisma.toolExecution.update({
          where: { id: toolExecution.id },
          data: {
            result: toolResult as any,
            status: toolResult.isError ? ToolExecutionStatus.FAILED : ToolExecutionStatus.COMPLETED,
            executionTime,
          },
        });

        // Emit tool completion
        socket.emit('chat:tool_complete', {
          messageId,
          toolName: tool.name,
          result: toolResult,
          executionTime,
        });

        await this.delay(200); // Brief pause between tools

      } catch (error) {
        logger.error(`Tool execution failed: ${tool.name}`, error);
        
        // Update tool execution with error
        await prisma.toolExecution.updateMany({
          where: {
            messageId: assistantMessageId,
            toolName: tool.name,
            status: ToolExecutionStatus.EXECUTING,
          },
          data: {
            status: ToolExecutionStatus.FAILED,
            error: String(error),
          },
        });

        socket.emit('chat:tool_error', {
          messageId,
          toolName: tool.name,
          error: String(error),
        });
      }
    }
  }

  private async streamTextResponse(
    socket: SocketWithUser,
    messageId: string,
    assistantMessageId: string,
    userMessage: string,
    model: string,
    sessionId: string,
    toolsUsed: Array<{ name: string; arguments: any }>
  ): Promise<void> {
    try {
      // Get conversation context
      const messages = await prisma.message.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'asc' },
        take: 10, // Last 10 messages for context
      });

      const llmMessages: LLMMessage[] = messages.map(msg => ({
        role: msg.role.toLowerCase() as 'user' | 'assistant',
        content: msg.content,
      }));

      // Create LLM service
      const llmService = this.createLLMService(model);
      const mcpClient = getEnhancedMCPClient();
      llmService.setAvailableTools(mcpClient.getAvailableTools());

      let fullResponse = '';

      // Stream response from LLM
      const response = await llmService.generateResponse(
        llmMessages,
        (chunk) => {
          if (chunk.type === 'text' && chunk.content) {
            fullResponse += chunk.content;
            
            // Emit text chunk
            socket.emit('chat:text_stream', {
              messageId,
              chunk: chunk.content,
            });
          }
        }
      );

      // If no streaming occurred, use the full response
      if (!fullResponse && response.message) {
        fullResponse = response.message;
        
        // Stream word by word for better UX
        const words = fullResponse.split(' ');
        for (let i = 0; i < words.length; i++) {
          const word = words[i];
          const chunk = i === 0 ? word : ` ${word}`;
          
          socket.emit('chat:text_stream', {
            messageId,
            chunk,
          });
          
          await this.delay(30 + Math.random() * 30); // Typing delay
        }
      }

      // Update database with final response
      await prisma.message.update({
        where: { id: assistantMessageId },
        data: { content: fullResponse },
      });

    } catch (error) {
      logger.error('Error streaming text response:', error);
      throw error;
    }
  }

  private async handleToolRetry(
    socket: SocketWithUser,
    data: { toolCall: { name: string; arguments: any }; messageId: string }
  ): Promise<void> {
    try {
      const userId = socket.userId;
      logger.info(`Retrying tool execution for user ${userId}`, {
        toolName: data.toolCall.name,
        messageId: data.messageId,
      });

      // Queue tool for execution with high priority
      await queueToolExecution({
        toolName: data.toolCall.name,
        arguments: data.toolCall.arguments,
        messageId: data.messageId,
        sessionId: 'retry',
        userId,
        priority: 1,
      });

      // Emit tool start event
      socket.emit('chat:tool_start', {
        messageId: data.messageId,
        toolName: data.toolCall.name,
        arguments: data.toolCall.arguments,
      });

    } catch (error) {
      logger.error('Error retrying tool:', error);
      
      socket.emit('chat:tool_error', {
        messageId: data.messageId,
        toolName: data.toolCall.name,
        error: String(error),
      });
    }
  }

  private async handleMessageRetry(
    socket: SocketWithUser,
    data: { messageId: string }
  ): Promise<void> {
    try {
      const userId = socket.userId;
      logger.info(`Retrying message for user ${userId}`, { messageId: data.messageId });
      
      // Find the original message and trigger a retry
      socket.emit('chat:thinking', { messageId: data.messageId });
      
      // Implementation would depend on how you want to handle message retries
      // This could involve re-processing the entire message flow
      
    } catch (error) {
      logger.error('Error retrying message:', error);
      
      socket.emit('chat:error', {
        message: 'Failed to retry message',
        error: String(error),
        messageId: data.messageId,
      });
    }
  }

  private async selectToolsForMessage(
    message: string,
    availableTools: any[]
  ): Promise<Array<{ name: string; arguments: any }>> {
    const toolsToUse = [];
    const lowerMessage = message.toLowerCase();
    
    // Simple tool selection logic based on message content
    if (lowerMessage.includes('create') && (lowerMessage.includes('incident') || lowerMessage.includes('ticket'))) {
      const createTool = availableTools.find(t => t.name.includes('create-incident'));
      if (createTool) {
        toolsToUse.push({
          name: createTool.name,
          arguments: {
            short_description: message.length > 100 ? message.substring(0, 100) : message,
            description: message,
            urgency: '3',
            impact: '3',
          },
        });
      }
    }

    if (lowerMessage.includes('search') || lowerMessage.includes('find') || lowerMessage.includes('list')) {
      const searchTool = availableTools.find(t => 
        t.name.includes('search') || t.name.includes('list') || t.name.includes('get')
      );
      if (searchTool) {
        toolsToUse.push({
          name: searchTool.name,
          arguments: {
            sysparm_query: `short_descriptionLIKE${message}`,
            sysparm_limit: '10',
          },
        });
      }
    }

    return toolsToUse.slice(0, 2); // Limit to 2 tools max for performance
  }

  private generateSessionTitle(message: string): string {
    const words = message.split(' ');
    const title = words.slice(0, 6).join(' ');
    return title.length > 50 ? title.substring(0, 50) + '...' : title;
  }

  private getContextLimit(model: string): number {
    const limits: Record<string, number> = {
      'gpt-4': 8192,
      'gpt-3.5-turbo': 4096,
      'claude-3-sonnet': 200000,
      'claude-3-opus': 200000,
      'claude-sonnet-4-20250514': 200000,
    };
    return limits[model] || 4096;
  }

  private createLLMService(model: string): LLMService {
    // Only support Anthropic models
    if (model.startsWith('claude-')) {
      return new AnthropicService(model);
    } else {
      // Default to Claude Sonnet 4
      return new AnthropicService('claude-sonnet-4-20250514');
    }
  }

  private mapPrismaStatusToToolStatus(status: ToolExecutionStatus): ToolCall['status'] {
    switch (status) {
      case ToolExecutionStatus.QUEUED:
        return 'pending';
      case ToolExecutionStatus.EXECUTING:
        return 'executing';
      case ToolExecutionStatus.COMPLETED:
        return 'completed';
      case ToolExecutionStatus.FAILED:
        return 'error';
      default:
        return 'error';
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  cleanup(socketId: string): void {
    // Cleanup any socket-specific resources
    logger.info(`Cleaning up resources for socket ${socketId}`);
  }
}