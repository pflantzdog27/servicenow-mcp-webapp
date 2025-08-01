import Anthropic from '@anthropic-ai/sdk';
import { LLMService, LLMMessage, LLMResponse, LLMStreamChunk } from './llm-interface';
import { MCPToolCall } from '../mcp/mcp-client';
import { createLogger } from '../utils/logger';
import { buildSystemPrompt } from './system-prompt';

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
        mcpToolCount: this.availableTools.mcp.length,
        webToolCount: this.availableTools.web.length,
        totalToolCount: this.availableTools.mcp.length + this.availableTools.web.length
      });

      // Format tools for Claude's native tool calling
      const allTools = [...this.availableTools.mcp, ...this.availableTools.web];
      const tools = allTools.length > 0 ? allTools.map(tool => ({
        name: tool.name.replace('servicenow-mcp:', ''), // Strip prefix for Anthropic API compatibility
        description: tool.description || 'No description available',
        input_schema: tool.inputSchema
      })) : undefined;
      
      logger.info(`[ANTHROPIC] Prepared ${allTools.length} tools for API call:`, {
        toolNames: allTools.map(t => t.name),
        willSendTools: !!tools
      });

      const requestParams: any = {
        model: this.model,
        max_tokens: 4096,
        temperature: 0.7,
        system: systemMessage,
        messages: userMessages.map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content
        })),
        stream: true,
      };
      
      // Only add tools if we actually have some
      if (tools && tools.length > 0) {
        requestParams.tools = tools;
        logger.info(`[ANTHROPIC] Adding ${tools.length} tools to request`);
      } else {
        logger.info(`[ANTHROPIC] No tools to add to request`);
      }

      const stream = await this.client.messages.create(requestParams);

      let fullContent = '';
      let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
      let toolCalls: MCPToolCall[] = [];

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          fullContent += chunk.delta.text;
          onStream?.({
            type: 'text',
            content: chunk.delta.text
          });
        }

        // Handle Claude's native tool calls
        if (chunk.type === 'content_block_start' && chunk.content_block.type === 'tool_use') {
          // Map stripped tool name back to full name for MCP execution
          const strippedName = chunk.content_block.name;
          const fullName = allTools.find(tool => tool.name.replace('servicenow-mcp:', '') === strippedName)?.name || strippedName;
          
          const toolCall: MCPToolCall = {
            name: fullName,
            arguments: chunk.content_block.input || {}
          };
          toolCalls.push(toolCall);
          logger.info(`Claude tool call detected: ${toolCall.name}`, { arguments: toolCall.arguments });
        }

        if (chunk.type === 'message_delta' && chunk.usage) {
          usage = {
            promptTokens: chunk.usage.input_tokens || 0,
            completionTokens: chunk.usage.output_tokens || 0,
            totalTokens: (chunk.usage.input_tokens || 0) + (chunk.usage.output_tokens || 0)
          };
        }
      }

      // If no native tool calls were found, try to parse from content as fallback
      if (toolCalls.length === 0) {
        toolCalls = this.parseToolCalls(fullContent);
        fullContent = this.removeToolCallsFromContent(fullContent);
      }

      const cleanContent = fullContent;

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
        throw new Error(`Invalid model '${this.model}'. Please use a valid Claude model like 'claude-sonnet-4-20250514'.`);
      } else {
        throw new Error(`Anthropic request failed: ${error?.message || 'Unknown error'}`);
      }
    }
  }

  private formatSystemMessage(): string {
    return buildSystemPrompt({
      instanceUrl: process.env.SERVICENOW_INSTANCE_URL,
      userTimezone: 'UTC'
    });
  }
}