export interface ParsedMessage {
  content: string;
  toolInvocations: ToolInvocation[];
}

export interface ToolInvocation {
  id: string;
  name: string;
  parameters: Record<string, any>;
  position: number; // Position in the message where this should appear
}

export function parseAssistantMessage(message: string): ParsedMessage {
  const toolInvocations: ToolInvocation[] = [];
  let content = message;
  
  // Parse XML-style tool invocations (for Anthropic)
  const xmlRegex = /<function_calls>[\s\S]*?<\/antml:function_calls>/g;
  let match;
  
  while ((match = xmlRegex.exec(message)) !== null) {
    const xmlContent = match[0];
    const position = match.index;
    
    // Extract individual invocations
    const invokeRegex = /<invoke name="([^"]+)">([\s\S]*?)<\/antml:invoke>/g;
    let invokeMatch;
    
    while ((invokeMatch = invokeRegex.exec(xmlContent)) !== null) {
      const toolName = invokeMatch[1];
      const paramsContent = invokeMatch[2];
      
      // Extract parameters
      const parameters: Record<string, any> = {};
      const paramRegex = /<parameter name="([^"]+)">([^<]*)<\/antml:parameter>/g;
      let paramMatch;
      
      while ((paramMatch = paramRegex.exec(paramsContent)) !== null) {
        let value: any = paramMatch[2];
        
        // Try to parse JSON values
        try {
          value = JSON.parse(value);
        } catch {
          // Keep as string if not valid JSON
        }
        
        parameters[paramMatch[1]] = value;
      }
      
      toolInvocations.push({
        id: `tool-${Date.now()}-${Math.random()}`,
        name: toolName,
        parameters,
        position
      });
    }
    
    // Remove the XML from content
    content = content.replace(xmlContent, `[TOOL_INVOCATION_${toolInvocations.length - 1}]`);
  }
  
  // Parse JSON-style function calls (for OpenAI)
  const jsonRegex = /```json\n\{[\s\S]*?"function_call"[\s\S]*?\}\n```/g;
  
  while ((match = jsonRegex.exec(message)) !== null) {
    try {
      const functionCall = JSON.parse(match[1]);
      if (functionCall.function_call) {
        toolInvocations.push({
          id: `tool-${Date.now()}-${Math.random()}`,
          name: functionCall.function_call.name,
          parameters: JSON.parse(functionCall.function_call.arguments),
          position: match.index
        });
        
        content = content.replace(match[0], `[TOOL_INVOCATION_${toolInvocations.length - 1}]`);
      }
    } catch (e) {
      // Invalid JSON, skip
    }
  }
  
  // Also parse simple TOOL_CALL format used in current implementation
  const toolCallRegex = /TOOL_CALL:\s*({.*?})/g;
  
  while ((match = toolCallRegex.exec(message)) !== null) {
    try {
      const toolCall = JSON.parse(match[1]);
      if (toolCall.name) {
        toolInvocations.push({
          id: `tool-${Date.now()}-${Math.random()}`,
          name: toolCall.name,
          parameters: toolCall.arguments || {},
          position: match.index
        });
        
        content = content.replace(match[0], `[TOOL_INVOCATION_${toolInvocations.length - 1}]`);
      }
    } catch (e) {
      // Invalid JSON, skip
    }
  }
  
  return { content, toolInvocations };
}

export function insertToolInvocations(content: string, toolInvocations: ToolInvocation[]): string {
  let result = content;
  
  // Replace tool invocation placeholders with actual invocations
  toolInvocations.forEach((invocation, index) => {
    const placeholder = `[TOOL_INVOCATION_${index}]`;
    const toolDisplay = `\n\n[${invocation.name}]\n\n`;
    result = result.replace(placeholder, toolDisplay);
  });
  
  return result;
}

export function extractToolInvocationsFromLLMResponse(response: any): ToolInvocation[] {
  const toolInvocations: ToolInvocation[] = [];
  
  // Handle Anthropic tool use format
  if (response.content) {
    response.content.forEach((block: any) => {
      if (block.type === 'tool_use') {
        toolInvocations.push({
          id: block.id,
          name: block.name,
          parameters: block.input,
          position: 0
        });
      }
    });
  }
  
  // Handle OpenAI function call format
  if (response.function_call) {
    toolInvocations.push({
      id: `tool-${Date.now()}-${Math.random()}`,
      name: response.function_call.name,
      parameters: JSON.parse(response.function_call.arguments),
      position: 0
    });
  }
  
  // Handle OpenAI tools format
  if (response.tool_calls) {
    response.tool_calls.forEach((toolCall: any) => {
      toolInvocations.push({
        id: toolCall.id,
        name: toolCall.function.name,
        parameters: JSON.parse(toolCall.function.arguments),
        position: 0
      });
    });
  }
  
  return toolInvocations;
}