import Anthropic from '@anthropic-ai/sdk';
import { LLMService, LLMMessage, LLMResponse, LLMStreamChunk } from './llm-interface';
import { createLogger } from '../utils/logger';

const logger = createLogger();

export class AnthropicService extends LLMService {
  private client: Anthropic;
  private model: string;

  constructor(model: string = 'claude-3-sonnet-20240229') {
    super();
    this.model = model;
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  async generateResponse(
    messages: LLMMessage[],
    onStream?: (chunk: LLMStreamChunk) => void
  ): Promise<LLMResponse> {
    try {
      const systemMessage = this.formatSystemMessage();
      
      // Filter out system messages from the messages array (Anthropic handles system separately)
      const userMessages = messages.filter(msg => msg.role !== 'system');
      
      const stream = await this.client.messages.create({
        model: this.model,
        max_tokens: 2000,
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
      logger.error('Anthropic API error:', error);
      throw new Error(`Anthropic request failed: ${error}`);
    }
  }

  private formatSystemMessage(): string {
    return `You are a ServiceNow AI assistant that helps users manage their ServiceNow instance through natural language.

${this.formatToolsForLLM()}

Guidelines:
- Always be helpful and provide clear explanations
- Use the available ServiceNow tools to perform requested operations
- When creating records, provide the sys_id and relevant details
- Format ServiceNow record links as: [Record Type: sys_id]
- If you need clarification, ask the user before proceeding
- Be proactive in suggesting next steps when appropriate
- Be concise but thorough in your responses`;
  }
}