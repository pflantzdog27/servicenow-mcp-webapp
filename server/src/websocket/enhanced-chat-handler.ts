import { Server, Socket } from 'socket.io';
import { getEnhancedMCPClient } from '../mcp/enhanced-mcp-client';
import { queueToolExecution } from '../queues/tool-execution-queue';
import { queueMessageProcessing } from '../queues/message-processing-queue';
import { createLogger } from '../utils/logger';
import { PrismaClient } from '@prisma/client';
import { MCPParameterTransformer } from '../mcp/mcp-parameter-transformer';
import { mcpDebugLogger } from '../utils/mcp-debug-logger';
import { AnthropicService } from '../llm/anthropic-service';
import { OpenAIService } from '../llm/openai-service';
import { LLMService, LLMMessage } from '../llm/llm-interface';
import { EnhancedChatHandlerWithApproval } from './enhanced-chat-handler-with-approval';

const logger = createLogger();
const prisma = new PrismaClient();

// Function to create appropriate LLM service based on model
function createLLMService(model: string): LLMService {
  if (model.includes('claude')) {
    return new AnthropicService(model);
  } else if (model.includes('gpt') || model.includes('o4')) {
    return new OpenAIService(model);
  } else {
    // Default to Claude for unknown models
    return new AnthropicService('claude-sonnet-4-20250514');
  }
}

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

// Adapter to make Enhanced MCP Client work with the handler that expects MCPClientManager
class MCPClientAdapter {
  private enhancedClient: any;
  
  constructor(enhancedClient: any) {
    this.enhancedClient = enhancedClient;
  }
  
  async initialize() {
    return this.enhancedClient.initialize();
  }
  
  async disconnect() {
    return this.enhancedClient.disconnect();
  }
  
  getAvailableTools() {
    return this.enhancedClient.getAvailableTools();
  }
  
  async executeTool(toolCall: any, messageId?: string) {
    return this.enhancedClient.executeTool(toolCall, messageId);
  }
  
  isConnected() {
    return this.enhancedClient.isReady();
  }
}

export function setupEnhancedChatHandlers(io: Server, socket: SocketWithUser) {
  console.log('🔧 [ENHANCED-HANDLER-SETUP] Setting up enhanced chat handlers');
  
  // Create adapter to bridge enhanced MCP client to MCPClientManager interface
  const enhancedMcpClient = getEnhancedMCPClient();
  const mcpClientAdapter = new MCPClientAdapter(enhancedMcpClient);
  
  // Create the enhanced chat handler with approval that has proper tool discovery
  const enhancedHandler = new EnhancedChatHandlerWithApproval(mcpClientAdapter as any);
  
  console.log('🔧 [ENHANCED-HANDLER-SETUP] Created EnhancedChatHandlerWithApproval instance');
  
  // Handle chat messages using the enhanced handler
  socket.on('chat:message', async (data: ChatMessage) => {
    console.log('🚨 [ENHANCED-HANDLER] Received chat:message event');
    console.log('🚨 [ENHANCED-HANDLER] About to call enhanced handler with approval...');
    
    try {
      // Convert socket format to match what the handler expects
      const socketWithUser = socket as any;
      socketWithUser.user = {
        userId: socket.userId,
        email: socket.userEmail,
        role: socket.userRole
      };
      
      await enhancedHandler.handleMessage(socketWithUser, data);
      console.log('🚨 [ENHANCED-HANDLER] Enhanced handler completed successfully!');
    } catch (error) {
      console.error('🚨 [ENHANCED-HANDLER] Enhanced handler FAILED:', error);
      logger.error('Enhanced handler failed:', error);
      socket.emit('error', { message: 'Failed to process message' });
    }
  });

  // Handle tool approval responses using the enhanced handler
  socket.on('tool:approval_response', async (data) => {
    console.log('🔧 [ENHANCED-HANDLER] Received tool:approval_response event');
    
    try {
      const socketWithUser = socket as any;
      socketWithUser.user = {
        userId: socket.userId,
        email: socket.userEmail,
        role: socket.userRole
      };
      
      await enhancedHandler.handleToolApproval(socketWithUser, data);
    } catch (error) {
      console.error('🔧 [ENHANCED-HANDLER] Tool approval failed:', error);
      logger.error('Tool approval failed:', error);
      socket.emit('error', { message: 'Failed to process tool approval' });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('🔌 [ENHANCED-HANDLER] Client disconnected');
    enhancedHandler.cleanup(socket.id);
  });

  logger.info(`Enhanced chat handlers set up for user ${socket.userId}`);
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

    // Phase 1: Execute tools if needed (with dependency handling)
    if (toolsToUse.length > 0) {
      let catalogItemId = null;
      
      // Execute tools in sequence, handling dependencies
      for (const tool of toolsToUse) {
        // Skip dependent tools if they depend on a tool that hasn't run yet
        if (tool.dependsOn && !catalogItemId) {
          continue;
        }
        
        // Update tool arguments with catalog item ID if it's a dependent tool
        if (tool.dependsOn && catalogItemId && tool.arguments.command) {
          tool.arguments.command = tool.arguments.command.replace(
            `for catalog item '${tool.itemName || 'New Catalog Item'}'`,
            `for catalog item with sys_id '${catalogItemId}'`
          );
        }
        // ===== COMPREHENSIVE DEBUG LOGGING START =====
        console.log('\n🔧 [TOOL-CALL] Received from LLM:', JSON.stringify(tool, null, 2));
        console.log('📝 [TOOL-CALL] User Message:', userMessage);
        console.log('🎯 [TOOL-CALL] Message ID:', messageId);
        
        // Log to debug file
        mcpDebugLogger.logToolCall({
          messageId,
          toolName: tool.name,
          userMessage,
          originalArguments: tool.arguments
        });
        
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
          
          console.log('🚀 [MCP-START] Tool execution started:', {
            toolName: tool.name,
            messageId,
            timestamp: new Date().toISOString()
          });
          
          // Simulate progress
          socket.emit('chat:tool_progress', {
            messageId,
            toolName: tool.name,
            progress: 25,
          });

          // Transform parameters for MCP tools
          console.log('🔄 [MCP-TRANSFORM] Before transformation:', JSON.stringify(tool.arguments, null, 2));
          
          const transformedArguments = MCPParameterTransformer.transformParameters(
            tool.name,
            tool.arguments,
            userMessage
          );
          
          console.log('✅ [MCP-TRANSFORM] After transformation:', JSON.stringify(transformedArguments, null, 2));
          
          // Log parameter transformation to debug file
          mcpDebugLogger.logParameterTransformation({
            toolName: tool.name,
            originalArgs: tool.arguments,
            transformedArgs: transformedArguments,
            userMessage
          });
          
          logger.info(`[MCP] Tool arguments after transformation:`, {
            toolName: tool.name,
            originalArguments: tool.arguments,
            transformedArguments
          });
          
          console.log('📤 [MCP-EXECUTE] About to call MCP server with:', {
            toolName: tool.name,
            transformedArguments: transformedArguments,
            mcpClientReady: mcpClient.isReady(),
            poolStats: mcpClient.getPoolStats()
          });
          
          // Log MCP execution to debug file
          mcpDebugLogger.logMCPExecution({
            toolName: tool.name,
            arguments: transformedArguments,
            mcpClientReady: mcpClient.isReady(),
            poolStats: mcpClient.getPoolStats()
          });
          
          const startTime = Date.now();
          
          console.log('⏱️ [MCP-EXECUTE] Calling MCP server now...');
          
          const toolResult = await mcpClient.executeTool({
            name: tool.name,
            arguments: transformedArguments,
          }, assistantMessageId);
          
          const executionTime = Date.now() - startTime;

          console.log('📥 [MCP-RESPONSE] Raw result from MCP server:', JSON.stringify(toolResult, null, 2));
          console.log('⏱️ [MCP-TIMING] Execution took:', executionTime, 'ms');
          
          // Log MCP response to debug file
          mcpDebugLogger.logMCPResponse({
            toolName: tool.name,
            result: toolResult,
            executionTime,
            isError: !!toolResult.isError
          });
          
          // Check for errors in the result
          if (toolResult.isError) {
            console.error('❌ [MCP-ERROR] Tool execution failed:', toolResult.content);
          } else {
            console.log('✅ [MCP-SUCCESS] Tool executed successfully');
          }

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
                
                // Extract catalog item ID from ServiceNow response format
                if (tool.name.includes('create-catalog-item') && textContent.text.includes('Item ID:')) {
                  const idMatch = textContent.text.match(/Item ID:\s*([a-f0-9]{32})/i);
                  if (idMatch) {
                    catalogItemId = idMatch[1];
                    console.log('🎯 [CATALOG-ID] Extracted catalog item ID:', catalogItemId);
                  }
                }
              }
            }
          }

          // Add to response context
          responseText += resultText || `I've executed ${tool.name} successfully. `;
          
          // Store the actual tool result for later use
          tool.result = toolResult;

        } catch (error) {
          console.error('💥 [MCP-ERROR] Tool execution threw exception:', {
            toolName: tool.name,
            error: error,
            errorMessage: String(error),
            errorStack: error instanceof Error ? error.stack : 'No stack trace',
            messageId
          });
          
          // Log error to debug file
          mcpDebugLogger.logError({
            toolName: tool.name,
            error: error,
            errorMessage: String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
            messageId
          });
          
          logger.error(`Tool execution failed: ${tool.name}`, error);
          
          socket.emit('chat:tool_error', {
            messageId,
            toolName: tool.name,
            error: String(error),
          });
          
          // Add error to response context
          responseText += `I encountered an error while executing ${tool.name}: ${String(error)}. `;
        }
        
        console.log('🏁 [MCP-COMPLETE] Tool processing finished for:', tool.name);
        console.log('=' .repeat(80));
      }
      
      // Second pass: Execute dependent tools now that we have the catalog item ID
      if (catalogItemId) {
        const dependentTools = toolsToUse.filter(tool => tool.dependsOn);
        console.log(`🔗 [DEPENDENT-TOOLS] Found ${dependentTools.length} dependent tools to execute`);
        
        for (const tool of dependentTools) {
          // Update tool arguments with catalog item ID
          if (tool.arguments.catalog_item === 'PLACEHOLDER_CATALOG_ID') {
            tool.arguments.catalog_item = catalogItemId;
            console.log(`🔄 [DEPENDENT-TOOL] Updated catalog_item parameter:`, {
              toolName: tool.name,
              catalogItemId: catalogItemId
            });
          }
          
          // Also update command-based tools (like UI policy)
          if (tool.arguments.command && tool.arguments.command.includes('PLACEHOLDER_CATALOG_ID')) {
            const originalCommand = tool.arguments.command;
            tool.arguments.command = tool.arguments.command.replace(
              'PLACEHOLDER_CATALOG_ID',
              catalogItemId
            );
            console.log(`🔄 [DEPENDENT-TOOL] Updated command:`, {
              original: originalCommand,
              updated: tool.arguments.command
            });
          }
          
          // Execute the dependent tool (reuse the same execution logic)
          console.log('\n🔧 [DEPENDENT-TOOL-CALL] Executing dependent tool:', JSON.stringify(tool, null, 2));
          
          socket.emit('chat:tool_start', {
            messageId,
            toolName: tool.name,
            arguments: tool.arguments,
          });

          try {
            const mcpClient = getEnhancedMCPClient();
            const transformedArguments = MCPParameterTransformer.transformParameters(
              tool.name,
              tool.arguments,
              userMessage
            );
            
            const toolResult = await mcpClient.executeTool({
              name: tool.name,
              arguments: transformedArguments,
            }, assistantMessageId);
            
            socket.emit('chat:tool_complete', {
              messageId,
              toolName: tool.name,
              result: toolResult,
            });
            
            // Add to response context
            const resultText = toolResult.content?.[0]?.text || `Executed ${tool.name} successfully`;
            responseText += `${resultText}. `;
            tool.result = toolResult;
            
            console.log('✅ [DEPENDENT-TOOL] Successfully executed:', tool.name);
            
          } catch (error) {
            console.error('❌ [DEPENDENT-TOOL-ERROR] Failed to execute dependent tool:', error);
            socket.emit('chat:tool_error', {
              messageId,
              toolName: tool.name,
              error: String(error),
            });
          }
        }
      }
    }

    // Phase 2: Generate LLM response with tool results
    console.log('🤖 [LLM-START] Generating response with tool results...');
    
    // Create LLM service
    const llmService = createLLMService(model);
    
    // Don't set tools for response generation - we're just asking for a conversational response
    llmService.setAvailableTools({
      mcp: [],
      web: []
    });
    
    // Build conversation messages for natural response generation
    const conversationMessages: LLMMessage[] = [];
    
    if (toolsToUse.length > 0) {
      // Create a natural conversation context about what was accomplished
      let contextMessage = `The user requested: "${userMessage}"\n\n`;
      
      // Count what we actually accomplished
      const catalogItems = toolsToUse.filter(t => t.name.includes('create-catalog-item') && t.result);
      const variables = toolsToUse.filter(t => t.name.includes('create-variable') && t.result);
      const uiPolicies = toolsToUse.filter(t => t.name.includes('create-ui-policy') && t.result);
      
      contextMessage += `I successfully completed the following ServiceNow operations:\n\n`;
      
      if (catalogItems.length > 0) {
        const catalogResult = catalogItems[0].result.content?.[0]?.text || '';
        const itemIdMatch = catalogResult.match(/Item ID:\s*([a-f0-9]{32})/i);
        const itemId = itemIdMatch ? itemIdMatch[1] : 'unknown';
        contextMessage += `✅ Created catalog item "${catalogItems[0].itemName || 'Test Item'}" (ID: ${itemId})\n`;
      }
      
      if (variables.length > 0) {
        contextMessage += `✅ Added ${variables.length} variables:\n`;
        variables.forEach(v => {
          const name = v.arguments.question_text || v.arguments.name;
          const type = v.arguments.type;
          contextMessage += `   • ${name} (${type})\n`;
        });
      }
      
      if (uiPolicies.length > 0) {
        contextMessage += `✅ Created UI policy for dynamic field behavior\n`;
      }
      
      contextMessage += '\nPlease respond as a helpful ServiceNow assistant. Be conversational and encouraging. ';
      contextMessage += 'Explain what was created in plain English, mention specific details like the catalog item ID, ';
      contextMessage += 'and describe what users will see when they access this catalog item. ';
      contextMessage += 'If everything requested was completed, celebrate the success! ';
      contextMessage += 'If only part was done, acknowledge what worked and suggest what could be added next.';
      
      conversationMessages.push({
        role: 'user',
        content: contextMessage
      });
    } else {
      // No tools were executed, just respond to the user naturally
      conversationMessages.push({
        role: 'user',
        content: userMessage
      });
    }
    
    console.log('📝 [LLM-CONTEXT] Conversation messages:', JSON.stringify(conversationMessages, null, 2));
    
    // Generate streaming response from LLM
    let currentResponse = '';
    
    try {
      const llmResponse = await llmService.generateResponse(
        conversationMessages,
        (chunk) => {
          if (chunk.type === 'text' && chunk.content) {
            currentResponse += chunk.content;
            socket.emit('chat:text_stream', {
              messageId,
              chunk: chunk.content,
            });
          }
        }
      );
      
      // If no streaming occurred, send the full response
      if (!currentResponse && llmResponse.message) {
        currentResponse = llmResponse.message;
        const words = currentResponse.split(' ');
        
        for (let i = 0; i < words.length; i++) {
          const word = words[i];
          const chunk = i === 0 ? word : ` ${word}`;
          
          socket.emit('chat:text_stream', {
            messageId,
            chunk,
          });
          
          // Simulate typing delay
          await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 50));
        }
      }
      
      console.log('✅ [LLM-SUCCESS] Generated response:', currentResponse.substring(0, 200) + '...');
      
    } catch (error) {
      console.error('❌ [LLM-ERROR] Failed to generate response:', error);
      logger.error('LLM response generation failed:', error);
      
      // Create a helpful fallback response based on what was actually accomplished
      let fallbackResponse = '';
      
      if (toolsToUse.length > 0) {
        // We executed tools, so explain what happened
        const catalogItems = toolsToUse.filter(t => t.name.includes('create-catalog-item') && t.result);
        const variables = toolsToUse.filter(t => t.name.includes('create-variable') && t.result);
        
        if (catalogItems.length > 0) {
          const catalogResult = catalogItems[0].result.content?.[0]?.text || '';
          const itemIdMatch = catalogResult.match(/Item ID:\s*([a-f0-9]{32})/i);
          const itemName = catalogItems[0].itemName || 'Test Item';
          
          fallbackResponse = `Great! I've successfully created the "${itemName}" catalog item in ServiceNow. `;
          
          if (itemIdMatch) {
            fallbackResponse += `The item ID is ${itemIdMatch[1]}. `;
          }
          
          if (variables.length > 0) {
            fallbackResponse += `I also added ${variables.length} variables to make the form more useful: `;
            variables.forEach((v, index) => {
              const fieldName = v.arguments.question_text || v.arguments.name;
              fallbackResponse += index === variables.length - 1 ? `and ${fieldName}. ` : `${fieldName}, `;
            });
          }
          
          fallbackResponse += `Users can now find this item in the ServiceNow catalog and submit requests with the custom fields I created. Is there anything else you'd like me to add or modify?`;
        } else {
          fallbackResponse = generateResponse(userMessage, toolsToUse, responseText);
        }
      } else {
        // No tools executed, just respond naturally to the question
        if (userMessage.toLowerCase().includes('connected') || userMessage.toLowerCase().includes('servicenow')) {
          fallbackResponse = `Yes, I'm connected to ServiceNow and ready to help! I can create catalog items, incidents, variables, UI policies, and many other ServiceNow objects. What would you like me to help you with?`;
        } else {
          fallbackResponse = generateResponse(userMessage, toolsToUse, responseText);
        }
      }
      
      currentResponse = fallbackResponse;
      const words = currentResponse.split(' ');
      
      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const chunk = i === 0 ? word : ` ${word}`;
        
        socket.emit('chat:text_stream', {
          messageId,
          chunk,
        });
        
        await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 50));
      }
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
  const toolsToUse = [];
  const messageLower = message.toLowerCase();
  
  logger.info('[TOOL-SELECTION] Analyzing message for tool selection:', { message });
  
  // Catalog item creation (with potential multi-step workflow)
  if (messageLower.includes('catalog item') || 
      (messageLower.includes('create') && messageLower.includes('catalog'))) {
    const catalogTool = availableTools.find(t => t.name === 'servicenow-mcp:create-catalog-item');
    if (catalogTool) {
      logger.info('[TOOL-SELECTION] Selected catalog item creation tool');
      
      // Extract the catalog item name from the message
      const itemName = MCPParameterTransformer.extractCatalogItemName(message) || 'New Catalog Item';
      const category = message.match(/in\s+([^\s]+)\s*$/i)?.[1] || 'General';
      
      toolsToUse.push({
        name: catalogTool.name,
        arguments: {
          command: `Create a catalog item called '${itemName}' in ${category}`
        },
        itemName: itemName, // Store for use in subsequent tools
      });
      
      // Check if user also wants variables
      if (messageLower.includes('variable') || messageLower.includes('field') || 
          messageLower.includes('different types') || messageLower.includes('add')) {
        logger.info('[TOOL-SELECTION] User requested variables - will add after catalog item creation');
        
        // Add multiple variable creation tools with proper parameters
        const variableTools = [
          {
            name: 'servicenow-mcp:create-variable',
            arguments: {
              name: 'requestor_name',
              question_text: 'Full Name',
              type: 'string',
              mandatory: true,
              max_length: 100,
              catalog_item: 'PLACEHOLDER_CATALOG_ID' // Will be replaced with actual sys_id
            },
            dependsOn: 'servicenow-mcp:create-catalog-item'
          },
          {
            name: 'servicenow-mcp:create-variable', 
            arguments: {
              name: 'priority_level',
              question_text: 'Priority Level',
              type: 'choice',
              choices: 'Low,Medium,High',
              default_value: 'Medium',
              catalog_item: 'PLACEHOLDER_CATALOG_ID'
            },
            dependsOn: 'servicenow-mcp:create-catalog-item'
          },
          {
            name: 'servicenow-mcp:create-variable',
            arguments: {
              name: 'quantity_requested',
              question_text: 'Quantity Requested',
              type: 'integer',
              default_value: '1',
              catalog_item: 'PLACEHOLDER_CATALOG_ID'
            },
            dependsOn: 'servicenow-mcp:create-catalog-item'
          }
        ];
        
        toolsToUse.push(...variableTools);
      }
      
      // Check if user also wants UI policy
      if (messageLower.includes('ui policy') || messageLower.includes('policy')) {
        logger.info('[TOOL-SELECTION] User requested UI policy - will add after catalog item creation');
        
        toolsToUse.push({
          name: 'servicenow-mcp:create-ui-policy',
          arguments: {
            command: `Create a UI policy for catalog item with sys_id 'PLACEHOLDER_CATALOG_ID' that shows quantity field only when priority is High`
          },
          dependsOn: 'servicenow-mcp:create-catalog-item'
        });
      }
    }
  }
  
  // Incident creation
  else if (messageLower.includes('incident') && 
           (messageLower.includes('create') || messageLower.includes('new'))) {
    const incidentTool = availableTools.find(t => t.name === 'servicenow-mcp:create-incident');
    if (incidentTool) {
      logger.info('[TOOL-SELECTION] Selected incident creation tool');
      toolsToUse.push({
        name: incidentTool.name,
        arguments: {
          short_description: message.substring(0, 80), // First 80 chars as summary
          description: message,
          urgency: '3',
          impact: '3',
        },
      });
    }
  }
  
  // Record search/query
  else if (messageLower.includes('search') || messageLower.includes('find') || 
           messageLower.includes('list') || messageLower.includes('show')) {
    const queryTool = availableTools.find(t => t.name === 'servicenow-mcp:query-records');
    if (queryTool) {
      logger.info('[TOOL-SELECTION] Selected query tool');
      
      // Determine table based on context
      let table = 'incident'; // default
      if (messageLower.includes('catalog')) table = 'sc_cat_item';
      else if (messageLower.includes('user')) table = 'sys_user';
      else if (messageLower.includes('group')) table = 'sys_user_group';
      
      toolsToUse.push({
        name: queryTool.name,
        arguments: {
          table: table,
          sysparm_limit: '10',
        },
      });
    }
  }
  
  logger.info(`[TOOL-SELECTION] Selected ${toolsToUse.length} tools:`, 
    toolsToUse.map(t => ({ name: t.name, arguments: t.arguments }))
  );
  
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