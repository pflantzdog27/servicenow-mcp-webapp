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
import { ConversationFlowValidator } from '../validators/conversation-flow-validator';

const logger = createLogger();
const prisma = new PrismaClient();

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolInvocations?: any[];
  timestamp: Date;
}

interface CreatedItem {
  type: string; // 'catalog_item', 'ui_policy', 'incident', etc.
  sys_id: string;
  name: string;
  created_at: Date;
}

interface WorkflowStep {
  step: string;
  completed: boolean;
  result?: any;
}

type UserIntent = 'create' | 'query' | 'update' | 'delete' | 'reference_existing' | null;

interface ConversationContext {
  messages: Message[];
  lastToolUse: Date | null;
  serviceNowContext: {
    recentRecords: string[];
    currentWorkflow: string | null;
    createdItems: CreatedItem[];
    lastIntent: UserIntent;
    workflowSteps: WorkflowStep[];
  };
  dbSessionId?: string;
}

export class ContextAwareMessageHandler {
  private conversationHistory: Map<string, ConversationContext> = new Map();
  private streamHandler: EnhancedStreamHandler;
  private resultFormatter: ResultFormatter;
  private enhancedToolExecutor: EnhancedToolExecutor;
  private chatService: ChatService;
  private flowValidator: ConversationFlowValidator;
  
  constructor(
    private mcpClientManager: MCPClientManager,
    private instanceUrl: string = process.env.SERVICENOW_INSTANCE_URL || ''
  ) {
    this.streamHandler = new EnhancedStreamHandler(mcpClientManager);
    this.resultFormatter = new ResultFormatter(this.instanceUrl);
    this.enhancedToolExecutor = new EnhancedToolExecutor(mcpClientManager);
    this.chatService = new ChatService();
    this.flowValidator = new ConversationFlowValidator();
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
        
        // Load conversation context from database if it exists
        await this.loadConversationContext(dbSessionId, context);
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
      const userIntent = this.distinguishIntent(message, context);
      context.serviceNowContext.lastIntent = userIntent;
      const needsTools = this.analyzeMessageIntent(message, context);
      logger.info(`Intent analysis: userIntent=${userIntent}, needsTools=${needsTools}`);
      
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
          web: allTools.filter(t => t.type === 'web').map(t => ({ 
            ...t, 
            description: t.description || 'No description available',
            type: 'web' as const 
          }))
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
        
        // Validate tool selection before execution
        const validation = this.flowValidator.validateToolSelection(
          response.toolCalls.map(tc => ({ name: tc.name, arguments: tc.arguments })),
          context,
          message
        );
        
        if (!validation.valid) {
          logger.warn('⚠️ Tool selection validation failed:', validation);
          // Log the validation issue but continue - let the LLM decide
          socket.emit('chat:warning', {
            messageId: assistantDbMessage.id,
            warning: validation.suggestion
          });
        }
        
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
            
            // Persist updated context to database
            await this.persistConversationContext(dbSessionId, context);
            
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
          currentWorkflow: null,
          createdItems: [],
          lastIntent: null,
          workflowSteps: []
        }
      });
    }
    return this.conversationHistory.get(userId)!;
  }
  
  private distinguishIntent(message: string, context: ConversationContext): UserIntent {
    const lowercaseMessage = message.toLowerCase();
    
    // Query patterns - looking for existing items
    const queryPatterns = [
      /find (the )?(existing|current|my|all)/i,
      /search for .* (created|existing)/i,
      /query (the )?(catalog|items|records)/i,
      /what .* (created|have|exist)/i,
      /show me (the )?(existing|current|all)/i,
      /list (all )?(the )?/i,
      /get (all )?(the )?existing/i,
      /look for/i,
      /check (the )?existing/i
    ];
    
    // Create patterns - explicitly creating new items
    const createPatterns = [
      /create (a )?(new|another)/i,
      /add (a )?(new)/i,
      /make (a )?(new)/i,
      /set up (a )?(new)/i,
      /generate (a )?(new)/i,
      /build (a )?(new)/i
    ];
    
    // Reference patterns - referring to recently created items
    const referencePatterns = [
      /\b(this|that|it|the) (item|catalog|incident|request|record)/i,
      /\bthe one (we |I )?(just )?(created|made)/i,
      /\b(does|is) (this|that|it)/i,
      /\bfor (this|that|it)/i
    ];
    
    // Update patterns
    const updatePatterns = [
      /update/i,
      /modify/i,
      /change/i,
      /edit/i,
      /set .* to/i
    ];
    
    // Delete patterns
    const deletePatterns = [
      /delete/i,
      /remove/i,
      /cancel/i,
      /deactivate/i
    ];
    
    // Check for reference to recent items first
    if (referencePatterns.some(p => p.test(message)) && context.serviceNowContext.createdItems.length > 0) {
      // User is referring to something recently created
      return 'reference_existing';
    }
    
    // Check explicit patterns
    if (queryPatterns.some(p => p.test(message))) {
      return 'query';
    }
    
    if (createPatterns.some(p => p.test(message))) {
      return 'create';
    }
    
    if (updatePatterns.some(p => p.test(message))) {
      return 'update';
    }
    
    if (deletePatterns.some(p => p.test(message))) {
      return 'delete';
    }
    
    // Default heuristics based on keywords
    if (lowercaseMessage.includes('create') && !lowercaseMessage.includes('created')) {
      return 'create';
    }
    
    if (lowercaseMessage.includes('find') || lowercaseMessage.includes('search') || 
        lowercaseMessage.includes('query') || lowercaseMessage.includes('get')) {
      return 'query';
    }
    
    return null;
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
    
    // Track created items based on tool name and result
    if (toolName.includes('create') && !result.isError) {
      let createdItem: CreatedItem | null = null;
      
      // Parse the result to extract sys_id and name
      try {
        // Check for sys_id in the result
        const sysIdMatch = content.match(/sys_id['":\s]+([a-f0-9]{32})/i);
        const nameMatch = content.match(/(?:name|title|short_description)['":\s]+([^"',\n]+)/i);
        
        if (sysIdMatch) {
          const itemType = this.determineItemType(toolName);
          createdItem = {
            type: itemType,
            sys_id: sysIdMatch[1],
            name: nameMatch?.[1] || `${itemType} ${sysIdMatch[1].substring(0, 8)}`,
            created_at: new Date()
          };
        }
        
        // Special handling for catalog items
        if (toolName === 'servicenow-mcp:create-catalog-item' || toolName.includes('catalog')) {
          const catalogMatch = content.match(/catalog item['":\s]*([^"',\n]+)/i);
          if (catalogMatch && sysIdMatch) {
            createdItem = {
              type: 'catalog_item',
              sys_id: sysIdMatch[1],
              name: catalogMatch[1],
              created_at: new Date()
            };
          }
        }
        
        // Add to created items list
        if (createdItem) {
          context.serviceNowContext.createdItems.push(createdItem);
          // Keep only the last 10 created items
          context.serviceNowContext.createdItems = 
            context.serviceNowContext.createdItems.slice(-10);
          
          logger.info('📝 Tracked created item:', createdItem);
        }
      } catch (error) {
        logger.error('Error parsing created item result:', error);
      }
    }
    
    // Track workflow context
    if (toolName.includes('workflow') || toolName.includes('approval')) {
      const workflowMatch = content.match(/workflow['":\s]*([^",\n]+)/i);
      if (workflowMatch) {
        context.serviceNowContext.currentWorkflow = workflowMatch[1];
      }
    }
    
    // Track workflow steps
    if (context.serviceNowContext.currentWorkflow) {
      const stepCompleted: WorkflowStep = {
        step: toolName,
        completed: !result.isError,
        result: result.isError ? result.error : 'Success'
      };
      context.serviceNowContext.workflowSteps.push(stepCompleted);
    }
  }
  
  private determineItemType(toolName: string): string {
    const toolTypeMap: Record<string, string> = {
      'create-catalog-item': 'catalog_item',
      'create-incident': 'incident',
      'create-problem': 'problem',
      'create-change': 'change_request',
      'create-request': 'request',
      'create-ui-policy': 'ui_policy',
      'create-variable': 'catalog_variable',
      'create-workflow': 'workflow',
      'create-user': 'user',
      'create-group': 'group'
    };
    
    for (const [key, type] of Object.entries(toolTypeMap)) {
      if (toolName.includes(key)) {
        return type;
      }
    }
    
    return 'record';
  }
  
  private async persistConversationContext(sessionId: string, context: ConversationContext): Promise<void> {
    try {
      // Get current session metadata
      const session = await prisma.chatSession.findUnique({
        where: { id: sessionId },
        select: { metadata: true }
      });
      
      const existingMetadata = (session?.metadata as any) || {};
      
      // Update with conversation context
      const updatedMetadata = {
        ...existingMetadata,
        conversationContext: {
          createdItems: context.serviceNowContext.createdItems,
          lastIntent: context.serviceNowContext.lastIntent,
          workflowSteps: context.serviceNowContext.workflowSteps,
          currentWorkflow: context.serviceNowContext.currentWorkflow,
          recentRecords: context.serviceNowContext.recentRecords
        }
      };
      
      await prisma.chatSession.update({
        where: { id: sessionId },
        data: { metadata: updatedMetadata }
      });
      
      logger.info('💾 Persisted conversation context to database', {
        sessionId,
        createdItemsCount: context.serviceNowContext.createdItems.length
      });
    } catch (error) {
      logger.error('Failed to persist conversation context:', error);
      // Don't throw - this is a non-critical operation
    }
  }
  
  private async loadConversationContext(sessionId: string, context: ConversationContext): Promise<void> {
    try {
      const session = await prisma.chatSession.findUnique({
        where: { id: sessionId },
        select: { metadata: true }
      });
      
      if (session?.metadata) {
        const metadata = session.metadata as any;
        if (metadata.conversationContext) {
          // Restore conversation context from database
          const savedContext = metadata.conversationContext;
          
          if (savedContext.createdItems) {
            context.serviceNowContext.createdItems = savedContext.createdItems.map((item: any) => ({
              ...item,
              created_at: new Date(item.created_at) // Convert string back to Date
            }));
          }
          
          if (savedContext.lastIntent) {
            context.serviceNowContext.lastIntent = savedContext.lastIntent;
          }
          
          if (savedContext.workflowSteps) {
            context.serviceNowContext.workflowSteps = savedContext.workflowSteps;
          }
          
          if (savedContext.currentWorkflow) {
            context.serviceNowContext.currentWorkflow = savedContext.currentWorkflow;
          }
          
          if (savedContext.recentRecords) {
            context.serviceNowContext.recentRecords = savedContext.recentRecords;
          }
          
          logger.info('📂 Loaded conversation context from database', {
            sessionId,
            createdItemsCount: context.serviceNowContext.createdItems.length
          });
        }
      }
    } catch (error) {
      logger.error('Failed to load conversation context:', error);
      // Don't throw - this is a non-critical operation
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