import { LLMService, LLMMessage } from '../llm/llm-interface';
import { MCPClientManager } from '../mcp/mcp-client';
import { buildSystemPrompt } from '../llm/system-prompt';
import { EnhancedStreamHandler } from '../websocket/enhanced-stream-handler';
import { ResultFormatter } from '../utils/result-formatter';
import { AuthenticatedSocket } from '../middleware/socketAuth';
import { createLogger } from '../utils/logger';

const logger = createLogger();

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
}

export class ContextAwareMessageHandler {
  private conversationHistory: Map<string, ConversationContext> = new Map();
  private streamHandler: EnhancedStreamHandler;
  private resultFormatter: ResultFormatter;
  
  constructor(
    private mcpClientManager: MCPClientManager,
    private instanceUrl: string = process.env.SERVICENOW_INSTANCE_URL || ''
  ) {
    this.streamHandler = new EnhancedStreamHandler(mcpClientManager);
    this.resultFormatter = new ResultFormatter(this.instanceUrl);
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
      
      // Add user message to context
      const userMessage: Message = {
        role: 'user',
        content: message,
        timestamp: new Date()
      };
      context.messages.push(userMessage);
      
      // Analyze message intent
      const needsTools = this.analyzeMessageIntent(message, context);
      logger.info(`Intent analysis: needsTools=${needsTools}`);
      
      // Build conversation messages for LLM
      const llmMessages = this.buildLLMMessages(context, needsTools);
      
      // Configure LLM service
      if (needsTools) {
        llmService.setAvailableTools(this.mcpClientManager.getAvailableTools());
      }
      
      // Generate streaming response
      const response = await llmService.generateResponse(
        llmMessages,
        (chunk) => {
          // Stream text chunks to client
          if (chunk.type === 'text') {
            socket.emit('chat:stream', {
              messageId,
              type: 'text',
              content: chunk.content
            });
          }
        }
      );
      
      logger.info('LLM response received:', { hasToolCalls: !!response.toolCalls?.length });
      
      // Handle tool calls if present
      let finalContent = response.message;
      const toolInvocations: any[] = [];
      
      if (response.toolCalls && response.toolCalls.length > 0) {
        for (const toolCall of response.toolCalls) {
          try {
            logger.info(`Executing tool: ${toolCall.name}`, { arguments: toolCall.arguments });
            
            // Notify client of tool start
            socket.emit('chat:tool_start', {
              messageId,
              toolName: toolCall.name,
              arguments: toolCall.arguments
            });
            
            // Execute the tool
            const toolResult = await this.mcpClientManager.executeTool(toolCall);
            
            // Format the result for user display
            const formattedResult = this.resultFormatter.formatToolResult(
              toolCall.name, 
              toolResult
            );
            
            // Update conversation context with ServiceNow data
            this.updateServiceNowContext(context, toolCall.name, toolResult);
            
            // Add formatted result to message content
            finalContent += `\n\n${formattedResult}`;
            
            // Add to tool invocations for context
            toolInvocations.push({
              name: toolCall.name,
              arguments: toolCall.arguments,
              result: toolResult,
              formattedResult
            });
            
            // Stream the formatted result
            socket.emit('chat:stream', {
              messageId,
              type: 'tool_result',
              content: `\n\n${formattedResult}`
            });
            
            // Notify client of tool completion
            socket.emit('chat:tool_result', {
              messageId,
              toolName: toolCall.name,
              result: toolResult,
              success: !toolResult.isError
            });
            
            logger.info(`Tool execution completed: ${toolCall.name}`, { success: !toolResult.isError });
            
          } catch (error) {
            logger.error(`Tool execution failed: ${toolCall.name}`, error);
            
            const errorMessage = `❌ ${toolCall.name} failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
            finalContent += `\n\n${errorMessage}`;
            
            socket.emit('chat:stream', {
              messageId,
              type: 'tool_result', 
              content: `\n\n${errorMessage}`
            });
            
            socket.emit('chat:tool_result', {
              messageId,
              toolName: toolCall.name,
              result: { error: error instanceof Error ? error.message : 'Unknown error' },
              success: false
            });
          }
        }
        
        context.lastToolUse = new Date();
      }
      
      // Add assistant message to context
      const assistantMessage: Message = {
        role: 'assistant',
        content: finalContent,
        toolInvocations,
        timestamp: new Date()
      };
      context.messages.push(assistantMessage);
      
      // Complete the stream
      socket.emit('chat:stream_complete', {
        messageId,
        message: {
          id: messageId,
          role: 'assistant',
          content: finalContent,
          timestamp: new Date(),
          toolCalls: toolInvocations.map(inv => ({
            name: inv.name,
            arguments: inv.arguments,
            status: 'completed',
            result: inv.result
          })),
          model
        }
      });
      
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
    
    // Check for operation keywords
    const hasOperationKeyword = operationKeywords.some(
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
    
    // Conversational patterns that DON'T need tools
    const conversationalPatterns = [
      /^(hi|hello|hey|thanks|thank you|okay|ok|yes|no|good|great|awesome)[\s!.]*$/i,
      /what (is|are) .* in servicenow/i,
      /how (do|does) .* work/i,
      /explain .*/i,
      /tell me about .*/i
    ];
    
    const isConversational = conversationalPatterns.some(pattern => pattern.test(message));
    
    // Decision logic
    if (isConversational && !hasOperationKeyword && !hasRecordReference) {
      return false; // Pure conversational, no tools needed
    }
    
    return hasOperationKeyword || hasRecordReference || hasSysId || 
           hasRecentToolUse || hasServiceNowContext;
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
  
  cleanup(userId: string): void {
    this.conversationHistory.delete(userId);
    logger.info(`Cleaned up conversation history for user: ${userId}`);
  }
}