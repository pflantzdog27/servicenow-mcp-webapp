import { Socket } from 'socket.io';
import { PrismaClient, ToolExecutionStatus } from '@prisma/client';
import { MCPClientManager, MCPToolCall, MCPToolResult } from '../mcp/mcp-client';
import { LLMService, LLMMessage } from '../llm/llm-interface';
import { AnthropicService } from '../llm/anthropic-service';
import { ActivityService } from '../services/activity';
import { ChatService } from '../services/chat';
import { AuthenticatedSocket } from '../middleware/socketAuth';
import { createLogger } from '../utils/logger';
import { buildSystemPrompt } from '../llm/system-prompt';
import { 
  RetryManager, 
  ErrorRecoveryManager, 
  ToolExecutionError, 
  handleError,
  globalErrorRecovery 
} from '../utils/error-handler';
import { v4 as uuidv4 } from 'uuid';
import { 
  ToolApprovalRequest, 
  ToolApprovalResponse, 
  ToolExecutionStatus as MCPToolExecutionStatus,
  ConversationContext 
} from '../../../shared/src/types/mcp';

const logger = createLogger();
const prisma = new PrismaClient();

export interface EnhancedChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolCalls?: MCPToolExecutionStatus[];
  model?: string;
}

export interface EnhancedChatSession {
  messages: EnhancedChatMessage[];
  model: string;
  llmService: LLMService;
  dbSessionId?: string;
  context: ConversationContext;
  pendingApprovals: Map<string, ToolApprovalRequest>;
  approvedTools: Set<string>;
}

export class EnhancedChatHandlerWithApproval {
  private sessions: Map<string, EnhancedChatSession> = new Map();
  private mcpClientManager: MCPClientManager;
  private activityService: ActivityService;
  private chatService: ChatService;
  private toolApprovalTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private errorRecovery: ErrorRecoveryManager;

  constructor(mcpClientManager: MCPClientManager) {
    this.mcpClientManager = mcpClientManager;
    this.activityService = new ActivityService();
    this.chatService = new ChatService();
    this.errorRecovery = globalErrorRecovery;
  }

  async handleMessage(socket: AuthenticatedSocket, data: { message: string; model?: string }): Promise<void> {
    console.log('\n🔍 [ENHANCED-HANDLER] Starting message handling');
    console.log('🔍 [ENHANCED-HANDLER] Socket exists?', !!socket);
    console.log('🔍 [ENHANCED-HANDLER] Socket user?', !!socket.user);
    console.log('🔍 [ENHANCED-HANDLER] Data:', data);
    
    const socketId = socket.id;
    const userId = socket.user!.userId;
    const model = data.model || 'claude-sonnet-4-20250514';
    
    console.log('🔍 [ENHANCED-HANDLER] MCP Client exists?', !!this.mcpClientManager);
    
    // Debug: Check available tools
    const availableTools = this.mcpClientManager.getAvailableTools();
    console.log('🔍 [ENHANCED-HANDLER] Raw MCP tools:', availableTools);
    console.log('🔍 [ENHANCED-HANDLER] MCP tool count:', availableTools.length);
    console.log('🔍 [ENHANCED-HANDLER] First tool example:', availableTools[0]);
    
    logger.info(`🔧 [DEBUG] Enhanced handler - Available tools: ${availableTools.length}`, {
      toolNames: availableTools.map(t => t.name)
    });
    
    logger.info(`Enhanced handler processing message from ${socketId}:`, { 
      message: data.message, 
      model,
      userId 
    });
    
    try {
      console.log('🔍 [ENHANCED-HANDLER] About to get/create session');
      
      // Get or create session
      let session = this.sessions.get(socketId);
      console.log('🔍 [ENHANCED-HANDLER] Existing session?', !!session);
      
      if (!session) {
        console.log('🔍 [ENHANCED-HANDLER] Creating new session...');
        session = await this.createSession(model, userId);
        this.sessions.set(socketId, session);
        console.log('🔍 [ENHANCED-HANDLER] New session created');
      }
      
      console.log('🔍 [ENHANCED-HANDLER] Session LLM service exists?', !!session.llmService);
      
      // CRITICAL: Always update LLM service with latest tools on every message
      const mcpTools = this.mcpClientManager.getAvailableTools();
      console.log('🔍 [ENHANCED-HANDLER] MCP tools for setting:', mcpTools.length);
      
      const allAvailableTools = {
        mcp: mcpTools,
        web: [] // No web tools in enhanced version for now
      };
      console.log('🔍 [ENHANCED-HANDLER] Setting tools on LLM service:', allAvailableTools);
      
      session.llmService.setAvailableTools(allAvailableTools);
      console.log('🔍 [ENHANCED-HANDLER] Tools set successfully');
      
      // Verify tools were set
      console.log('🔍 [ENHANCED-HANDLER] Verifying tools were set...');
      const verifyTools = session.llmService.availableTools || {};
      console.log('🔍 [ENHANCED-HANDLER] Tools after setting:', {
        mcpCount: verifyTools.mcp?.length || 0,
        webCount: verifyTools.web?.length || 0
      });
      
      logger.info(`🔧 [DEBUG] Tools set on LLM service: MCP=${mcpTools.length}, Web=0`, {
        mcpToolNames: mcpTools.map(t => t.name)
      });

      // Create user message in database
      const userDbMessage = await prisma.message.create({
        data: {
          role: 'USER',
          content: data.message,
          sessionId: session.dbSessionId!,
          model: session.model
        }
      });

      // Add user message to session
      const userMessage: EnhancedChatMessage = {
        id: userDbMessage.id,
        role: 'user',
        content: data.message,
        timestamp: userDbMessage.createdAt
      };
      session.messages.push(userMessage);
      session.context.messages.push(userMessage);

      // Auto-generate session title if first message
      if (session.messages.length === 1) {
        await this.chatService.updateSessionTitle(session.dbSessionId!, userId, '');
      }

      // Generate AI response with enhanced context
      await this.generateEnhancedResponse(socket, session, userMessage.id);

    } catch (error) {
      logger.error('Error in enhanced chat handler:', error);
      socket.emit('chat:error', {
        message: 'Failed to process message',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async handleToolApproval(socket: AuthenticatedSocket, data: ToolApprovalResponse): Promise<void> {
    const socketId = socket.id;
    const session = this.sessions.get(socketId);
    
    if (!session) {
      logger.error('Tool approval received for unknown session:', socketId);
      return;
    }

    const approval = session.pendingApprovals.get(data.id);
    if (!approval) {
      logger.error('Tool approval received for unknown request:', data.id);
      return;
    }

    // Clear timeout
    const timeout = this.toolApprovalTimeouts.get(data.id);
    if (timeout) {
      clearTimeout(timeout);
      this.toolApprovalTimeouts.delete(data.id);
    }

    // Remove from pending
    session.pendingApprovals.delete(data.id);

    if (data.approved) {
      // Add to approved tools if always allow was selected
      if (data.alwaysAllow) {
        session.approvedTools.add(approval.toolName);
      }

      // Execute the tool
      await this.executeApprovedTool(socket, session, approval);
    } else {
      // Tool was denied
      socket.emit('chat:tool_denied', {
        messageId: approval.messageId,
        toolName: approval.toolName,
        reason: 'User denied permission'
      });

      // Continue with response without this tool
      await this.continueResponseWithoutTool(socket, session, approval.messageId);
    }
  }

  private async generateEnhancedResponse(
    socket: AuthenticatedSocket, 
    session: EnhancedChatSession, 
    triggerMessageId: string
  ): Promise<void> {
    // Create assistant message
    const assistantDbMessage = await prisma.message.create({
      data: {
        role: 'ASSISTANT',
        content: '',
        sessionId: session.dbSessionId!,
        model: session.model
      }
    });

    const assistantMessage: EnhancedChatMessage = {
      id: assistantDbMessage.id,
      role: 'assistant',
      content: '',
      timestamp: assistantDbMessage.createdAt,
      toolCalls: [],
      model: session.model
    };

    // Add assistant message to session immediately so it can be found during tool approval
    session.messages.push(assistantMessage);
    session.context.messages.push(assistantMessage);

    // Start streaming
    socket.emit('chat:stream_start', { messageId: assistantMessage.id });

    // Build context with all conversation history and available tools
    const llmMessages = this.buildLLMContext(session);
    
    try {
      // Generate response with tool awareness
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

      // Handle tool calls with approval workflow
      if (response.toolCalls && response.toolCalls.length > 0) {
        await this.handleToolCallsWithApproval(socket, session, assistantMessage, response.toolCalls);
      } else {
        // No tool calls, complete the message
        await this.completeMessage(socket, session, assistantMessage);
      }

    } catch (error) {
      logger.error('Error generating enhanced response:', error);
      socket.emit('chat:error', {
        message: 'Failed to generate response',
        error: error instanceof Error ? error.message : 'Unknown error',
        messageId: assistantMessage.id
      });
    }
  }

  private async handleToolCallsWithApproval(
    socket: AuthenticatedSocket,
    session: EnhancedChatSession,
    assistantMessage: EnhancedChatMessage,
    toolCalls: MCPToolCall[]
  ): Promise<void> {
    for (const toolCall of toolCalls) {
      const toolExecutionStatus: MCPToolExecutionStatus = {
        id: uuidv4(),
        toolName: toolCall.name,
        status: 'pending',
        arguments: toolCall.arguments,
        startTime: new Date()
      };

      assistantMessage.toolCalls!.push(toolExecutionStatus);

      // Check if tool is already approved for this session
      if (session.approvedTools.has(toolCall.name)) {
        // Execute immediately
        await this.executeToolWithStatus(socket, session, assistantMessage.id, toolExecutionStatus);
      } else {
        // Request approval
        await this.requestToolApproval(socket, session, assistantMessage.id, toolCall, toolExecutionStatus);
      }
    }

    // If all tools were approved and executed, complete the message
    const allCompleted = assistantMessage.toolCalls!.every(tc => 
      tc.status === 'completed' || tc.status === 'error'
    );

    if (allCompleted) {
      await this.completeMessage(socket, session, assistantMessage);
    }
  }

  private async requestToolApproval(
    socket: AuthenticatedSocket,
    session: EnhancedChatSession,
    messageId: string,
    toolCall: MCPToolCall,
    toolStatus: MCPToolExecutionStatus
  ): Promise<void> {
    const approvalRequest: ToolApprovalRequest = {
      id: uuidv4(),
      messageId,
      toolName: toolCall.name,
      toolDescription: this.getToolDescription(toolCall.name),
      toolArguments: toolCall.arguments,
      timestamp: new Date()
    };

    // Store pending approval
    session.pendingApprovals.set(approvalRequest.id, approvalRequest);

    // Set timeout for approval (30 seconds)
    const timeout = setTimeout(() => {
      this.handleApprovalTimeout(socket, session, approvalRequest.id);
    }, 30000);
    
    this.toolApprovalTimeouts.set(approvalRequest.id, timeout);

    // Emit approval request
    socket.emit('tool:approval_required', approvalRequest);

    logger.info(`Tool approval requested for ${toolCall.name}`, {
      approvalId: approvalRequest.id,
      messageId,
      toolName: toolCall.name
    });
  }

  private async executeApprovedTool(
    socket: AuthenticatedSocket,
    session: EnhancedChatSession,
    approval: ToolApprovalRequest
  ): Promise<void> {
    // Find the tool status in the message
    logger.info(`🔍 [DEBUG] Looking for message ID: ${approval.messageId}`);
    logger.info(`🔍 [DEBUG] Session has ${session.messages.length} messages`);
    logger.info(`🔍 [DEBUG] Message IDs in session: ${session.messages.map(m => m.id)}`);
    
    const message = session.messages.find(m => m.id === approval.messageId);
    if (!message || !message.toolCalls) {
      logger.error('Could not find message or tool calls for approved tool', {
        messageId: approval.messageId,
        sessionMessageCount: session.messages.length,
        sessionMessageIds: session.messages.map(m => m.id),
        foundMessage: !!message,
        messageHasToolCalls: message?.toolCalls?.length || 0
      });
      return;
    }

    const toolStatus = message.toolCalls.find(tc => tc.toolName === approval.toolName);
    if (!toolStatus) {
      logger.error('Could not find tool status for approved tool');
      return;
    }

    await this.executeToolWithStatus(socket, session, approval.messageId, toolStatus);
  }

  private async executeToolWithStatus(
    socket: AuthenticatedSocket,
    session: EnhancedChatSession,
    messageId: string,
    toolStatus: MCPToolExecutionStatus
  ): Promise<void> {
    const operationKey = `tool:${toolStatus.toolName}`;
    
    // Check circuit breaker
    if (!this.errorRecovery.shouldAttemptOperation(operationKey)) {
      const error = `Tool ${toolStatus.toolName} is currently unavailable due to repeated failures`;
      toolStatus.status = 'error';
      toolStatus.error = error;
      
      socket.emit('chat:tool_error', {
        messageId,
        toolName: toolStatus.toolName,
        error
      });
      return;
    }

    try {
      // Update status to executing
      toolStatus.status = 'executing';
      toolStatus.startTime = new Date();

      socket.emit('chat:tool_start', {
        messageId,
        toolName: toolStatus.toolName,
        arguments: toolStatus.arguments
      });

      // Execute the tool with retry logic
      const result = await RetryManager.retry(async () => {
        const toolCall: MCPToolCall = {
          name: toolStatus.toolName,
          arguments: toolStatus.arguments
        };
        
        return await this.mcpClientManager.executeTool(toolCall);
      }, {
        maxRetries: 2,
        baseDelay: 1000
      });
      
      // Record success
      this.errorRecovery.recordSuccess(operationKey);
      
      // Update status with result
      toolStatus.status = result.isError ? 'error' : 'completed';
      toolStatus.result = result;
      toolStatus.endTime = new Date();
      toolStatus.executionTime = toolStatus.endTime.getTime() - toolStatus.startTime!.getTime();

      if (result.isError) {
        this.errorRecovery.recordFailure(operationKey);
        socket.emit('chat:tool_error', {
          messageId,
          toolName: toolStatus.toolName,
          error: result.content?.[0]?.text || 'Unknown error'
        });
      } else {
        socket.emit('chat:tool_complete', {
          messageId,
          toolName: toolStatus.toolName,
          result,
          executionTime: toolStatus.executionTime
        });
      }

      // Save to database
      await prisma.toolExecution.create({
        data: {
          messageId,
          toolName: toolStatus.toolName,
          arguments: JSON.stringify(toolStatus.arguments),
          result: JSON.stringify(result),
          status: result.isError ? ToolExecutionStatus.FAILED : ToolExecutionStatus.COMPLETED,
          error: result.isError ? result.content?.[0]?.text : undefined
        }
      });

    } catch (error) {
      const mcpError = handleError(error, `Tool execution: ${toolStatus.toolName}`);
      this.errorRecovery.recordFailure(operationKey);
      
      toolStatus.status = 'error';
      toolStatus.error = mcpError.message;
      toolStatus.endTime = new Date();

      socket.emit('chat:tool_error', {
        messageId,
        toolName: toolStatus.toolName,
        error: toolStatus.error,
        retryable: mcpError.retryable,
        retryCount: this.errorRecovery.getFailureCount(operationKey)
      });

      // Save error to database
      try {
        await prisma.toolExecution.create({
          data: {
            messageId,
            toolName: toolStatus.toolName,
            arguments: JSON.stringify(toolStatus.arguments),
            status: ToolExecutionStatus.FAILED,
            error: toolStatus.error
          }
        });
      } catch (dbError) {
        logger.error('Failed to save tool execution error to database:', dbError);
      }
    }
  }

  private async completeMessage(
    socket: AuthenticatedSocket,
    session: EnhancedChatSession,
    assistantMessage: EnhancedChatMessage
  ): Promise<void> {
    // Update message in database
    await prisma.message.update({
      where: { id: assistantMessage.id },
      data: { content: assistantMessage.content }
    });

    // Message was already added to session in generateEnhancedResponse, just update content
    const existingMessage = session.messages.find(m => m.id === assistantMessage.id);
    if (existingMessage) {
      existingMessage.content = assistantMessage.content;
      existingMessage.toolCalls = assistantMessage.toolCalls;
    }

    // Emit completion
    socket.emit('chat:stream_complete', {
      messageId: assistantMessage.id,
      message: assistantMessage
    });

    // Emit activity log if tools were used
    if (assistantMessage.toolCalls && assistantMessage.toolCalls.length > 0) {
      socket.emit('activity:log', {
        timestamp: assistantMessage.timestamp,
        operations: assistantMessage.toolCalls.map(tc => ({
          tool: tc.toolName,
          arguments: tc.arguments,
          success: tc.status === 'completed'
        }))
      });
    }
  }

  private handleApprovalTimeout(socket: AuthenticatedSocket, session: EnhancedChatSession, approvalId: string): void {
    const approval = session.pendingApprovals.get(approvalId);
    if (approval) {
      session.pendingApprovals.delete(approvalId);
      this.toolApprovalTimeouts.delete(approvalId);

      socket.emit('chat:tool_denied', {
        messageId: approval.messageId,
        toolName: approval.toolName,
        reason: 'Approval timeout'
      });

      logger.warn(`Tool approval timeout for ${approval.toolName}`, { approvalId });
    }
  }

  private async continueResponseWithoutTool(
    socket: AuthenticatedSocket,
    session: EnhancedChatSession,
    messageId: string
  ): Promise<void> {
    // Find the message and mark tool as denied
    const message = session.messages.find(m => m.id === messageId);
    if (message && message.toolCalls) {
      message.toolCalls.forEach(tc => {
        if (tc.status === 'pending') {
          tc.status = 'error';
          tc.error = 'User denied permission';
        }
      });
    }

    // Complete the message without the denied tool
    if (message) {
      await this.completeMessage(socket, session, message);
    }
  }

  private buildLLMContext(session: EnhancedChatSession): LLMMessage[] {
    return session.context.messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
  }

  private getToolDescription(toolName: string): string {
    const availableTools = this.mcpClientManager.getAvailableTools();
    const tool = availableTools.find(t => t.name === toolName);
    return tool?.description || 'No description available';
  }

  private async createSession(model: string, userId: string): Promise<EnhancedChatSession> {
    const llmService = new AnthropicService(model);
    
    // Set available tools with enhanced system prompt
    const mcpTools = this.mcpClientManager.getAvailableTools();
    const allAvailableTools = {
      mcp: mcpTools,
      web: [] // No web tools in enhanced version for now
    };
    llmService.setAvailableTools(allAvailableTools);

    // The system prompt is now automatically built with tool context in the LLM service
    
    // Create database session
    const dbSession = await prisma.chatSession.create({
      data: {
        userId,
        model,
        contextLimit: this.getContextLimit(model),
        title: 'New Chat'
      }
    });

    logger.info('Created enhanced chat session with tool context', {
      sessionId: dbSession.id,
      model,
      mcpToolCount: mcpTools.length,
      userId
    });
    
    return {
      messages: [],
      model,
      llmService,
      dbSessionId: dbSession.id,
      context: {
        messages: [],
        toolExecutions: [],
        approvedTools: new Set(),
        sessionStartTime: new Date()
      },
      pendingApprovals: new Map(),
      approvedTools: new Set()
    };
  }

  private getContextLimit(model: string): number {
    if (model.startsWith('claude-')) return 200000;
    return 4000; // default
  }

  cleanup(socketId: string): void {
    const session = this.sessions.get(socketId);
    if (session) {
      // Clear any pending approval timeouts
      session.pendingApprovals.forEach((_, approvalId) => {
        const timeout = this.toolApprovalTimeouts.get(approvalId);
        if (timeout) {
          clearTimeout(timeout);
          this.toolApprovalTimeouts.delete(approvalId);
        }
      });
    }
    this.sessions.delete(socketId);
  }
}