import { MCPTool, MCPToolCall } from '../mcp/mcp-client';

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LLMToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface LLMStreamChunk {
  type: 'text' | 'tool_call' | 'tool_result' | 'error';
  content: string;
  toolCall?: LLMToolCall;
  toolResult?: any;
}

export interface LLMResponse {
  message: string;
  toolCalls: LLMToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AllAvailableTools {
  mcp: MCPTool[];
  web: Array<{
    name: string;
    description: string;
    inputSchema: any;
    type: 'web';
  }>;
}

export abstract class LLMService {
  protected availableTools: AllAvailableTools = { mcp: [], web: [] };

  abstract generateResponse(
    messages: LLMMessage[],
    onStream?: (chunk: LLMStreamChunk) => void
  ): Promise<LLMResponse>;

  setAvailableTools(tools: AllAvailableTools): void {
    this.availableTools = tools;
  }

  protected formatToolsForLLM(): string {
    const allTools = [...this.availableTools.mcp, ...this.availableTools.web];
    if (allTools.length === 0) return '';

    const mcpToolDescriptions = this.availableTools.mcp.map(tool => {
      return `- ${tool.name}: ${tool.description || 'No description available'}
        Schema: ${JSON.stringify(tool.inputSchema, null, 2)}`;
    }).join('\n');

    const webToolDescriptions = this.availableTools.web.map(tool => {
      return `- ${tool.name}: ${tool.description || 'No description available'}
        Schema: ${JSON.stringify(tool.inputSchema, null, 2)}`;
    }).join('\n');

    return `
Available ServiceNow MCP Tools:
${mcpToolDescriptions}

Available Web Tools:
${webToolDescriptions}

To use a tool, respond with the tool name and arguments in this format:
TOOL_CALL: {"name": "tool_name", "arguments": {"param": "value"}}

You can make multiple tool calls in sequence if needed.
`;
  }

  protected parseToolCalls(content: string): MCPToolCall[] {
    const toolCalls: MCPToolCall[] = [];
    
    // Parse XML-style tool calls (fallback for old format)
    const xmlToolCalls = this.parseXMLToolCalls(content);
    toolCalls.push(...xmlToolCalls);
    
    // More flexible regex to catch complete JSON objects with nested braces
    const toolCallRegex = /TOOL_CALL:\s*({.*?})/g;
    let match;

    while ((match = toolCallRegex.exec(content)) !== null) {
      try {
        let jsonStr = match[1];
        
        // Find the complete JSON object by counting braces
        let braceCount = 0;
        let endIndex = 0;
        
        for (let i = 0; i < jsonStr.length; i++) {
          if (jsonStr[i] === '{') braceCount++;
          if (jsonStr[i] === '}') braceCount--;
          if (braceCount === 0) {
            endIndex = i + 1;
            break;
          }
        }
        
        if (endIndex > 0) {
          jsonStr = jsonStr.substring(0, endIndex);
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

  protected parseXMLToolCalls(content: string): MCPToolCall[] {
    const toolCalls: MCPToolCall[] = [];
    // Match XML-style tool invocations
    const xmlRegex = /<invoke name="([^"]+)">([\s\S]*?)<\/invoke>/g;
    let match;

    while ((match = xmlRegex.exec(content)) !== null) {
      const toolName = match[1];
      const parametersBlock = match[2];
      
      // Parse parameters from XML
      const paramRegex = /<parameter name="([^"]+)">([\s\S]*?)<\/parameter>/g;
      const args: Record<string, any> = {};
      let paramMatch;
      
      while ((paramMatch = paramRegex.exec(parametersBlock)) !== null) {
        args[paramMatch[1]] = paramMatch[2].trim();
      }
      
      toolCalls.push({
        name: toolName,
        arguments: args
      });
    }
    
    return toolCalls;
  }

  protected removeToolCallsFromContent(content: string): string {
    // Remove complete tool calls including nested JSON objects
    let cleanContent = content.replace(/TOOL_CALL:\s*{.*?}/g, '');
    // Remove XML-style tool calls
    cleanContent = cleanContent.replace(/<invoke name="[^"]+">[\s\S]*?<\/invoke>/g, '');
    return cleanContent.trim();
  }
}