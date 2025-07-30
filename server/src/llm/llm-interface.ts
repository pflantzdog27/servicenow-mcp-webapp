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
    // More flexible regex to catch complete JSON objects
    const toolCallRegex = /TOOL_CALL:\s*({[^}]*})/g;
    let match;

    while ((match = toolCallRegex.exec(content)) !== null) {
      try {
        let jsonStr = match[1];
        
        // Try to fix incomplete JSON by adding missing closing braces
        const openBraces = (jsonStr.match(/{/g) || []).length;
        const closeBraces = (jsonStr.match(/}/g) || []).length;
        
        if (openBraces > closeBraces) {
          // Add missing closing braces
          jsonStr += '}'.repeat(openBraces - closeBraces);
        }
        
        const toolCall = JSON.parse(jsonStr);
        if (toolCall.name) {
          // Default arguments to empty object if missing
          if (!toolCall.arguments) {
            toolCall.arguments = {};
          }
          toolCalls.push(toolCall);
        }
      } catch (error) {
        console.warn('Failed to parse tool call:', match[1], error);
        
        // Try to extract tool name even from incomplete JSON
        const nameMatch = match[1].match(/"name":\s*"([^"]+)"/);
        if (nameMatch) {
          toolCalls.push({
            name: nameMatch[1],
            arguments: {}
          });
        }
      }
    }

    return toolCalls;
  }

  protected removeToolCallsFromContent(content: string): string {
    return content.replace(/TOOL_CALL:\s*{[^}]+}/g, '').trim();
  }
}