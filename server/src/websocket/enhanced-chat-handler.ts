import { Server, Socket } from 'socket.io';
import { getEnhancedMCPClient } from '../mcp/enhanced-mcp-client';
import { queueToolExecution } from '../queues/tool-execution-queue';
import { queueMessageProcessing } from '../queues/message-processing-queue';
import { createLogger } from '../utils/logger';
import { PrismaClient } from '@prisma/client';

const logger = createLogger();
const prisma = new PrismaClient();

interface SocketWithUser extends Socket {
  userId: string;
  userEmail: string;
  userRole: string;
}

interface ChatMessage {
  message: string;
  model: string;
  sessionId?: string;
}

interface ToolRetryRequest {
  toolCall: {
    name: string;
    arguments: any;
  };
  messageId: string;
}

export function setupEnhancedChatHandlers(io: Server, socket: SocketWithUser) {
  const userId = socket.userId;
  
  // Handle new chat messages with enhanced streaming
  socket.on('chat:message', async (data: ChatMessage) => {
    let messageId: string | null = null;
    
    try {
      logger.info(`Processing chat message from user ${userId}`, {
        model: data.model,
        sessionId: data.sessionId
      });

      // Generate unique message ID
      messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Emit stream start
      socket.emit('chat:stream_start', { messageId });

      // Emit thinking state
      socket.emit('chat:thinking', { messageId });

      // Get or create chat session
      let sessionId = data.sessionId;
      if (!sessionId) {
        const session = await prisma.chatSession.create({
          data: {
            userId,
            model: data.model,
            contextLimit: getContextLimit(data.model),
          },
        });
        sessionId = session.id;
      }

      // Create user message
      const userMessage = await prisma.message.create({
        data: {
          sessionId,
          role: 'USER',
          content: data.message,
          model: data.model,
        },
      });

      // Create assistant message placeholder
      const assistantMessage = await prisma.message.create({
        data: {
          sessionId,
          role: 'ASSISTANT',
          content: '',
          model: data.model,
        },
      });

      // Get MCP client and available tools
      const mcpClient = getEnhancedMCPClient();
      const availableTools = mcpClient.getAvailableTools();

      // Simulate AI planning phase
      await new Promise(resolve => setTimeout(resolve, 500));

      // Start streaming response
      await streamEnhancedResponse({
        io,
        socket,
        messageId,
        userMessage: data.message,
        sessionId,
        assistantMessageId: assistantMessage.id,
        model: data.model,
        availableTools,
      });

    } catch (error) {
      logger.error('Error processing chat message:', error);
      
      socket.emit('chat:error', {
        message: 'Failed to process your message',
        error: String(error),
        messageId,
      });
    }
  });

  // Handle tool retry requests
  socket.on('chat:retry_tool', async (data: ToolRetryRequest) => {
    try {
      logger.info(`Retrying tool execution for user ${userId}`, {
        toolName: data.toolCall.name,
        messageId: data.messageId,
      });

      // Queue tool for retry
      await queueToolExecution({
        toolName: data.toolCall.name,
        arguments: data.toolCall.arguments,
        messageId: data.messageId,
        sessionId: 'retry', // Special session for retries
        userId,
        priority: 1, // High priority for retries
      });

      // Emit tool start event
      socket.emit('chat:tool_start', {
        messageId: data.messageId,
        toolName: data.toolCall.name,
        arguments: data.toolCall.arguments,
      });

    } catch (error) {
      logger.error('Error retrying tool:', error);
      
      socket.emit('chat:tool_error', {
        messageId: data.messageId,
        toolName: data.toolCall.name,
        error: String(error),
      });
    }
  });

  // Handle message retry requests
  socket.on('chat:retry_message', async ({ messageId }: { messageId: string }) => {
    try {
      logger.info(`Retrying message for user ${userId}`, { messageId });
      
      // Find the original message and retry
      // This would involve re-processing the entire message flow
      socket.emit('chat:thinking', { messageId });
      
      // Implement retry logic here
      
    } catch (error) {
      logger.error('Error retrying message:', error);
      
      socket.emit('chat:error', {
        message: 'Failed to retry message',
        error: String(error),
        messageId,
      });
    }
  });

  logger.info(`Enhanced chat handlers set up for user ${userId}`);
}

// Enhanced streaming response function
async function streamEnhancedResponse({
  io,
  socket,
  messageId,
  userMessage,
  sessionId,
  assistantMessageId,
  model,
  availableTools,
}: {
  io: Server;
  socket: SocketWithUser;
  messageId: string;
  userMessage: string;
  sessionId: string;
  assistantMessageId: string;
  model: string;
  availableTools: any[];
}) {
  try {
    // Simulate AI decision making
    const shouldUseTools = Math.random() > 0.3; // 70% chance to use tools
    const toolsToUse = shouldUseTools ? selectToolsForMessage(userMessage, availableTools) : [];

    let responseText = '';

    // Phase 1: Execute tools if needed
    if (toolsToUse.length > 0) {
      for (const tool of toolsToUse) {
        // Emit tool start
        socket.emit('chat:tool_start', {
          messageId,
          toolName: tool.name,
          arguments: tool.arguments,
        });

        try {
          // Execute tool with progress updates
          const mcpClient = getEnhancedMCPClient();
          
          logger.info(`[MCP] Starting tool execution: ${tool.name}`, {
            messageId,
            arguments: tool.arguments
          });
          
          // Simulate progress
          socket.emit('chat:tool_progress', {
            messageId,
            toolName: tool.name,
            progress: 25,
          });

          const startTime = Date.now();
          const toolResult = await mcpClient.executeTool({
            name: tool.name,
            arguments: tool.arguments,
          }, assistantMessageId);
          const executionTime = Date.now() - startTime;

          logger.info(`[MCP] Tool execution completed: ${tool.name}`, {
            messageId,
            executionTime,
            result: toolResult
          });

          socket.emit('chat:tool_progress', {
            messageId,
            toolName: tool.name,
            progress: 75,
          });

          // Simulate some processing time
          await new Promise(resolve => setTimeout(resolve, 200));

          // Emit tool completion with actual result
          socket.emit('chat:tool_complete', {
            messageId,
            toolName: tool.name,
            result: toolResult,
            executionTime,
          });

          // Extract meaningful content from tool result
          let resultText = '';
          if (toolResult && toolResult.content && Array.isArray(toolResult.content)) {
            const textContent = toolResult.content.find(c => c.type === 'text');
            if (textContent && textContent.text) {
              try {
                const parsed = JSON.parse(textContent.text);
                if (parsed.sys_id && parsed.number) {
                  resultText = `Created ${tool.name.replace(/_/g, ' ')} with number ${parsed.number} (sys_id: ${parsed.sys_id}). `;
                } else if (Array.isArray(parsed)) {
                  resultText = `Found ${parsed.length} results. `;
                } else {
                  resultText = `Completed ${tool.name} successfully. `;
                }
              } catch (e) {
                resultText = textContent.text;
              }
            }
          }

          // Add to response context
          responseText += resultText || `I've executed ${tool.name} successfully. `;
          
          // Store the actual tool result for later use
          tool.result = toolResult;

        } catch (error) {
          logger.error(`Tool execution failed: ${tool.name}`, error);
          
          socket.emit('chat:tool_error', {
            messageId,
            toolName: tool.name,
            error: String(error),
          });
        }
      }
    }

    // Phase 2: Stream text response
    const fullResponse = generateResponse(userMessage, toolsToUse, responseText);
    
    // Stream response word by word
    const words = fullResponse.split(' ');
    let currentResponse = '';

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const chunk = i === 0 ? word : ` ${word}`;
      currentResponse += chunk;

      socket.emit('chat:text_stream', {
        messageId,
        chunk,
      });

      // Simulate typing delay
      await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 50));
    }

    // Update database with final response
    await prisma.message.update({
      where: { id: assistantMessageId },
      data: { content: currentResponse },
    });

    // Emit stream completion
    socket.emit('chat:stream_complete', {
      messageId,
      finalMessage: {
        id: assistantMessageId,
        role: 'assistant',
        content: currentResponse,
        timestamp: new Date(),
        model,
        toolCalls: toolsToUse.map(tool => ({
          name: tool.name,
          arguments: tool.arguments,
          status: 'completed',
          result: tool.result || { content: [{ type: 'text', text: 'Tool executed' }] },
        })),
      },
    });

  } catch (error) {
    logger.error('Error in enhanced streaming response:', error);
    throw error;
  }
}

// Helper functions
function getContextLimit(model: string): number {
  const limits: Record<string, number> = {
    'gpt-4': 8192,
    'gpt-3.5-turbo': 4096,
    'claude-3-sonnet': 200000,
    'claude-3-opus': 200000,
  };
  return limits[model] || 4096;
}

function selectToolsForMessage(message: string, availableTools: any[]): any[] {
  // Simple tool selection logic based on message content
  const toolsToUse = [];
  
  if (message.toLowerCase().includes('create') || message.toLowerCase().includes('incident')) {
    const createTool = availableTools.find(t => t.name.includes('create'));
    if (createTool) {
      toolsToUse.push({
        name: createTool.name,
        arguments: {
          short_description: 'User requested incident',
          description: message,
          urgency: '3',
          impact: '3',
        },
      });
    }
  }

  if (message.toLowerCase().includes('search') || message.toLowerCase().includes('find')) {
    const searchTool = availableTools.find(t => t.name.includes('search') || t.name.includes('list'));
    if (searchTool) {
      toolsToUse.push({
        name: searchTool.name,
        arguments: {
          sysparm_query: `short_descriptionLIKE${message}`,
          sysparm_limit: '10',
        },
      });
    }
  }

  return toolsToUse.slice(0, 3); // Limit to 3 tools max
}

function generateResponse(userMessage: string, toolsUsed: any[], toolContext: string): string {
  if (toolContext.trim()) {
    // If we have actual tool results, craft a more specific response
    return `Based on your request, ${toolContext}Is there anything else you'd like me to help you with in ServiceNow?`;
  }
  
  // Generic responses for when no tools were used
  const responses = [
    `I understand you want to ${userMessage.toLowerCase()}. Let me help you with that.`,
    `Based on your request "${userMessage}", I can assist you with ServiceNow operations.`,
    `I've processed your request about ${userMessage.toLowerCase()}.`,
  ];
  
  return responses[Math.floor(Math.random() * responses.length)] + 
    ' What would you like me to do in ServiceNow?';
}