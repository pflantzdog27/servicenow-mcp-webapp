import OpenAI from 'openai';
import { LLMService, LLMMessage, LLMResponse, LLMStreamChunk } from './llm-interface';
import { createLogger } from '../utils/logger';

const logger = createLogger();

export class OpenAIService extends LLMService {
  private client: OpenAI;
  private model: string;

  constructor(model: string = 'gpt-4') {
    super();
    this.model = model;
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
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
      
      // Build formatted messages with system message first
      const formattedMessages = [
        { role: 'system' as const, content: systemMessage },
        ...messages.filter(msg => msg.role !== 'system').map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content
        }))
      ];

      // Set appropriate max_tokens based on model capabilities
      let maxTokens = 2000; // Default safe value
      
      if (this.model.includes('gpt-4o')) {
        maxTokens = 32000; // GPT-4o has 128K context window
      } else if (this.model.includes('gpt-4')) {
        maxTokens = 2000; // GPT-4 has 8K context, system message uses ~4.7K, so max 2K for completion
      } else if (this.model.includes('gpt-3.5')) {
        maxTokens = 1000; // GPT-3.5 has 4K context, leave room for system message
      } else if (this.model.includes('o1-')) {
        maxTokens = 32000; // o1 models have higher limits
      }

      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages: formattedMessages,
        stream: true,
        temperature: 0.7,
        max_tokens: maxTokens,
      });

      let fullContent = '';
      let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        logger.info(`OpenAI chunk received:`, { hasContent: !!delta?.content, content: delta?.content?.substring(0, 20) });
        
        if (delta?.content) {
          fullContent += delta.content;
          logger.info(`Calling onStream callback with: ${delta.content.substring(0, 20)}...`);
          onStream?.({
            type: 'text',
            content: delta.content
          });
        }

        if (chunk.usage) {
          usage = {
            promptTokens: chunk.usage.prompt_tokens,
            completionTokens: chunk.usage.completion_tokens,
            totalTokens: chunk.usage.total_tokens
          };
        }
        
        // Check if stream is finished
        if (chunk.choices[0]?.finish_reason) {
          logger.info(`OpenAI stream finished with reason: ${chunk.choices[0].finish_reason}`);
          break;
        }
      }
      
      logger.info(`OpenAI response complete. Length: ${fullContent.length} chars`);
      logger.info(`Full content: ${fullContent.substring(0, 200)}...`);

      const toolCalls = this.parseToolCalls(fullContent);
      const cleanContent = this.removeToolCallsFromContent(fullContent);

      return {
        message: cleanContent,
        toolCalls,
        usage
      };

    } catch (error) {
      logger.error('OpenAI API error details:', {
        error: error,
        model: this.model,
        messageCount: messages.length,
        hasApiKey: !!process.env.OPENAI_API_KEY
      });
      throw new Error(`OpenAI request failed: ${error instanceof Error ? error.message : error}`);
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