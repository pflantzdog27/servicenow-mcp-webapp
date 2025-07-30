import { MCPTool, MCPToolCall } from '../mcp/mcp-client';

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LLMStreamChunk {
  type: 'text' | 'tool_call' | 'tool_result' | 'error';
  content: string;
  toolCall?: MCPToolCall;
  toolResult?: any;
}

export interface LLMResponse {
  message: string;
  toolCalls: MCPToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export abstract class LLMService {
  protected availableTools: MCPTool[] = [];

  abstract generateResponse(
    messages: LLMMessage[],
    onStream?: (chunk: LLMStreamChunk) => void
  ): Promise<LLMResponse>;

  setAvailableTools(tools: MCPTool[]): void {
    this.availableTools = tools;
  }

  protected formatToolsForLLM(): string {
    if (this.availableTools.length === 0) return '';

    const toolDescriptions = this.availableTools.map(tool => {
      return `- ${tool.name}: ${tool.description || 'No description available'}
        Schema: ${JSON.stringify(tool.inputSchema, null, 2)}`;
    }).join('\n');

    return `
Available ServiceNow MCP Tools:
${toolDescriptions}

To use a tool, respond with the tool name and arguments in this format:
TOOL_CALL: {"name": "tool_name", "arguments": {"param": "value"}}

You can make multiple tool calls in sequence if needed.
`;
  }

  protected parseToolCalls(content: string): MCPToolCall[] {
    const toolCalls: MCPToolCall[] = [];
    const toolCallRegex = /TOOL_CALL:\s*({[^}]+})/g;
    let match;

    while ((match = toolCallRegex.exec(content)) !== null) {
      try {
        const toolCall = JSON.parse(match[1]);
        if (toolCall.name && toolCall.arguments) {
          toolCalls.push(toolCall);
        }
      } catch (error) {
        console.warn('Failed to parse tool call:', match[1]);
      }
    }

    return toolCalls;
  }

  protected removeToolCallsFromContent(content: string): string {
    return content.replace(/TOOL_CALL:\s*{[^}]+}/g, '').trim();
  }
}