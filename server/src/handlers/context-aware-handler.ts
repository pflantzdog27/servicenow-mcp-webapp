import { LLMService, LLMMessage } from '../llm/llm-interface';
import { MCPClientManager } from '../mcp/mcp-client';
import { EnhancedToolExecutor } from '../mcp/enhanced-tool-executor';
import { buildSystemPrompt } from '../llm/system-prompt';
import { EnhancedStreamHandler } from '../websocket/enhanced-stream-handler';
import { ResultFormatter } from '../utils/result-formatter';
import { AuthenticatedSocket } from '../middleware/socketAuth';
import { createLogger } from '../utils/logger';
import { PrismaClient, ToolExecutionStatus } from '@prisma/client';
import { ChatService } from '../services/chat';

const logger = createLogger();
const prisma = new PrismaClient();

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolInvocations?: any[];
  timestamp: Date;
}

interface ConversationContext {
  messages: Message[];
  lastToolUse: Date | null;
  serviceNowContext: {
    recentRecords: string[];
    currentWorkflow: string | null;
  };
  dbSessionId?: string;
}

export class ContextAwareMessageHandler {
  private conversationHistory: Map<string, ConversationContext> = new Map();
  private streamHandler: EnhancedStreamHandler;
  private resultFormatter: ResultFormatter;
  private enhancedToolExecutor: EnhancedToolExecutor;
  private chatService: ChatService;
  
  constructor(
    private mcpClientManager: MCPClientManager,
    private instanceUrl: string = process.env.SERVICENOW_INSTANCE_URL || ''
  ) {
    this.streamHandler = new EnhancedStreamHandler(mcpClientManager);
    this.resultFormatter = new ResultFormatter(this.instanceUrl);
    this.enhancedToolExecutor = new EnhancedToolExecutor(mcpClientManager);
    this.chatService = new ChatService();
  }

  async processMessage(
    socket: AuthenticatedSocket,
    messageId: string,
    message: string,
    llmService: LLMService,
    model: string
  ): Promise<void> {
    const userId = socket.user!.userId;
    
    try {
      logger.info(`Processing message for user ${userId}:`, { message, model });
      
      // Get or create conversation context
      const context = this.getOrCreateContext(userId);
      
      // Get or create database session
      let dbSessionId = context.dbSessionId;
      if (!dbSessionId) {
        const dbSession = await prisma.chatSession.create({
          data: {
            userId,
            model,
            contextLimit: this.getContextLimit(model),
            title: 'New Chat'
          }
        });
        dbSessionId = dbSession.id;
        context.dbSessionId = dbSessionId;
      }
      
      // Create user message in database
      const userDbMessage = await prisma.message.create({
        data: {
          role: 'USER',
          content: message,
          sessionId: dbSessionId,
          model: model
        }
      });
      
      // Add user message to context
      const userMessage: Message = {
        role: 'user',
        content: message,
        timestamp: userDbMessage.createdAt
      };
      context.messages.push(userMessage);
      
      // Auto-generate session title from first message if needed
      if (context.messages.length === 1) {
        await this.chatService.updateSessionTitle(dbSessionId, userId, '');
      }
      
      // Analyze message intent
      const needsTools = this.analyzeMessageIntent(message, context);
      logger.info(`Intent analysis: needsTools=${needsTools}`);
      
      // Build conversation messages for LLM
      const llmMessages = this.buildLLMMessages(context, needsTools);
      
      // Configure LLM service with all available tools
      if (needsTools) {
        logger.info('🔧 Configuring LLM with tools...');
        const allTools = this.enhancedToolExecutor.getAllAvailableTools();
        logger.info('📚 Available tools from enhanced executor:', { 
          totalTools: allTools.length,
          toolNames: allTools.map(t => t.name),
          toolTypes: allTools.map(t => t.type)
        });
        
        const toolsForLLM = {
          mcp: allTools.filter(t => t.type === 'mcp').map(t => ({ ...t, type: undefined })),
          web: allTools.filter(t => t.type === 'web')
        };
        
        logger.info('🎯 Tools configured for LLM:', {
          mcpToolCount: toolsForLLM.mcp.length,
          webToolCount: toolsForLLM.web.length,
          mcpToolNames: toolsForLLM.mcp.map(t => t.name)
        });
        
        llmService.setAvailableTools(toolsForLLM);
      } else {
        logger.info('🚫 No tools needed for this message');
      }
      
      // Create assistant message in database
      const assistantDbMessage = await prisma.message.create({
        data: {
          role: 'ASSISTANT',
          content: '',
          sessionId: dbSessionId,
          model: model
        }
      });

      // Start streaming response
      socket.emit('chat:stream_start', { messageId: assistantDbMessage.id });

      // Generate streaming response
      const response = await llmService.generateResponse(
        llmMessages,
        (chunk) => {
          // Stream text chunks to client
          if (chunk.type === 'text') {
            socket.emit('chat:text_stream', {
              messageId: assistantDbMessage.id,
              chunk: chunk.content
            });
          }
        }
      );
      
      logger.info('🤖 LLM response received:', { 
        hasToolCalls: !!response.toolCalls?.length,
        toolCallsCount: response.toolCalls?.length || 0,
        messageLength: response.message?.length || 0,
        fullResponse: JSON.stringify(response, null, 2)
      });
      
      // Handle tool calls if present
      let finalContent = response.message;
      const toolInvocations: any[] = [];
      
      if (response.toolCalls && response.toolCalls.length > 0) {
        logger.info(`🔧 Processing ${response.toolCalls.length} tool calls:`, response.toolCalls.map(t => t.name));
        
        for (const toolCall of response.toolCalls) {
          let toolExecution;
          let executionStartTime: number;
          try {
            logger.info(`🚀 Starting tool execution: ${toolCall.name}`, { arguments: toolCall.arguments });
            
            // Emit tool start event for UI
            socket.emit('chat:tool_start', {
              messageId: assistantDbMessage.id,
              toolName: toolCall.name,
              arguments: toolCall.arguments
            });
            logger.info(`Executing tool: ${toolCall.name}`, { arguments: toolCall.arguments });
            
            // Record execution start time
            executionStartTime = Date.now();
            
            // Create tool execution record
            toolExecution = await prisma.toolExecution.create({
              data: {
                messageId: assistantDbMessage.id,
                toolName: toolCall.name,
                arguments: JSON.stringify(toolCall.arguments),
                status: ToolExecutionStatus.EXECUTING
              }
            });

            // Notify client of tool start
            socket.emit('chat:tool_start', {
              messageId: assistantDbMessage.id,
              toolName: toolCall.name,
              arguments: toolCall.arguments
            });
            
            // Execute the tool using enhanced executor
            const enhancedToolCall = {
              id: toolCall.id || Date.now().toString(),
              name: toolCall.name,
              arguments: toolCall.arguments,
              type: this.enhancedToolExecutor.getToolType(toolCall.name)
            };
            const toolResult = await this.enhancedToolExecutor.executeTool(enhancedToolCall);
            
            // Calculate execution time
            const executionTime = Date.now() - executionStartTime!;
            
            // Format the result for user display
            const formattedResult = this.resultFormatter.formatToolResult(
              toolCall.name, 
              toolResult
            );
            
            // Update conversation context with ServiceNow data
            this.updateServiceNowContext(context, toolCall.name, toolResult);
            
            // Add to tool invocations for context (but don't add to finalContent to avoid duplication)
            toolInvocations.push({
              name: toolCall.name,
              arguments: toolCall.arguments,
              result: toolResult,
              formattedResult,
              executionTime
            });
            
            // Update tool execution with result
            await prisma.toolExecution.update({
              where: { id: toolExecution.id },
              data: {
                result: JSON.stringify(toolResult),
                status: toolResult.isError ? ToolExecutionStatus.FAILED : ToolExecutionStatus.COMPLETED,
                executionTime
              }
            });

            logger.info(`✅ Tool execution completed: ${toolCall.name}`, { 
              success: !toolResult.isError, 
              executionTime,
              resultType: typeof toolResult 
            });

            // Emit proper tool completion event for UI
            socket.emit('chat:tool_complete', {
              messageId: assistantDbMessage.id,
              toolName: toolCall.name,
              arguments: toolCall.arguments,
              result: toolResult,
              executionTime,
              status: toolResult.isError ? 'error' : 'completed'
            });
            
            // Store for final message composition
            toolInvocations.push({
              name: toolCall.name,
              arguments: toolCall.arguments,
              result: toolResult,
              executionTime,
              status: toolResult.isError ? 'error' : 'completed'
            });
            
          } catch (error) {
            logger.error(`❌ Tool execution failed: ${toolCall.name}`, error);
            
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
            
            // Emit tool error event for UI
            socket.emit('chat:tool_error', {
              messageId: assistantDbMessage.id,
              toolName: toolCall.name,
              arguments: toolCall.arguments,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
            
            // Store error for final message composition
            toolInvocations.push({
              name: toolCall.name,
              arguments: toolCall.arguments,
              result: { isError: true, content: error instanceof Error ? error.message : 'Unknown error' },
              status: 'error'
            });
            
            socket.emit('chat:tool_result', {
              messageId: assistantDbMessage.id,
              toolName: toolCall.name,
              result: { error: error instanceof Error ? error.message : 'Unknown error' },
              success: false
            });
          }
        }
        
        context.lastToolUse = new Date();
      }
      
      // Update assistant message content in database
      await prisma.message.update({
        where: { id: assistantDbMessage.id },
        data: {
          content: finalContent
        }
      });

      // Add assistant message to context
      const assistantMessage: Message = {
        role: 'assistant',
        content: finalContent,
        toolInvocations,
        timestamp: assistantDbMessage.createdAt
      };
      context.messages.push(assistantMessage);
      
      // Complete the stream
      socket.emit('chat:stream_complete', {
        messageId: assistantDbMessage.id,
        message: {
          id: assistantDbMessage.id,
          role: 'assistant',
          content: finalContent,
          timestamp: assistantDbMessage.createdAt,
          toolCalls: toolInvocations.map(inv => ({
            name: inv.name,
            arguments: inv.arguments,
            status: 'completed',
            result: inv.result,
            executionTime: inv.executionTime
          })),
          model
        }
      });
      
      // Emit activity log
      if (toolInvocations.length > 0) {
        socket.emit('activity:log', {
          timestamp: assistantDbMessage.createdAt,
          operations: toolInvocations.map(inv => ({
            tool: inv.name,
            arguments: inv.arguments,
            success: !inv.result.isError
          }))
        });
      }

      // Trim conversation history to prevent context overflow
      this.trimConversationHistory(context);
      
      logger.info(`Message processing completed for user ${userId}`);
      
    } catch (error) {
      logger.error('Error processing message:', error);
      socket.emit('chat:error', {
        messageId,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    }
  }
  
  private getOrCreateContext(userId: string): ConversationContext {
    if (!this.conversationHistory.has(userId)) {
      this.conversationHistory.set(userId, {
        messages: [],
        lastToolUse: null,
        serviceNowContext: {
          recentRecords: [],
          currentWorkflow: null
        }
      });
    }
    return this.conversationHistory.get(userId)!;
  }
  
  private analyzeMessageIntent(message: string, context: ConversationContext): boolean {
    const lowercaseMessage = message.toLowerCase();
    
    // ServiceNow operation keywords
    const operationKeywords = [
      'create', 'update', 'delete', 'query', 'find', 'search', 'get', 'show',
      'incident', 'problem', 'change', 'catalog', 'request', 'approval',
      'assign', 'close', 'resolve', 'approve', 'reject', 'escalate',
      'workflow', 'business rule', 'script', 'form', 'field', 'table',
      'user', 'group', 'role', 'permission', 'access'
    ];
    
    // Web search keywords that suggest need for web tools
    const webSearchKeywords = [
      'documentation', 'docs', 'best practice', 'example', 'tutorial',
      'how to', 'guide', 'error', 'issue', 'problem solving', 'solution',
      'troubleshoot', 'fix', 'latest', 'new', 'update', 'release',
      'community', 'forum', 'discussion', 'reference', 'api reference'
    ];
    
    // URL patterns that suggest web fetch
    const hasUrl = /https?:\/\/[^\s]+/i.test(message);
    
    // Check for operation keywords
    const hasOperationKeyword = operationKeywords.some(
      keyword => lowercaseMessage.includes(keyword)
    );
    
    // Check for web search keywords
    const hasWebSearchKeyword = webSearchKeywords.some(
      keyword => lowercaseMessage.includes(keyword)
    );
    
    // Check for ServiceNow record references (INC0000123, PRB0000456, etc.)
    const hasRecordReference = /\b(INC|PRB|CHG|RITM|REQ|TASK|STASK)\d+\b/i.test(message);
    
    // Check for sys_id patterns
    const hasSysId = /\b[a-f0-9]{32}\b/i.test(message);
    
    // Check conversation context - recent tool use suggests continuing ServiceNow operations
    const hasRecentToolUse = context.lastToolUse && 
      (new Date().getTime() - context.lastToolUse.getTime()) < 5 * 60 * 1000; // 5 minutes
    
    // Check if user is asking about specific ServiceNow records
    const hasServiceNowContext = context.serviceNowContext.recentRecords.length > 0 &&
      (lowercaseMessage.includes('this') || lowercaseMessage.includes('that') || 
       lowercaseMessage.includes('it') || lowercaseMessage.includes('the'));
    
    // Conversational patterns that DON'T need tools (but exclude web search requests)
    const conversationalPatterns = [
      /^(hi|hello|hey|thanks|thank you|okay|ok|yes|no|good|great|awesome)[\s!.]*$/i
    ];
    
    const isConversational = conversationalPatterns.some(pattern => pattern.test(message));
    
    // Decision logic
    if (isConversational && !hasOperationKeyword && !hasRecordReference && !hasWebSearchKeyword && !hasUrl) {
      return false; // Pure conversational, no tools needed
    }
    
    return hasOperationKeyword || hasRecordReference || hasSysId || 
           hasRecentToolUse || hasServiceNowContext || hasWebSearchKeyword || hasUrl;
  }
  
  private buildLLMMessages(context: ConversationContext, needsTools: boolean): LLMMessage[] {
    const messages: LLMMessage[] = [];
    
    // Add system prompt
    const systemPrompt = buildSystemPrompt({
      instanceUrl: this.instanceUrl,
      userTimezone: 'UTC' // TODO: Get from user preferences
    });
    
    // Enhance system prompt with context
    let enhancedSystemPrompt = systemPrompt;
    
    if (context.serviceNowContext.recentRecords.length > 0) {
      enhancedSystemPrompt += `\n\n## Recent Context\nRecently accessed records: ${context.serviceNowContext.recentRecords.join(', ')}`;
    }
    
    if (context.serviceNowContext.currentWorkflow) {
      enhancedSystemPrompt += `\nCurrent workflow context: ${context.serviceNowContext.currentWorkflow}`;
    }
    
    if (!needsTools) {
      enhancedSystemPrompt += `\n\nIMPORTANT: This appears to be a conversational message. Respond naturally without using any tools.`;
    }
    
    messages.push({
      role: 'system',
      content: enhancedSystemPrompt
    });
    
    // Add conversation history (last 10 messages to stay within context limits)
    const recentMessages = context.messages.slice(-10);
    for (const msg of recentMessages) {
      messages.push({
        role: msg.role,
        content: msg.content
      });
    }
    
    return messages;
  }
  
  private updateServiceNowContext(
    context: ConversationContext, 
    toolName: string, 
    result: any
  ): void {
    // Extract record identifiers from tool results
    const content = typeof result.content?.[0]?.text === 'string' 
      ? result.content[0].text 
      : JSON.stringify(result);
    
    // Look for record numbers
    const recordMatches = content.match(/\b(INC|PRB|CHG|RITM|REQ|TASK|STASK)\d+\b/gi);
    if (recordMatches) {
      context.serviceNowContext.recentRecords.push(...recordMatches);
      // Keep only the last 5 records
      context.serviceNowContext.recentRecords = 
        context.serviceNowContext.recentRecords.slice(-5);
    }
    
    // Track workflow context
    if (toolName.includes('workflow') || toolName.includes('approval')) {
      const workflowMatch = content.match(/workflow['":\s]*([^",\n]+)/i);
      if (workflowMatch) {
        context.serviceNowContext.currentWorkflow = workflowMatch[1];
      }
    }
  }
  
  private trimConversationHistory(context: ConversationContext): void {
    // Keep only the last 20 messages to prevent context overflow
    if (context.messages.length > 20) {
      // Keep the first system message if present, then the last 19
      const systemMessages = context.messages.filter(m => m.role === 'system');
      const nonSystemMessages = context.messages.filter(m => m.role !== 'system').slice(-19);
      context.messages = [...systemMessages.slice(0, 1), ...nonSystemMessages];
    }
  }
  
  private getContextLimit(model: string): number {
    if (model.startsWith('gpt-4o')) return 128000;
    if (model.startsWith('gpt-4')) return 8000;
    if (model.startsWith('gpt-3.5')) return 4000;
    if (model.startsWith('o1-')) return 128000;
    if (model.startsWith('claude-')) return 200000;
    return 4000; // default
  }

  cleanup(userId: string): void {
    this.conversationHistory.delete(userId);
    logger.info(`Cleaned up conversation history for user: ${userId}`);
  }
}