import Anthropic from '@anthropic-ai/sdk';
import { LLMService, LLMMessage, LLMResponse, LLMStreamChunk } from './llm-interface';
import { createLogger } from '../utils/logger';

const logger = createLogger();

export class AnthropicService extends LLMService {
  private client: Anthropic;
  private model: string;

  constructor(model: string = 'claude-3-5-sonnet-20241022') {
    super();
    this.model = model;
    
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }
    
    logger.info(`Initializing Anthropic client for model: ${model}`);
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    
    logger.info(`Anthropic client initialized successfully`);
  }

  async generateResponse(
    messages: LLMMessage[],
    onStream?: (chunk: LLMStreamChunk) => void
  ): Promise<LLMResponse> {
    try {
      // Extract system message from conversation or use default
      const systemMessages = messages.filter(msg => msg.role === 'system');
      const systemMessage = systemMessages.length > 0 
        ? systemMessages[systemMessages.length - 1].content  // Use the last system message
        : this.formatSystemMessage();
      
      // Filter out system messages from the messages array (Anthropic handles system separately)
      const userMessages = messages.filter(msg => msg.role !== 'system');
      
      // Log the request for debugging
      logger.info('Creating Anthropic message stream:', {
        model: this.model,
        messageCount: userMessages.length,
        systemMessageLength: systemMessage.length,
        hasTools: this.availableTools.length > 0
      });

      const stream = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096, // More reasonable limit
        temperature: 0.7,
        system: systemMessage,
        messages: userMessages.map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content
        })),
        stream: true,
      });

      let fullContent = '';
      let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          fullContent += chunk.delta.text;
          onStream?.({
            type: 'text',
            content: chunk.delta.text
          });
        }

        if (chunk.type === 'message_delta' && chunk.usage) {
          usage = {
            promptTokens: chunk.usage.input_tokens || 0,
            completionTokens: chunk.usage.output_tokens || 0,
            totalTokens: (chunk.usage.input_tokens || 0) + (chunk.usage.output_tokens || 0)
          };
        }
      }

      const toolCalls = this.parseToolCalls(fullContent);
      const cleanContent = this.removeToolCallsFromContent(fullContent);

      return {
        message: cleanContent,
        toolCalls,
        usage
      };

    } catch (error: any) {
      logger.error('Anthropic API error details:', {
        error: error,
        errorMessage: error?.message,
        errorType: error?.type,
        errorStatus: error?.status,
        model: this.model,
        messageCount: messages.length,
        hasApiKey: !!process.env.ANTHROPIC_API_KEY,
        apiKeyPrefix: process.env.ANTHROPIC_API_KEY?.substring(0, 7) + '...'
      });

      // Provide more specific error messages
      if (error?.status === 401) {
        throw new Error('Invalid Anthropic API key. Please check your ANTHROPIC_API_KEY environment variable.');
      } else if (error?.status === 429) {
        throw new Error('Anthropic API rate limit exceeded. Please try again later.');
      } else if (error?.status === 400) {
        throw new Error(`Invalid request to Anthropic API: ${error?.message || 'Unknown error'}`);
      } else if (error?.message?.includes('model')) {
        throw new Error(`Invalid model '${this.model}'. Please use a valid Claude model like 'claude-3-5-sonnet-20241022'.`);
      } else {
        throw new Error(`Anthropic request failed: ${error?.message || 'Unknown error'}`);
      }
    }
  }

  private formatSystemMessage(): string {
    return `You are a ServiceNow AI assistant that helps users manage their ServiceNow instance through natural language.

${this.formatToolsForLLM()}

Core Behavior Guidelines:
- ALWAYS be proactive and complete multi-step workflows automatically
- When a user requests something complex, break it down and execute ALL necessary steps
- Use multiple tools in sequence to complete full workflows
- Provide real-time progress updates as you work
- After creating records, immediately set up related configurations
- Suggest logical next steps and offer to execute them automatically

Workflow Examples:
- "Create catalog item" → Create item + Add variables + Set approval workflow + Configure UI policies
- "New incident process" → Create incident template + Set assignment rules + Configure notifications
- "Setup hardware request" → Create catalog item + Add approval chain + Configure variables + Test workflow

Communication Style:
- Start with "I'll help you [specific task]" 
- Show each step: "Creating catalog item..." → "Adding variables..." → "Setting up workflow..."
- Always end with: "What would you like to configure next?" or "Shall I set up [related feature]?"
- Use tool calls immediately - don't wait for user confirmation on obvious next steps
- Be enthusiastic and solution-oriented

Remember: Complete workflows, don't just do single tasks. Think like a ServiceNow expert who anticipates needs.`;
  }
}