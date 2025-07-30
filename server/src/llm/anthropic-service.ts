import Anthropic from '@anthropic-ai/sdk';
import { LLMService, LLMMessage, LLMResponse, LLMStreamChunk } from './llm-interface';
import { createLogger } from '../utils/logger';

const logger = createLogger();

export class AnthropicService extends LLMService {
  private client: Anthropic;
  private model: string;

  constructor(model: string = 'claude-sonnet-4-20250514') {
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
      const systemMessage = this.formatSystemMessage();
      
      // Filter out system messages from the messages array (Anthropic handles system separately)
      const userMessages = messages.filter(msg => msg.role !== 'system');
      
      const stream = await (this.client as any).messages.create({
        model: this.model,
        max_tokens: 200000, // ~$5 safety limit for Claude ($3/MTok input + $15/MTok output)
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

    } catch (error) {
      logger.error('Anthropic API error details:', {
        error: error,
        model: this.model,
        messageCount: messages.length,
        hasApiKey: !!process.env.ANTHROPIC_API_KEY
      });
      throw new Error(`Anthropic request failed: ${error instanceof Error ? error.message : error}`);
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