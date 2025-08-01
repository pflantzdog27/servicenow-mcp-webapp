import { Socket, Server } from 'socket.io';
import { PrismaClient, ToolExecutionStatus } from '@prisma/client';
import { MCPClientManager } from '../mcp/mcp-client';
import { getEnhancedMCPClient } from '../mcp/enhanced-mcp-client';
import { LLMService, LLMMessage } from '../llm/llm-interface';
import { OpenAIService } from '../llm/openai-service';
import { AnthropicService } from '../llm/anthropic-service';
import { ActivityService } from '../services/activity';
import { ChatService } from '../services/chat';
import { AuthenticatedSocket } from '../middleware/socketAuth';
import { ContextAwareMessageHandler } from '../handlers/context-aware-handler';
import { EnhancedChatHandlerIntegrated } from './enhanced-chat-handler-integrated';
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

interface SocketWithUser extends Socket {
  userId: string;
  userEmail: string;
  userRole: string;
}

export class ChatHandler {
  private sessions: Map<string, ChatSession> = new Map();
  private mcpClientManager: MCPClientManager;
  private activityService: ActivityService;
  private chatService: ChatService;
  private contextAwareHandler: ContextAwareMessageHandler;
  private enhancedHandler: EnhancedChatHandlerIntegrated;
  private io: Server;

  constructor(mcpClientManager: MCPClientManager, io: Server) {
    this.mcpClientManager = mcpClientManager;
    this.io = io;
    this.activityService = new ActivityService();
    this.chatService = new ChatService();
    this.contextAwareHandler = new ContextAwareMessageHandler(
      mcpClientManager,
      process.env.SERVICENOW_INSTANCE_URL || ''
    );
    this.enhancedHandler = new EnhancedChatHandlerIntegrated(io);
  }

  // Setup handlers for a new socket connection
  setupHandlers(socket: AuthenticatedSocket): void {
    const userId = socket.user?.userId;
    if (!userId) {
      logger.error('Socket missing user information');
      return;
    }

    // Cast to include user info
    const socketWithUser = socket as any as SocketWithUser;
    socketWithUser.userId = userId;
    socketWithUser.userEmail = socket.user?.email || '';
    socketWithUser.userRole = socket.user?.role || 'USER';

    // Setup enhanced handlers (preferred)
    this.enhancedHandler.setupHandlers(socketWithUser);

    // Also setup legacy handlers for backward compatibility
    socket.on('chat:message', async (data) => {
      try {
        await this.handleMessage(socket, data);
      } catch (error) {
        logger.error('Error in legacy message handler:', error);
        // Fallback handled by enhanced handler
      }
    });

    socket.on('disconnect', () => {
      this.cleanup(socket.id);
    });

    logger.info(`Chat handlers set up for user ${userId}`);
  }

  async setModel(socketId: string, model: string, userId: string): Promise<void> {
    let session = this.sessions.get(socketId);
    if (!session) {
      session = await this.createSession(model, userId);
      this.sessions.set(socketId, session);
    } else {
      session.model = model;
      session.llmService = this.createLLMService(model);
      
      // Set tools for both old and new MCP clients
      try {
        session.llmService.setAvailableTools(this.mcpClientManager.getAvailableTools());
      } catch (error) {
        logger.warn('Failed to set tools on legacy MCP client, trying enhanced client:', error);
        try {
          const enhancedClient = getEnhancedMCPClient();
          session.llmService.setAvailableTools(enhancedClient.getAvailableTools());
        } catch (enhancedError) {
          logger.error('Failed to set tools on enhanced MCP client:', enhancedError);
        }
      }
    }
  }

  async handleMessage(socket: AuthenticatedSocket, data: { message: string; model?: string }): Promise<void> {
    // Prefer enhanced handler, fallback to context-aware, then legacy
    try {
      // Enhanced handler is already set up via setupHandlers, so this is just for compatibility
      logger.debug('Legacy handleMessage called, enhanced handler should have processed this');
      return;
    } catch (enhancedError) {
      logger.warn('Enhanced handler failed, trying context-aware:', enhancedError);
      
      try {
        const model = data.model || 'claude-sonnet-4-20250514';
        const llmService = this.createLLMService(model);
        const messageId = uuidv4();
        
        return await this.contextAwareHandler.processMessage(
          socket,
          messageId,
          data.message,
          llmService,
          model
        );
      } catch (contextError) {
        logger.warn('Context-aware handler failed, falling back to legacy:', contextError);
        return this.handleMessageLegacy(socket, data);
      }
    }
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
      logger.info(`Starting legacy stream for message: ${assistantMessage.id}`);
      socket.emit('chat:stream_start', { messageId: assistantMessage.id });

      const llmMessages: LLMMessage[] = session.messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      const response = await session.llmService.generateResponse(
        llmMessages,
        (chunk) => {
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

            // Emit enhanced tool execution events
            socket.emit('chat:tool_start', {
              messageId: assistantMessage.id,
              toolName: toolCall.name,
              arguments: toolCall.arguments
            });

            const startTime = Date.now();

            // Try enhanced MCP client first, fallback to legacy
            let toolResult;
            try {
              const enhancedClient = getEnhancedMCPClient();
              toolResult = await enhancedClient.executeTool(toolCall, assistantMessage.id);
            } catch (enhancedError) {
              logger.warn('Enhanced MCP client failed, using legacy:', enhancedError);
              toolResult = await this.mcpClientManager.executeTool(toolCall);
            }

            const executionTime = Date.now() - startTime;
            
            // Update tool execution with result
            await prisma.toolExecution.update({
              where: { id: toolExecution.id },
              data: {
                result: JSON.stringify(toolResult),
                status: toolResult.isError ? ToolExecutionStatus.FAILED : ToolExecutionStatus.COMPLETED,
                executionTime
              }
            });
            
            // Add to tool calls array
            assistantMessage.toolCalls.push({
              name: toolCall.name,
              arguments: toolCall.arguments,
              result: toolResult,
              executionTime
            });

            // Emit enhanced tool completion events
            socket.emit('chat:tool_complete', {
              messageId: assistantMessage.id,
              toolName: toolCall.name,
              result: toolResult,
              executionTime
            });

            // Legacy event for backward compatibility
            socket.emit('chat:tool_result', {
              messageId: assistantMessage.id,
              toolName: toolCall.name,
              result: toolResult,
              success: !toolResult.isError
            });

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
            
            // Emit enhanced error events
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
      logger.info(`Finalizing legacy message: ${assistantMessage.id}`);
      
      socket.emit('chat:stream_complete', {
        messageId: assistantMessage.id,
        message: assistantMessage,
        finalMessage: assistantMessage // Enhanced format
      });

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
      logger.error('Error in legacy message handler:', error);
      socket.emit('chat:error', {
        message: 'Failed to generate response',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async createSession(model: string, userId: string): Promise<ChatSession> {
    const llmService = this.createLLMService(model);
    
    // Try to set tools from enhanced client first, fallback to legacy
    try {
      const enhancedClient = getEnhancedMCPClient();
      llmService.setAvailableTools(enhancedClient.getAvailableTools());
    } catch (error) {
      logger.warn('Enhanced MCP client not available, using legacy:', error);
      try {
        llmService.setAvailableTools(this.mcpClientManager.getAvailableTools());
      } catch (legacyError) {
        logger.error('Both MCP clients failed to provide tools:', legacyError);
      }
    }
    
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

  cleanup(socketId: string): void {
    const session = this.sessions.get(socketId);
    if (session && session.dbSessionId) {
      this.contextAwareHandler.cleanup(socketId);
    }
    this.enhancedHandler.cleanup(socketId);
    this.sessions.delete(socketId);
  }
}

// Setup function for WebSockets
export function setupChatHandlers(io: Server, socket: AuthenticatedSocket) {
  // This will be called by the main WebSocket setup
  const mcpClientManager = new MCPClientManager(); // This might need to be injected
  const chatHandler = new ChatHandler(mcpClientManager, io);
  
  chatHandler.setupHandlers(socket);
  
  return chatHandler;
}