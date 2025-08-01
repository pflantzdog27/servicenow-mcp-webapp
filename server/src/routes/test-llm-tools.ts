import express from 'express';
import { AnthropicService } from '../llm/anthropic-service';
import { MCPClientManager } from '../mcp/mcp-client';
import { EnhancedToolExecutor } from '../mcp/enhanced-tool-executor';
import { buildSystemPrompt } from '../llm/system-prompt';
import { createLogger } from '../utils/logger';

const router = express.Router();
const logger = createLogger();

// Initialize services
let mcpClientManager: MCPClientManager;
let enhancedToolExecutor: EnhancedToolExecutor;

const initializeServices = async () => {
  if (!mcpClientManager) {
    mcpClientManager = new MCPClientManager();
    await mcpClientManager.initialize();
    enhancedToolExecutor = new EnhancedToolExecutor(mcpClientManager);
  }
  return { mcpClientManager, enhancedToolExecutor };
};

// Direct LLM + Tools test (no database, no WebSocket)
router.post('/direct', async (req, res) => {
  try {
    const { message, model = 'claude-sonnet-4-20250514' } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    logger.info('🧪 Direct LLM + Tools test:', { message, model });
    
    await initializeServices();
    
    // Create LLM service
    const llmService = new AnthropicService(model);
    
    // Get all available tools
    const allTools = enhancedToolExecutor.getAllAvailableTools();
    logger.info('📚 Setting tools for LLM:', { 
      totalTools: allTools.length,
      mcpTools: allTools.filter(t => t.type === 'mcp').length,
      webTools: allTools.filter(t => t.type === 'web').length
    });
    
    // Configure LLM with tools
    const toolsForLLM = {
      mcp: allTools.filter(t => t.type === 'mcp').map(t => ({ ...t, type: undefined })),
      web: allTools.filter(t => t.type === 'web')
    };
    llmService.setAvailableTools(toolsForLLM);
    
    // Build system prompt
    const systemPrompt = buildSystemPrompt({
      instanceUrl: process.env.SERVICENOW_INSTANCE_URL || '',
      userTimezone: 'UTC'
    });
    
    // Prepare messages
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: message }
    ];
    
    const startTime = Date.now();
    
    // Generate LLM response
    logger.info('🤖 Generating LLM response...');
    const response = await llmService.generateResponse(messages);
    
    const llmTime = Date.now() - startTime;
    
    logger.info('🤖 LLM response received:', { 
      hasToolCalls: !!response.toolCalls?.length,
      toolCallsCount: response.toolCalls?.length || 0,
      messageLength: response.message?.length || 0
    });
    
    // Execute tool calls if present
    const toolResults: any[] = [];
    let totalToolTime = 0;
    
    if (response.toolCalls && response.toolCalls.length > 0) {
      logger.info(`🔧 Executing ${response.toolCalls.length} tool calls...`);
      
      for (const toolCall of response.toolCalls) {
        const toolStartTime = Date.now();
        
        try {
          logger.info(`🚀 Executing tool: ${toolCall.name}`, { arguments: toolCall.arguments });
          
          // Create enhanced tool call
          const enhancedToolCall = {
            id: toolCall.id || Date.now().toString(),
            name: toolCall.name,
            arguments: toolCall.arguments,
            type: enhancedToolExecutor.getToolType(toolCall.name)
          };
          
          // Execute the tool
          const toolResult = await enhancedToolExecutor.executeTool(enhancedToolCall);
          const toolTime = Date.now() - toolStartTime;
          totalToolTime += toolTime;
          
          logger.info(`✅ Tool completed: ${toolCall.name}`, { 
            success: !toolResult.isError,
            executionTime: toolTime
          });
          
          toolResults.push({
            name: toolCall.name,
            arguments: toolCall.arguments,
            result: toolResult,
            executionTime: toolTime,
            success: !toolResult.isError
          });
          
        } catch (error) {
          const toolTime = Date.now() - toolStartTime;
          totalToolTime += toolTime;
          
          logger.error(`❌ Tool failed: ${toolCall.name}`, error);
          
          toolResults.push({
            name: toolCall.name,
            arguments: toolCall.arguments,
            error: error instanceof Error ? error.message : 'Unknown error',
            executionTime: toolTime,
            success: false
          });
        }
      }
    }
    
    const totalTime = Date.now() - startTime;
    
    // Build final response
    const result = {
      success: true,
      message: response.message,
      toolCalls: response.toolCalls || [],
      toolResults,
      timing: {
        total: totalTime,
        llm: llmTime,
        tools: totalToolTime
      },
      summary: {
        toolsRequested: response.toolCalls?.length || 0,
        toolsExecuted: toolResults.length,
        toolsSucceeded: toolResults.filter(tr => tr.success).length,
        toolsFailed: toolResults.filter(tr => !tr.success).length,
        hasLLMResponse: !!response.message,
        responseLength: response.message?.length || 0
      }
    };
    
    logger.info('✅ Direct test completed:', result.summary);
    
    res.json(result);
    
  } catch (error) {
    logger.error('❌ Direct test failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Quick tests for various scenarios
router.post('/scenarios', async (req, res) => {
  try {
    await initializeServices();
    
    const scenarios = [
      {
        name: 'ServiceNow Connection Test',
        message: 'Test the connection to ServiceNow',
        expectTools: true,
        expectedTool: 'test-connection'
      },
      {
        name: 'Catalog Item Creation',
        message: 'Create a catalog item called "Test Laptop" in ServiceNow',
        expectTools: true,
        expectedTool: 'create-catalog-item'
      },
      {
        name: 'Query Records',
        message: 'Show me all incidents in ServiceNow',
        expectTools: true,
        expectedTool: 'query-records'
      },
      {
        name: 'Conversational Response',
        message: 'Hello, how are you today?',
        expectTools: false
      },
      {
        name: 'General ServiceNow Question',
        message: 'What is ServiceNow?',
        expectTools: false
      }
    ];

    const results = [];
    
    for (const scenario of scenarios) {
      logger.info(`🧪 Testing scenario: ${scenario.name}`);
      
      const llmService = new AnthropicService('claude-sonnet-4-20250514');
      
      // Get and set tools
      const allTools = enhancedToolExecutor.getAllAvailableTools();
      const toolsForLLM = {
        mcp: allTools.filter(t => t.type === 'mcp').map(t => ({ ...t, type: undefined })),
        web: allTools.filter(t => t.type === 'web')
      };
      llmService.setAvailableTools(toolsForLLM);
      
      // Build system prompt
      const systemPrompt = buildSystemPrompt({
        instanceUrl: process.env.SERVICENOW_INSTANCE_URL || '',
        userTimezone: 'UTC'
      });
      
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: scenario.message }
      ];
      
      const startTime = Date.now();
      
      try {
        const response = await llmService.generateResponse(messages);
        const processingTime = Date.now() - startTime;
        
        const hasToolCalls = !!(response.toolCalls && response.toolCalls.length > 0);
        const toolNames = response.toolCalls?.map(tc => tc.name) || [];
        
        // Determine if test passed
        let passed = false;
        if (scenario.expectTools) {
          passed = hasToolCalls && (!scenario.expectedTool || toolNames.includes(scenario.expectedTool));
        } else {
          passed = !hasToolCalls;
        }
        
        results.push({
          name: scenario.name,
          passed,
          expectTools: scenario.expectTools,
          expectedTool: scenario.expectedTool,
          hasToolCalls,
          toolNames,
          responseLength: response.message?.length || 0,
          processingTime
        });
        
        logger.info(`${passed ? '✅' : '❌'} Scenario: ${scenario.name}`, {
          passed,
          hasToolCalls,
          toolNames
        });
        
      } catch (error) {
        results.push({
          name: scenario.name,
          passed: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          processingTime: Date.now() - startTime
        });
      }
      
      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    const passedTests = results.filter(r => r.passed).length;
    const totalTests = results.length;
    
    res.json({
      success: passedTests === totalTests,
      results,
      summary: {
        total: totalTests,
        passed: passedTests,
        failed: totalTests - passedTests,
        successRate: Math.round((passedTests / totalTests) * 100)
      }
    });
    
  } catch (error) {
    logger.error('❌ Scenarios test failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;